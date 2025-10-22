// src/game/WebRTCService.ts

export class WebRTCService {
    private ws: WebSocket | null = null;
    private peer: RTCPeerConnection | null = null;
    private matchId: string = "";
    private isHost: boolean = false;
    private onDataChannel: (dc: RTCDataChannel) => void;
    private dataChannel: RTCDataChannel | null = null;
    private serverUrl: string;
    private isConnecting: boolean = false;

    constructor(serverUrl: string, onDataChannel: (dc: RTCDataChannel) => void) {
        this.serverUrl = serverUrl;
        this.onDataChannel = onDataChannel;
    }

    // === ИНИЦИАЛИЗАЦИЯ WEBSOCKET ===
    
    private async ensureWebSocketConnection(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        if (this.isConnecting) {
            // Ждем завершения подключения
            return new Promise((resolve, reject) => {
                const checkInterval = setInterval(() => {
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        clearInterval(checkInterval);
                        resolve();
                    } else if (!this.isConnecting) {
                        clearInterval(checkInterval);
                        reject(new Error("WebSocket connection failed"));
                    }
                }, 100);
                
                setTimeout(() => {
                    clearInterval(checkInterval);
                    reject(new Error("WebSocket connection timeout"));
                }, 5000);
            });
        }

        this.isConnecting = true;

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);

                this.ws.onopen = () => {
                    console.log("WebSocket connected");
                    this.isConnecting = false;
                    resolve();
                };

                this.ws.onerror = (err) => {
                    console.error("WebSocket error:", err);
                    this.isConnecting = false;
                    reject(new Error("WebSocket connection error"));
                };

                this.ws.onclose = () => {
                    console.log("WebSocket closed");
                    this.isConnecting = false;
                };
            } catch (err) {
                this.isConnecting = false;
                reject(err);
            }
        });
    }

    // === ПУБЛИЧНЫЕ ГЕТТЕРЫ ===
    
    public getIsHost(): boolean {
        console.log('getIsHost() called, returning:', this.isHost);
        return this.isHost;
    }

    public getDataChannel(): RTCDataChannel | null {
        return this.dataChannel;
    }

    public getMatchId(): string {
        return this.matchId;
    }

    public getPeerConnection(): RTCPeerConnection | null {
        return this.peer;
    }

    // === ОСНОВНЫЕ МЕТОДЫ ===

    async createMatch(): Promise<string> {
        // Убедимся что WebSocket подключен
        await this.ensureWebSocketConnection();
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket not connected");
        }

        // КРИТИЧНО: Устанавливаем флаг ХОСТА СРАЗУ
        this.isHost = true;
        console.log('=== CREATE MATCH: Setting isHost = TRUE ===');
        
        this.ws.send(JSON.stringify({ type: "create" }));

        return new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Timeout: Server did not respond"));
            }, 10000);

            if (!this.ws) {
                clearTimeout(timeout);
                reject(new Error("WebSocket not available"));
                return;
            }

            this.ws.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === "created") {
                        clearTimeout(timeout);
                        this.matchId = data.matchId;
                        console.log("Match created:", data.matchId, "isHost:", this.isHost);
                        resolve(this.matchId);
                    } else if (data.type === "guest-joined") {
                        console.log("Guest joined, initializing peer connection as HOST...");
                        await this.initPeer(true); // Хост создает offer
                    } else if (data.type === "signal" && data.signal.sdp) {
                        await this.handleSignalSDP(data.signal);
                    } else if (data.type === "signal" && data.signal.candidate) {
                        await this.handleSignalCandidate(data.signal);
                    } else if (data.type === "error") {
                        clearTimeout(timeout);
                        reject(new Error(data.message || "Unknown error"));
                    }
                } catch (err) {
                    console.error("Error handling message:", err);
                }
            };
        });
    }

    async joinMatch(matchId: string): Promise<void> {
        // Убедимся что WebSocket подключен
        await this.ensureWebSocketConnection();
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket not connected");
        }

        // КРИТИЧНО: Устанавливаем флаг ГОСТЯ СРАЗУ
        this.isHost = false;
        console.log('=== JOIN MATCH: Setting isHost = FALSE ===');
        
        this.matchId = matchId;
        
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error('Join match timeout - no response from server');
                reject(new Error("Timeout: Could not join match"));
            }, 15000); // Увеличили до 15 секунд

            if (!this.ws) {
                clearTimeout(timeout);
                reject(new Error("WebSocket not available"));
                return;
            }

            this.ws.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Guest received message:', data.type);
                    
                    if (data.type === "joined") {
                        console.log("✅ Joined match as GUEST, initializing peer connection...");
                        console.log("Before initPeer - isHost:", this.isHost); // Должно быть false
                        await this.initPeer(false); // Гость ждет offer
                        console.log("After initPeer - isHost:", this.isHost); // Должно остаться false
                        clearTimeout(timeout);
                        resolve();
                    } else if (data.type === "signal" && data.signal.sdp) {
                        console.log('Guest received SDP signal:', data.signal.type);
                        await this.handleSignalSDP(data.signal);
                    } else if (data.type === "signal" && data.signal.candidate) {
                        console.log('Guest received ICE candidate');
                        await this.handleSignalCandidate(data.signal);
                    } else if (data.type === "error") {
                        console.error('Server error:', data.message);
                        clearTimeout(timeout);
                        reject(new Error(data.message || "Could not join match"));
                    }
                } catch (err) {
                    console.error("Error handling message:", err);
                }
            };
            
            // Отправляем запрос на присоединение
            console.log('Sending join request for match:', matchId);
            this.ws.send(JSON.stringify({ type: "join", matchId }));
        });
    }

    // === ПРИВАТНЫЕ МЕТОДЫ ===

    private async initPeer(isHostParam: boolean): Promise<void> {
        console.log('=== initPeer called ===');
        console.log('Parameter isHostParam:', isHostParam);
        console.log('Current this.isHost:', this.isHost);
        
        // НЕ перезаписываем this.isHost! Используем только для логики создания peer
        // this.isHost уже установлен в createMatch() или joinMatch()
        
        // Определяем TURN сервер из переменных окружения или используем публичный
        const turnServer = window.location.hostname === 'game.kvadrat.tech'
            ? `turn:${window.location.hostname}:3478`
            : 'turn:openrelay.metered.ca:80';
        
        this.peer = new RTCPeerConnection({ 
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                // TURN сервер для NAT traversal
                {
                    urls: [turnServer],
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ],
            iceCandidatePoolSize: 10
        });

        // Хост создает data channel
        if (isHostParam) {
            console.log('Creating data channel (HOST)');
            const channel = this.peer.createDataChannel("game");
            this.dataChannel = channel;
            this.setupDataChannel(channel);
        } else {
            // Гость ждет data channel от хоста
            console.log('Waiting for data channel (GUEST)');
            this.peer.ondatachannel = (e) => {
                console.log('Data channel received by GUEST');
                this.dataChannel = e.channel;
                this.setupDataChannel(e.channel);
            };
        }

        this.peer.onicecandidate = (e) => {
            if (e.candidate) {
                this.sendSignal(e.candidate);
            }
        };

        this.peer.onconnectionstatechange = () => {
            console.log("Connection state:", this.peer?.connectionState);
        };

        // Хост создает offer
        if (isHostParam) {
            console.log('Creating offer (HOST)');
            const offer = await this.peer.createOffer();
            await this.peer.setLocalDescription(offer);
            this.sendSignal(offer);
        }
        
        console.log('=== initPeer finished, this.isHost:', this.isHost, '===');
    }

    private setupDataChannel(channel: RTCDataChannel): void {
        console.log('=== setupDataChannel called ===');
        console.log('Current isHost:', this.isHost);
        console.log('Match ID:', this.matchId);
        console.log('Channel state:', channel.readyState);
        
        // Добавляем обработчики для отладки
        channel.onopen = () => {
            console.log('*** DATA CHANNEL OPENED ***');
            console.log('I am:', this.isHost ? 'HOST (Player 1 - LEFT)' : 'GUEST (Player 2 - RIGHT)');
            console.log('Match ID:', this.matchId);
        };
        
        channel.onerror = (err) => {
            console.error('Data channel error:', err);
        };
        
        channel.onclose = () => {
            console.log('Data channel closed');
        };
        
        // Вызываем callback который передали в конструктор
        this.onDataChannel(channel);
    }

    private async handleSignalSDP(signal: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peer) {
            console.error("Peer not initialized");
            return;
        }

        console.log("Handling SDP signal:", signal.type, "as", this.isHost ? "HOST" : "GUEST");
        await this.peer.setRemoteDescription(new RTCSessionDescription(signal));

        // Если мы не хост и получили offer - создаем answer
        if (!this.isHost && signal.type === "offer") {
            console.log("Creating answer as GUEST...");
            const answer = await this.peer.createAnswer();
            await this.peer.setLocalDescription(answer);
            this.sendSignal(answer);
            console.log("Answer sent by GUEST");
        }
        // Если мы хост и получили answer - просто устанавливаем
        else if (this.isHost && signal.type === "answer") {
            console.log("Answer received by HOST and set");
        }
    }

    private async handleSignalCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.peer) {
            console.error("Peer not initialized");
            return;
        }

        try {
            await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("Error adding ICE candidate:", err);
        }
    }

    private sendSignal(signal: RTCSessionDescriptionInit | RTCIceCandidate): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error("Cannot send signal: WebSocket not open");
            return;
        }

        this.ws.send(JSON.stringify({
            type: "signal",
            matchId: this.matchId,
            from: this.isHost ? "host" : "guest",
            to: this.isHost ? "guest" : "host",
            signal: signal
        }));
    }

    // === УПРАВЛЕНИЕ СОЕДИНЕНИЕМ ===

    public disconnect(): void {
        console.log("Disconnecting WebRTC service...");

        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        if (this.peer) {
            this.peer.close();
            this.peer = null;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        
        this.ws = null;
        this.matchId = "";
        this.isHost = false;
        this.isConnecting = false;
    }

    public isConnected(): boolean {
        return this.peer?.connectionState === "connected";
    }

    public getConnectionState(): RTCPeerConnectionState | null {
        return this.peer?.connectionState || null;
    }
}