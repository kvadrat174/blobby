// src/game/WebRTCService.ts
export class WebRTCService {
    private ws: WebSocket;
    private peer: RTCPeerConnection;
    private matchId: string;
    private isHost: boolean;
    private onDataChannel: (dc: RTCDataChannel) => void;

    constructor(serverUrl: string, onDataChannel: (dc: RTCDataChannel) => void) {
        this.ws = new WebSocket(serverUrl);
        this.onDataChannel = onDataChannel;
    }

    async createMatch() {
        this.isHost = true;
        this.ws.send(JSON.stringify({ type: "create" }));

        return new Promise<string>((resolve) => {
            this.ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "created") {
                    this.matchId = data.matchId;
                    console.log("Match created:", data.matchId);
                    resolve(this.matchId);
                } else if (data.type === "guest-joined") {
                    await this.initPeer(true);
                } else if (data.type === "signal" && data.signal.sdp) {
                    await this.peer.setRemoteDescription(data.signal);
                    const answer = await this.peer.createAnswer();
                    await this.peer.setLocalDescription(answer);
                    this.ws.send(JSON.stringify({
                        type: "signal",
                        matchId: this.matchId,
                        from: "host",
                        to: "guest",
                        signal: answer
                    }));
                } else if (data.type === "signal" && data.signal.candidate) {
                    await this.peer.addIceCandidate(data.signal);
                }
            };
        });
    }

    async joinMatch(matchId: string) {
        this.isHost = false;
        this.matchId = matchId;
        this.ws.send(JSON.stringify({ type: "join", matchId }));

        this.ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "joined") {
                await this.initPeer(false);
            } else if (data.type === "signal" && data.signal.sdp) {
                await this.peer.setRemoteDescription(data.signal);
            } else if (data.type === "signal" && data.signal.candidate) {
                await this.peer.addIceCandidate(data.signal);
            }
        };
    }

    private async initPeer(isHost: boolean) {
        this.peer = new RTCPeerConnection({ iceServers: [] });

        if (isHost) {
            const channel = this.peer.createDataChannel("game");
            this.onDataChannel(channel);
        } else {
            this.peer.ondatachannel = (e) => this.onDataChannel(e.channel);
        }

        this.peer.onicecandidate = (e) => {
            if (e.candidate) {
                this.ws.send(JSON.stringify({
                    type: "signal",
                    matchId: this.matchId,
                    from: this.isHost ? "host" : "guest",
                    to: this.isHost ? "guest" : "host",
                    signal: e.candidate
                }));
            }
        };

        if (isHost) {
            const offer = await this.peer.createOffer();
            await this.peer.setLocalDescription(offer);
            this.ws.send(JSON.stringify({
                type: "signal",
                matchId: this.matchId,
                from: "host",
                to: "guest",
                signal: offer
            }));
        }
    }
}
