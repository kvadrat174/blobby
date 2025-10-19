import { EventBus } from "../EventBus";
import { GameObjects, Physics, Scene } from "phaser";

type PlayerControls = {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
};

export class Game extends Scene {
    // Синхронизация
    private syncTimer = 0;
    private SYNC_INTERVAL = 33;

    // Игровые объекты
    ball: Physics.Arcade.Sprite;
    volleyNet: GameObjects.Image;
    player1: Physics.Arcade.Sprite;
    player2: Physics.Arcade.Sprite;

    // Управление
    player1Controls: PlayerControls;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;

    // Счет
    scoreText: Phaser.GameObjects.Text;
    player1Score = 0;
    player2Score = 0;

    private touches = 0;
    private lastToucher: Physics.Arcade.Sprite | null = null;

    // Мобильное управление
    private isMobile = false;
    private player1Touch = { left: false, right: false };
    private player2Touch = { left: false, right: false };
    
    // Touch zones для прыжка
    private player1JumpZone?: Phaser.GameObjects.Zone;
    private player2JumpZone?: Phaser.GameObjects.Zone;

    // WebRTC
    private isMultiplayer = false;
    private isHost = false;
    private dataChannel?: RTCDataChannel;

    // Адаптивные параметры
    private FIELD_WIDTH: number;
    private FIELD_HEIGHT: number;
    private GROUND_HEIGHT: number;
    private NET_HEIGHT: number;
    private PLAYER_SCALE: number;
    private BALL_SCALE: number;
    private PLAYER_SPEED: number;
    private JUMP_VELOCITY: number;
    private BALL_FORCE: number;

    constructor() {
        super("Game");
    }

    init(data: any) {
        this.isMultiplayer = data.isMultiplayer || false;
        this.isHost = data.isHost || false;
        this.dataChannel = data.dataChannel;
        
        this.isMobile = this.detectMobile();
        
        const { width, height } = this.cameras.main;
        
        this.FIELD_WIDTH = width;
        this.FIELD_HEIGHT = height;
        
        const isLandscape = width >= height;
        const scale = isLandscape ? height / 640 : width / 640;
        const finalScale = Math.max(0.4, Math.min(scale, 2.0));
        
        this.GROUND_HEIGHT = 20 * finalScale;
        this.NET_HEIGHT = this.FIELD_HEIGHT * 0.33;
        this.PLAYER_SCALE = finalScale;
        this.BALL_SCALE = finalScale;
        this.PLAYER_SPEED = 160 * finalScale;
        
        const gravity = 600 * finalScale;
        const desiredJumpHeight = this.NET_HEIGHT * 1.1;
        this.JUMP_VELOCITY = -Math.sqrt(2 * gravity * desiredJumpHeight);
        
        this.BALL_FORCE = 500 * finalScale;
        
        console.log('Game initialized:', {
            width: this.FIELD_WIDTH,
            height: this.FIELD_HEIGHT,
            scale: finalScale,
            isMultiplayer: this.isMultiplayer,
            isHost: this.isHost
        });
    }

    private detectMobile(): boolean {
        // Проверяем через Telegram WebApp
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            const mobilePlatforms = ['android', 'ios', 'android_x', 'ios_x'];
            return mobilePlatforms.includes(tg.platform.toLowerCase());
        }
        
        // Fallback проверка
        const userAgent = navigator.userAgent.toLowerCase();
        const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
        
        return mobileRegex.test(userAgent) || 
               ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0);
    }

    create() {
        const bg = this.add.image(this.FIELD_WIDTH / 2, this.FIELD_HEIGHT / 2, "beach");
        bg.setDisplaySize(this.FIELD_WIDTH, this.FIELD_HEIGHT);

        const posScale = this.FIELD_HEIGHT / 640;
        const groundY = this.FIELD_HEIGHT - this.GROUND_HEIGHT / 2;
        const playerY = this.FIELD_HEIGHT - this.GROUND_HEIGHT - 60 * posScale;
        const ballY = this.FIELD_HEIGHT - this.GROUND_HEIGHT - 150 * posScale;
        const gravity = 600 * posScale;

        // Сетка
        const netCenterY = groundY - this.NET_HEIGHT / 2;
        this.volleyNet = this.physics.add.staticImage(
            this.FIELD_WIDTH / 2,
            netCenterY,
            "volley-net"
        );

        const netTexture = this.textures.get("volley-net").getSourceImage() as HTMLImageElement;
        const netScaleY = this.NET_HEIGHT / netTexture.height;
        this.volleyNet.setScale(netScaleY);
        this.volleyNet.setOrigin(0.5, 0.5);
        (this.volleyNet as Phaser.Types.Physics.Arcade.ImageWithStaticBody).refreshBody();

        const netBody = this.volleyNet.body as Phaser.Physics.Arcade.Body;
        const bodyWidth = 10 * (this.FIELD_HEIGHT / 640);
        const bodyHeight = this.NET_HEIGHT;
        netBody.setSize(bodyWidth, bodyHeight);
        netBody.setOffset(
            this.volleyNet.displayWidth / 2 - bodyWidth / 2,
            this.volleyNet.displayHeight / 2 - bodyHeight / 2
        );

        // Пол
        const ground = this.add.zone(
            this.FIELD_WIDTH / 2,
            groundY,
            this.FIELD_WIDTH,
            this.GROUND_HEIGHT
        );
        this.physics.add.existing(ground, true);

        // Мяч
        this.ball = this.physics.add.sprite(
            this.FIELD_WIDTH * 0.2,
            ballY,
            "ball"
        );
        this.ball
            .setScale(this.BALL_SCALE)
            .setBounce(0.85, 0.85)
            .setCollideWorldBounds(true)
            .setGravityY(gravity * 0.5);
        
        const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
        ballBody.setDrag(20, 0);
        ballBody.setMaxVelocity(800 * posScale, 800 * posScale);
        
        this.physics.add.collider(this.ball, ground, () => {
            const scoringPlayer = this.ball.x < this.FIELD_WIDTH / 2 ? this.player2 : this.player1;
            this.handlePointScored(scoringPlayer);
        });
        this.physics.add.collider(this.ball, this.volleyNet, this.handleNetCollision, undefined, this);

        // Игрок 1
        this.player1 = this.physics.add.sprite(
            this.FIELD_WIDTH * 0.2,
            playerY,
            "playerLeft"
        );
        this.player1
            .setScale(this.PLAYER_SCALE)
            .setBounce(0.2)
            .setCollideWorldBounds(true)
            .setGravityY(gravity);
        this.physics.add.collider(this.player1, ground);
        this.physics.add.collider(this.player1, this.volleyNet);

        // Игрок 2
        this.player2 = this.physics.add.sprite(
            this.FIELD_WIDTH * 0.8,
            playerY,
            "playerRight"
        );
        this.player2
            .setScale(this.PLAYER_SCALE)
            .setBounce(0.2)
            .setCollideWorldBounds(true)
            .setGravityY(gravity);
        this.physics.add.collider(this.player2, ground);
        this.physics.add.collider(this.player2, this.volleyNet);

        // Коллизия мяча с игроками
        this.physics.add.collider(this.ball, this.player1, () => this.hitBall(this.player1));
        this.physics.add.collider(this.ball, this.player2, () => this.hitBall(this.player2));

        // Управление
        if (!this.isMobile) {
            this.cursors = this.input.keyboard!.createCursorKeys();
            this.player1Controls = this.input.keyboard!.addKeys({
                up: Phaser.Input.Keyboard.KeyCodes.W,
                down: Phaser.Input.Keyboard.KeyCodes.S,
                left: Phaser.Input.Keyboard.KeyCodes.A,
                right: Phaser.Input.Keyboard.KeyCodes.D,
            }) as PlayerControls;
        } else {
            this.createMobileControls();
        }

        // Счёт
        const fontSize = Math.round(32 * posScale);
        this.scoreText = this.add
            .text(this.FIELD_WIDTH / 2, 50 * posScale, "0 - 0", {
                fontSize: `${fontSize}px`,
                color: "#FFF",
                fontFamily: "Arial",
            })
            .setOrigin(0.5);

        // WebRTC
        if (this.isMultiplayer && this.dataChannel) {
            this.setupDataChannel();
        }

        EventBus.emit("current-scene-ready", this);
    }

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

    private lerp(start: number, end: number, factor: number): number {
        return start + (end - start) * factor;
    }

    private normalizeX(x: number): number {
        return x / this.FIELD_WIDTH;
    }

    private normalizeY(y: number): number {
        return y / this.FIELD_HEIGHT;
    }

    private denormalizeX(nx: number): number {
        return nx * this.FIELD_WIDTH;
    }

    private denormalizeY(ny: number): number {
        return ny * this.FIELD_HEIGHT;
    }

    // === МОБИЛЬНОЕ УПРАВЛЕНИЕ ===

    private createMobileControls() {
        const halfWidth = this.FIELD_WIDTH / 2;
        const btnSize = Math.min(80 * (this.FIELD_HEIGHT / 640), 80);
        const margin = Math.min(15 * (this.FIELD_HEIGHT / 640), 20);
        const controlsHeight = 120 * (this.FIELD_HEIGHT / 640);
        const jumpZoneHeight = this.FIELD_HEIGHT - controlsHeight - 20;
        
        this.player1JumpZone = this.add.zone(halfWidth / 2, jumpZoneHeight / 2, halfWidth, jumpZoneHeight)
            .setInteractive()
            .setScrollFactor(0);
        
        this.player2JumpZone = this.add.zone(halfWidth + halfWidth / 2, jumpZoneHeight / 2, halfWidth, jumpZoneHeight)
            .setInteractive()
            .setScrollFactor(0);

        const zoneGraphics = this.add.graphics();
        zoneGraphics.fillStyle(0x4444ff, 0.05);
        zoneGraphics.fillRect(0, 0, halfWidth, jumpZoneHeight);
        zoneGraphics.fillStyle(0x44ff44, 0.05);
        zoneGraphics.fillRect(halfWidth, 0, halfWidth, jumpZoneHeight);
        zoneGraphics.setDepth(50);

        const hintFontSize = Math.max(16, Math.min(20 * (this.FIELD_HEIGHT / 640), 24));
        const hintY = Math.min(60 * (this.FIELD_HEIGHT / 640), 80);
        
        this.add.text(halfWidth / 2, hintY, 'ТАП = ПРЫЖОК', {
            fontSize: `${hintFontSize}px`,
            color: '#4444ff',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            align: 'center',
            stroke: '#ffffff',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(101);

        this.add.text(halfWidth + halfWidth / 2, hintY, 'ТАП = ПРЫЖОК', {
            fontSize: `${hintFontSize}px`,
            color: '#44ff44',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            align: 'center',
            stroke: '#ffffff',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(101);

        const arrowFontSize = Math.max(32, Math.min(40 * (this.FIELD_HEIGHT / 640), 48));
        const btnY = this.FIELD_HEIGHT - margin - btnSize / 2;
        
        // Кнопки игрока 1
        const p1LeftBtn = this.add.rectangle(margin + btnSize / 2, btnY, btnSize, btnSize, 0x4444ff, 0.6)
            .setInteractive().setScrollFactor(0).setDepth(100);
        this.add.text(p1LeftBtn.x, p1LeftBtn.y, '◄', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        const p1RightBtn = this.add.rectangle(margin * 2 + btnSize * 1.5, btnY, btnSize, btnSize, 0x4444ff, 0.6)
            .setInteractive().setScrollFactor(0).setDepth(100);
        this.add.text(p1RightBtn.x, p1RightBtn.y, '►', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        // Кнопки игрока 2
        const p2LeftBtn = this.add.rectangle(this.FIELD_WIDTH - margin * 2 - btnSize * 1.5, btnY, btnSize, btnSize, 0x44ff44, 0.6)
            .setInteractive().setScrollFactor(0).setDepth(100);
        this.add.text(p2LeftBtn.x, p2LeftBtn.y, '◄', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        const p2RightBtn = this.add.rectangle(this.FIELD_WIDTH - margin - btnSize / 2, btnY, btnSize, btnSize, 0x44ff44, 0.6)
            .setInteractive().setScrollFactor(0).setDepth(100);
        this.add.text(p2RightBtn.x, p2RightBtn.y, '►', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        // События игрока 1
        this.player1JumpZone.on('pointerdown', () => {
            if (!this.isMultiplayer || this.isHost) {
                if (this.player1.body!.blocked.down) {
                    this.player1.setVelocityY(this.JUMP_VELOCITY);
                    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                    if (!ballBody.enable) ballBody.enable = true;
                    
                    if (this.isMultiplayer && this.dataChannel && this.dataChannel.readyState === 'open') {
                        this.dataChannel.send(JSON.stringify({ type: 'jump', player: 1 }));
                    }
                }
            }
        });

        p1LeftBtn.on('pointerdown', () => {
            this.player1Touch.left = true;
            p1LeftBtn.setFillStyle(0x6666ff, 0.8);
        });
        p1LeftBtn.on('pointerup', () => {
            this.player1Touch.left = false;
            p1LeftBtn.setFillStyle(0x4444ff, 0.6);
        });
        p1LeftBtn.on('pointerout', () => {
            this.player1Touch.left = false;
            p1LeftBtn.setFillStyle(0x4444ff, 0.6);
        });

        p1RightBtn.on('pointerdown', () => {
            this.player1Touch.right = true;
            p1RightBtn.setFillStyle(0x6666ff, 0.8);
        });
        p1RightBtn.on('pointerup', () => {
            this.player1Touch.right = false;
            p1RightBtn.setFillStyle(0x4444ff, 0.6);
        });
        p1RightBtn.on('pointerout', () => {
            this.player1Touch.right = false;
            p1RightBtn.setFillStyle(0x4444ff, 0.6);
        });

        // События игрока 2
        this.player2JumpZone.on('pointerdown', () => {
            if (!this.isMultiplayer || !this.isHost) {
                if (this.player2.body!.blocked.down) {
                    this.player2.setVelocityY(this.JUMP_VELOCITY);
                    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                    if (!ballBody.enable) ballBody.enable = true;
                    
                    if (this.isMultiplayer && this.dataChannel && this.dataChannel.readyState === 'open') {
                        this.dataChannel.send(JSON.stringify({ type: 'jump', player: 2 }));
                    }
                }
            }
        });

        p2LeftBtn.on('pointerdown', () => {
            this.player2Touch.left = true;
            p2LeftBtn.setFillStyle(0x66ff66, 0.8);
        });
        p2LeftBtn.on('pointerup', () => {
            this.player2Touch.left = false;
            p2LeftBtn.setFillStyle(0x44ff44, 0.6);
        });
        p2LeftBtn.on('pointerout', () => {
            this.player2Touch.left = false;
            p2LeftBtn.setFillStyle(0x44ff44, 0.6);
        });

        p2RightBtn.on('pointerdown', () => {
            this.player2Touch.right = true;
            p2RightBtn.setFillStyle(0x66ff66, 0.8);
        });
        p2RightBtn.on('pointerup', () => {
            this.player2Touch.right = false;
            p2RightBtn.setFillStyle(0x44ff44, 0.6);
        });
        p2RightBtn.on('pointerout', () => {
            this.player2Touch.right = false;
            p2RightBtn.setFillStyle(0x44ff44, 0.6);
        });
    }

    // === WEBRTC СИНХРОНИЗАЦИЯ ===

    private setupDataChannel() {
        if (!this.dataChannel) return;

        this.dataChannel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'gameState' && !this.isHost) {
                const lerpFactor = 0.5; // Увеличили с 0.3 до 0.5
                
                // Player1
                const p1x = this.denormalizeX(data.player1.x);
                const p1y = this.denormalizeY(data.player1.y);
                this.player1.x = this.lerp(this.player1.x, p1x, lerpFactor);
                this.player1.y = this.lerp(this.player1.y, p1y, lerpFactor);
                this.player1.setVelocityX(data.player1.vx * this.PLAYER_SPEED);
                
                // Ball
                const ballX = this.denormalizeX(data.ball.x);
                const ballY = this.denormalizeY(data.ball.y);
                const ballLerpFactor = 0.6; // Увеличили с 0.4 до 0.6
                this.ball.x = this.lerp(this.ball.x, ballX, ballLerpFactor);
                this.ball.y = this.lerp(this.ball.y, ballY, ballLerpFactor);
                this.ball.setVelocity(
                    data.ball.vx * this.BALL_FORCE * 2,
                    data.ball.vy * this.BALL_FORCE * 2
                );
                this.ball.setAngle(data.ball.angle);
                
                // ВАЖНО: Синхронизируем состояние enable мяча
                const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                if (data.ball.enabled !== undefined) {
                    ballBody.enable = data.ball.enabled;
                }
                
                // Score
                this.player1Score = data.score.player1;
                this.player2Score = data.score.player2;
                this.scoreText.setText(`${this.player1Score} - ${this.player2Score}`);
                this.touches = data.touches;
            } 
            else if (data.type === 'playerState' && this.isHost) {
                const lerpFactor = 0.5; // Увеличили с 0.3
                const p2x = this.denormalizeX(data.player2.x);
                const p2y = this.denormalizeY(data.player2.y);
                this.player2.x = this.lerp(this.player2.x, p2x, lerpFactor);
                this.player2.y = this.lerp(this.player2.y, p2y, lerpFactor);
                this.player2.setVelocityX(data.player2.vx * this.PLAYER_SPEED);
            }
            else if (data.type === 'ballHit' && !this.isHost) {
                const ballX = this.denormalizeX(data.ball.x);
                const ballY = this.denormalizeY(data.ball.y);
                const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                
                this.ball.setPosition(ballX, ballY);
                this.ball.setVelocity(
                    data.ball.vx * this.BALL_FORCE * 2,
                    data.ball.vy * this.BALL_FORCE * 2
                );
                this.ball.setAngle(data.ball.angle);
                ballBody.angularVelocity = data.ball.angularVelocity;
                this.touches = data.touches;
            }
            else if (data.type === 'jump') {
                if (this.isHost && data.player === 2) {
                    if (this.player2.body!.blocked.down) {
                        this.player2.setVelocityY(this.JUMP_VELOCITY);
                        
                        // ВАЖНО: HOST активирует мяч при прыжке GUEST
                        const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                        if (!ballBody.enable) ballBody.enable = true;
                    }
                } else if (!this.isHost && data.player === 1) {
                    if (this.player1.body!.blocked.down) {
                        this.player1.setVelocityY(this.JUMP_VELOCITY);
                        
                        // GUEST активирует мяч при прыжке HOST
                        const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                        if (!ballBody.enable) ballBody.enable = true;
                    }
                }
            }
            else if (data.type === 'ballReset') {
                const ballX = this.denormalizeX(data.x);
                const ballY = this.denormalizeY(data.y);
                this.ball.setPosition(ballX, ballY);
                this.ball.setVelocity(0, 0);
                this.ball.setAngularVelocity(0);
                (this.ball.body as Phaser.Physics.Arcade.Body).enable = false;
            }
            else if (data.type === 'scoreUpdate' && !this.isHost) {
                this.player1Score = data.score.player1;
                this.player2Score = data.score.player2;
                this.scoreText.setText(`${this.player1Score} - ${this.player2Score}`);
            }
        };
    }

    private sendGameState() {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
        
        if (this.isHost) {
            const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
            const state = {
                type: 'gameState',
                player1: {
                    x: this.normalizeX(this.player1.x),
                    y: this.normalizeY(this.player1.y),
                    vx: this.player1.body!.velocity.x / this.PLAYER_SPEED
                },
                ball: {
                    x: this.normalizeX(this.ball.x),
                    y: this.normalizeY(this.ball.y),
                    vx: ballBody.velocity.x / (this.BALL_FORCE * 2),
                    vy: ballBody.velocity.y / (this.BALL_FORCE * 2),
                    angle: this.ball.angle,
                    enabled: ballBody.enable // ВАЖНО: передаем состояние enable
                },
                score: {
                    player1: this.player1Score,
                    player2: this.player2Score
                },
                touches: this.touches
            };
            this.dataChannel.send(JSON.stringify(state));
        } else {
            const state = {
                type: 'playerState',
                player2: {
                    x: this.normalizeX(this.player2.x),
                    y: this.normalizeY(this.player2.y),
                    vx: this.player2.body!.velocity.x / this.PLAYER_SPEED
                }
            };
            this.dataChannel.send(JSON.stringify(state));
        }
    }

    // === ИГРОВАЯ ЛОГИКА ===

    private handleNetCollision() {
        const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
        const ballFromLeft = this.ball.x < this.volleyNet.x;
        const direction = ballFromLeft ? -1 : 1;
        const verticalVelocity = ballBody.velocity.y * 0.7;

        ballBody.setVelocity(
            direction * this.BALL_FORCE * 0.8 + (Math.random() * 50 - 25),
            verticalVelocity
        );

        this.ball.setAngularVelocity(direction * 100);
    }

    private hitBall(player: Physics.Arcade.Sprite) {
        if (this.lastToucher !== player) {
            this.touches = 0;
            this.lastToucher = player;
        }

        this.touches++;

        if (this.touches > 3) {
            this.handlePointScored(player === this.player1 ? this.player2 : this.player1);
            return;
        }

        const angle = Phaser.Math.Angle.Between(player.x, player.y, this.ball.x, this.ball.y);
        const forceX = Math.cos(angle) * this.BALL_FORCE;
        const forceY = Math.sin(angle) * this.BALL_FORCE * 0.7;
        
        this.ball.setVelocity(forceX, forceY);
        this.ball.setAngularVelocity((forceX / 5) * (this.FIELD_HEIGHT / 640));
        
        // HOST отправляет событие удара немедленно
        if (this.isMultiplayer && this.isHost && this.dataChannel && this.dataChannel.readyState === 'open') {
            const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
            this.dataChannel.send(JSON.stringify({
                type: 'ballHit',
                ball: {
                    x: this.normalizeX(this.ball.x),
                    y: this.normalizeY(this.ball.y),
                    vx: ballBody.velocity.x / (this.BALL_FORCE * 2),
                    vy: ballBody.velocity.y / (this.BALL_FORCE * 2),
                    angle: this.ball.angle,
                    angularVelocity: ballBody.angularVelocity
                },
                touches: this.touches
            }));
        }
    }

    private handlePointScored(scoringPlayer?: Physics.Arcade.Sprite) {
        if (!scoringPlayer) {
            scoringPlayer = this.ball.x < this.FIELD_WIDTH / 2 ? this.player2 : this.player1;
        }

        if (scoringPlayer === this.player1) {
            this.player1Score++;
        } else {
            this.player2Score++;
        }

        this.scoreText.setText(`${this.player1Score} - ${this.player2Score}`);
        
        // HOST отправляет обновление счета
        if (this.isMultiplayer && this.isHost && this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'scoreUpdate',
                score: {
                    player1: this.player1Score,
                    player2: this.player2Score
                }
            }));
        }
        
        this.resetBall(scoringPlayer);
    }

    private resetBall(scoringPlayer: Physics.Arcade.Sprite) {
        const startX = scoringPlayer === this.player1 ? this.FIELD_WIDTH * 0.2 : this.FIELD_WIDTH * 0.8;
        const startY = this.FIELD_HEIGHT - this.GROUND_HEIGHT - 200 * (this.FIELD_WIDTH / 1024);
        this.ball.setPosition(startX, startY);
        this.ball.setVelocity(0, 0);
        this.ball.setAngularVelocity(0);
        (this.ball.body as Phaser.Physics.Arcade.Body).enable = false;

        this.touches = 0;
        this.lastToucher = null;
        
        // HOST отправляет сброс мяча
        if (this.isMultiplayer && this.isHost && this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'ballReset',
                x: this.normalizeX(startX),
                y: this.normalizeY(startY)
            }));
        }
    }

    // === UPDATE LOOP ===

    update(_time: number, delta: number) {
        const canControlPlayer1 = !this.isMultiplayer || this.isHost;
        const canControlPlayer2 = !this.isMultiplayer || !this.isHost;

        // Игрок 1
        if (canControlPlayer1) {
            if (this.isMobile) {
                if (this.player1Touch.left && this.player1.x > 0) {
                    this.player1.setVelocityX(-this.PLAYER_SPEED);
                } else if (this.player1Touch.right && this.player1.x < this.FIELD_WIDTH / 2 - 30) {
                    this.player1.setVelocityX(this.PLAYER_SPEED);
                } else {
                    this.player1.setVelocityX(0);
                }
            } else {
                const p1Left = this.player1Controls?.left.isDown;
                const p1Right = this.player1Controls?.right.isDown;
                const p1Jump = this.player1Controls?.up.isDown;

                if (p1Left && this.player1.x > 0) {
                    this.player1.setVelocityX(-this.PLAYER_SPEED);
                } else if (p1Right && this.player1.x < this.FIELD_WIDTH / 2 - 30) {
                    this.player1.setVelocityX(this.PLAYER_SPEED);
                } else {
                    this.player1.setVelocityX(0);
                }
                
                if (p1Jump && this.player1.body!.blocked.down) {
                    this.player1.setVelocityY(this.JUMP_VELOCITY);
                    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                    if (!ballBody.enable) ballBody.enable = true;
                    
                    // HOST отправляет событие прыжка GUEST
                    if (this.isMultiplayer && this.isHost && this.dataChannel && this.dataChannel.readyState === 'open') {
                        this.dataChannel.send(JSON.stringify({ type: 'jump', player: 1 }));
                    }
                }
            }
        }

        // Игрок 2
        if (canControlPlayer2) {
            if (this.isMobile) {
                if (this.player2Touch.left && this.player2.x > this.FIELD_WIDTH / 2 + 30) {
                    this.player2.setVelocityX(-this.PLAYER_SPEED);
                } else if (this.player2Touch.right && this.player2.x < this.FIELD_WIDTH) {
                    this.player2.setVelocityX(this.PLAYER_SPEED);
                } else {
                    this.player2.setVelocityX(0);
                }
            } else {
                const p2Left = this.cursors?.left.isDown;
                const p2Right = this.cursors?.right.isDown;
                const p2Jump = this.cursors?.up.isDown;

                if (p2Left && this.player2.x > this.FIELD_WIDTH / 2 + 30) {
                    this.player2.setVelocityX(-this.PLAYER_SPEED);
                } else if (p2Right && this.player2.x < this.FIELD_WIDTH) {
                    this.player2.setVelocityX(this.PLAYER_SPEED);
                } else {
                    this.player2.setVelocityX(0);
                }
                
                if (p2Jump && this.player2.body!.blocked.down) {
                    this.player2.setVelocityY(this.JUMP_VELOCITY);
                    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                    if (!ballBody.enable) ballBody.enable = true;
                    
                    // GUEST отправляет событие прыжка HOST
                    if (this.isMultiplayer && !this.isHost && this.dataChannel && this.dataChannel.readyState === 'open') {
                        this.dataChannel.send(JSON.stringify({ type: 'jump', player: 2 }));
                    }
                }
            }
        }

        // WebRTC синхронизация
        if (this.isMultiplayer && this.dataChannel && this.dataChannel.readyState === 'open') {
            this.syncTimer += delta;
            
            if (this.syncTimer >= this.SYNC_INTERVAL) {
                this.syncTimer = 0;
                this.sendGameState();
            }
        }

        // Проверка выхода мяча за пределы
        if (this.ball.y > this.FIELD_HEIGHT || this.ball.y < 0) {
            this.handlePointScored();
        }
    }

    changeScene() {
        this.scene.start("GameOver");
    }
}