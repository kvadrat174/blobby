// src/game/webrtc-config.ts

export function getICEServers(): RTCIceServer[] {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isDev) {
        // Локальная разработка - используем публичные серверы
        return [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            {
                urls: [
                    "turn:openrelay.metered.ca:80",
                    "turn:openrelay.metered.ca:443",
                    "turn:openrelay.metered.ca:443?transport=tcp"
                ],
                username: "openrelayproject",
                credential: "openrelayproject"
            }
        ];
    } else {
        // Продакшн - используем свой TURN сервер
        return [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            {
                urls: [
                    `turn:${window.location.hostname}:3478`,
                    `turn:${window.location.hostname}:3478?transport=tcp`
                ],
                username: "volleyball",
                credential: "SecurePassword123!ChangeMe"
            }
        ];
    }
}

export const webrtcConfig: RTCConfiguration = {
    iceServers: getICEServers(),
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all', // Попробовать все пути (STUN + TURN)
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};