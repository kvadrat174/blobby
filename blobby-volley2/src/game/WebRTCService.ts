// src/game/WebRTCService.ts
export class WebRTCService {
    private ws: WebSocket;
    private peer: RTCPeerConnection | null = null;
    private matchId: string = "";
    private isHost: boolean = false;
    private onDataChannel: (dc: RTCDataChannel) => void;
    private dataChannel: RTCDataChannel | null = null;

    constructor(serverUrl: string, onDataChannel: (dc: RTCDataChannel) => void) {
        this.ws = new WebSocket(serverUrl);
        this.onDataChannel = onDataChannel;
    }

    // === ПУБЛИЧНЫЕ ГЕТТЕРЫ ===
    
    public getIsHost(): boolean {
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
        this.isHost = true;
        this.ws.send(JSON.stringify({ type: "create" }));

        return new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Timeout: Server did not respond"));
            }, 10000);

            this.ws.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === "created") {
                        clearTimeout(timeout);
                        this.matchId = data.matchId;
                        console.log("Match created:", data.matchId);
                        resolve(this.matchId);
                    } else if (data.type === "guest-joined") {
                        console.log("Guest joined, initializing peer connection...");
                        await this.initPeer(true);
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

            this.ws.onerror = (err) => {
                clearTimeout(timeout);
                reject(new Error("WebSocket error"));
            };
        });
    }

    async joinMatch(matchId: string): Promise<void> {
        this.isHost = false;
        this.matchId = matchId;
        this.ws.send(JSON.stringify({ type: "join", matchId }));

        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Timeout: Could not join match"));
            }, 10000);

            this.ws.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === "joined") {
                        console.log("Joined match, initializing peer connection...");
                        await this.initPeer(false);
                        clearTimeout(timeout);
                        resolve();
                    } else if (data.type === "signal" && data.signal.sdp) {
                        await this.handleSignalSDP(data.signal);
                    } else if (data.type === "signal" && data.signal.candidate) {
                        await this.handleSignalCandidate(data.signal);
                    } else if (data.type === "error") {
                        clearTimeout(timeout);
                        reject(new Error(data.message || "Could not join match"));
                    }
                } catch (err) {
                    console.error("Error handling message:", err);
                }
            };

            this.ws.onerror = (err) => {
                clearTimeout(timeout);
                reject(new Error("WebSocket error"));
            };
        });
    }

    // === ПРИВАТНЫЕ МЕТОДЫ ===

    private async initPeer(isHost: boolean): Promise<void> {
        this.peer = new RTCPeerConnection({ 
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ] 
        });

        if (isHost) {
            const channel = this.peer.createDataChannel("game");
            this.dataChannel = channel;
            this.setupDataChannel(channel);
        } else {
            this.peer.ondatachannel = (e) => {
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

        if (isHost) {
            const offer = await this.peer.createOffer();
            await this.peer.setLocalDescription(offer);
            this.sendSignal(offer);
        }
    }

    private setupDataChannel(channel: RTCDataChannel): void {
        console.log("Setting up data channel...");
        this.onDataChannel(channel);
    }

    private async handleSignalSDP(signal: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peer) {
            console.error("Peer not initialized");
            return;
        }

        await this.peer.setRemoteDescription(signal);

        if (this.isHost && signal.type === "offer") {
            const answer = await this.peer.createAnswer();
            await this.peer.setLocalDescription(answer);
            this.sendSignal(answer);
        } else if (!this.isHost && signal.type === "answer") {
            // Answer already set as remote description
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

        this.matchId = "";
        this.isHost = false;
    }

    public isConnected(): boolean {
        return this.peer?.connectionState === "connected";
    }

    public getConnectionState(): RTCPeerConnectionState | null {
        return this.peer?.connectionState || null;
    }
}