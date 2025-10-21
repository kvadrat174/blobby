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
    background: GameObjects.Image; // Добавляем ссылку на фон

    // Управление
    player1Controls: PlayerControls;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;

    // Счет
    scoreText: Phaser.GameObjects.Text;
    player1Score = 0;
    player2Score = 0;
    private readonly WINNING_SCORE = 11; // Победа при 11 очках

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
        
        this.updateOrientation();
    }

    private updateOrientation() {
        // КРИТИЧНО: Игра ВСЕГДА в ландшафтном режиме
        // Используем БОЛЬШУЮ сторону как ширину, меньшую как высоту
        const currentWidth = this.scale.width || window.innerWidth;
        const currentHeight = this.scale.height || window.innerHeight;
        
        this.FIELD_WIDTH = Math.max(currentWidth, currentHeight);
        this.FIELD_HEIGHT = Math.min(currentWidth, currentHeight);
        
        // Принудительно устанавливаем размеры камеры и scale
        this.scale.resize(this.FIELD_WIDTH, this.FIELD_HEIGHT);
        this.cameras.main.setSize(this.FIELD_WIDTH, this.FIELD_HEIGHT);
        
        console.log('Game orientation updated (LANDSCAPE FORCED):', {
            fieldWidth: this.FIELD_WIDTH,
            fieldHeight: this.FIELD_HEIGHT,
            scaleWidth: this.scale.width,
            scaleHeight: this.scale.height,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            isPortraitDevice: window.innerHeight > window.innerWidth
        });
        
        // Масштабирование на основе высоты (короткой стороны)
        const scale = this.FIELD_HEIGHT / 640;
        const finalScale = Math.max(0.4, Math.min(scale, 2.0));
        
        this.GROUND_HEIGHT = 20 * finalScale;
        this.NET_HEIGHT = this.FIELD_HEIGHT * 0.33;
        this.PLAYER_SCALE = finalScale;
        this.BALL_SCALE = finalScale;
        this.PLAYER_SPEED = 220 * finalScale; // Увеличили с 160 до 220
        
        const gravity = 600 * finalScale;
        const desiredJumpHeight = this.NET_HEIGHT * 1.1;
        this.JUMP_VELOCITY = -Math.sqrt(2 * gravity * desiredJumpHeight);
        
        this.BALL_FORCE = 650 * finalScale; // Увеличили с 500 до 650
        
        console.log('Game parameters:', {
            scale: finalScale,
            playerSpeed: this.PLAYER_SPEED,
            ballForce: this.BALL_FORCE,
            isMultiplayer: this.isMultiplayer,
            isHost: this.isHost,
            isMobile: this.isMobile
        });
    }

    private detectMobile(): boolean {
        // Проверяем через Telegram WebApp
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            const mobilePlatforms = ['android', 'ios', 'android_x', 'ios_x'];
            const isMobilePlatform = mobilePlatforms.includes(tg.platform.toLowerCase());
            console.log('Telegram platform detected:', tg.platform, 'isMobile:', isMobilePlatform);
            return isMobilePlatform;
        }
        
        // Fallback проверка
        const userAgent = navigator.userAgent.toLowerCase();
        const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
        
        const isMobile = mobileRegex.test(userAgent) || 
               ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0);
        
        console.log('Mobile detection:', {
            userAgent: navigator.userAgent,
            isMobile,
            touchSupport: 'ontouchstart' in window,
            maxTouchPoints: navigator.maxTouchPoints
        });
        
        return isMobile;
    }

    create() {
        // Сначала обновляем ориентацию
        this.updateOrientation();
        
        // Устанавливаем границы мира
        this.physics.world.setBounds(0, 0, this.FIELD_WIDTH, this.FIELD_HEIGHT);
        
        console.log('Physics world bounds set:', {
            width: this.FIELD_WIDTH,
            height: this.FIELD_HEIGHT
        });
        
        // Фон - растягиваем с небольшим запасом для избежания черных полос
        this.background = this.add.image(this.FIELD_WIDTH / 2, this.FIELD_HEIGHT / 2, "beach");
        
        // Вычисляем масштаб чтобы фон покрывал всё поле
        const bgTexture = this.textures.get("beach").getSourceImage() as HTMLImageElement;
        const scaleX = this.FIELD_WIDTH / bgTexture.width;
        const scaleY = this.FIELD_HEIGHT / bgTexture.height;
        
        // Используем максимальный масштаб + запас для гарантии покрытия
        const bgScale = Math.max(scaleX, scaleY) * 1.15; // Увеличили с 1.1 до 1.15
        
        this.background.setScale(bgScale);
        this.background.setScrollFactor(0); // Фон не скроллится
        this.background.setDepth(-1); // Фон всегда сзади
        
        console.log('Background scaled:', {
            originalSize: { width: bgTexture.width, height: bgTexture.height },
            fieldSize: { width: this.FIELD_WIDTH, height: this.FIELD_HEIGHT },
            scaleX, scaleY,
            finalScale: bgScale,
            finalSize: { 
                width: bgTexture.width * bgScale, 
                height: bgTexture.height * bgScale 
            },
            covers: {
                width: (bgTexture.width * bgScale) >= this.FIELD_WIDTH,
                height: (bgTexture.height * bgScale) >= this.FIELD_HEIGHT
            }
        });

        // Используем FIELD_HEIGHT (короткую сторону) для всех вертикальных расчетов
        const posScale = this.FIELD_HEIGHT / 640;
        const groundY = this.FIELD_HEIGHT - this.GROUND_HEIGHT / 2;
        const playerY = this.FIELD_HEIGHT - this.GROUND_HEIGHT - 60 * posScale;
        const ballY = this.FIELD_HEIGHT - this.GROUND_HEIGHT - 150 * posScale;
        const gravity = 600 * posScale;
        
        console.log('Create positions:', {
            groundY,
            playerY,
            ballY,
            posScale,
            fieldWidth: this.FIELD_WIDTH,
            fieldHeight: this.FIELD_HEIGHT
        });

        // Сетка - в центре FIELD_WIDTH (широкой стороны)
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
        const bodyWidth = 10 * posScale;
        const bodyHeight = this.NET_HEIGHT;
        netBody.setSize(bodyWidth, bodyHeight);
        netBody.setOffset(
            this.volleyNet.displayWidth / 2 - bodyWidth / 2,
            this.volleyNet.displayHeight / 2 - bodyHeight / 2
        );
        
        console.log('Net created at:', {
            x: this.volleyNet.x,
            y: this.volleyNet.y,
            centerX: this.FIELD_WIDTH / 2,
            bodyWidth,
            bodyHeight
        });

        // Пол
        const ground = this.add.zone(
            this.FIELD_WIDTH / 2,
            groundY,
            this.FIELD_WIDTH,
            this.GROUND_HEIGHT
        );
        this.physics.add.existing(ground, true);

        // Мяч - стартовая позиция относительно FIELD_WIDTH
        const ballStartX = this.FIELD_WIDTH * 0.2;
        this.ball = this.physics.add.sprite(
            ballStartX,
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
        
        console.log('Ball created at:', {
            x: this.ball.x,
            y: this.ball.y,
            expectedX: ballStartX,
            fieldWidth: this.FIELD_WIDTH
        });
        
        this.physics.add.collider(this.ball, ground, () => {
            const scoringPlayer = this.ball.x < this.FIELD_WIDTH / 2 ? this.player2 : this.player1;
            this.handlePointScored(scoringPlayer);
        });
        this.physics.add.collider(this.ball, this.volleyNet, this.handleNetCollision, undefined, this);

        // Игрок 1 - 20% от FIELD_WIDTH (слева)
        const player1StartX = this.FIELD_WIDTH * 0.2;
        this.player1 = this.physics.add.sprite(
            player1StartX,
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
        
        console.log('Player1 created at:', {
            x: this.player1.x,
            y: this.player1.y,
            expectedX: player1StartX,
            netX: this.volleyNet.x
        });

        // Игрок 2 - 80% от FIELD_WIDTH (справа)
        const player2StartX = this.FIELD_WIDTH * 0.8;
        this.player2 = this.physics.add.sprite(
            player2StartX,
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
        
        console.log('Player2 created at:', {
            x: this.player2.x,
            y: this.player2.y,
            expectedX: player2StartX,
            netX: this.volleyNet.x,
            shouldBeRightOfNet: this.player2.x > this.volleyNet.x
        });

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
        // В мультиплеере каждый игрок управляет только своим персонажем на своем устройстве
        // В локальной игре - оба игрока на одном экране
        
        if (this.isMultiplayer) {
            this.createMultiplayerControls();
        } else {
            this.createLocalMultiplayerControls();
        }
    }

    private createMultiplayerControls() {
        // Для онлайн мультиплеера - весь экран для одного игрока
        const isPlayer1 = this.isHost;
        
        console.log('Creating multiplayer controls for:', isPlayer1 ? 'Player 1' : 'Player 2');
        
        // ВСЯ область экрана = зона прыжка
        const jumpZone = this.add.zone(
            this.FIELD_WIDTH / 2, 
            this.FIELD_HEIGHT / 2, 
            this.FIELD_WIDTH, 
            this.FIELD_HEIGHT
        ).setInteractive().setScrollFactor(0);
        
        // Подсказка вверху
        const hintFontSize = Math.max(20, Math.min(28 * (this.FIELD_HEIGHT / 640), 32));
        const hintY = Math.min(60 * (this.FIELD_HEIGHT / 640), 80);
        
        this.add.text(this.FIELD_WIDTH / 2, hintY, 'НАЖМИТЕ ЭКРАН = ПРЫЖОК', {
            fontSize: `${hintFontSize}px`,
            color: isPlayer1 ? '#4444ff' : '#44ff44',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            align: 'center',
            stroke: '#ffffff',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(101);
        
        // Обработчик прыжка на весь экран
        jumpZone.on('pointerdown', () => {
            const player = isPlayer1 ? this.player1 : this.player2;
            if (player.body!.blocked.down) {
                player.setVelocityY(this.JUMP_VELOCITY);
                const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                if (!ballBody.enable) ballBody.enable = true;
                
                if (this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(JSON.stringify({ 
                        type: 'jump', 
                        player: isPlayer1 ? 1 : 2 
                    }));
                }
            }
        });
        
        // Кнопки движения - БОЛЬШИЕ и по центру экрана внизу
        const btnSize = Math.min(120 * (this.FIELD_HEIGHT / 640), 140); // Увеличили размер
        const btnY = this.FIELD_HEIGHT - btnSize / 2 - 30;
        const spacing = btnSize * 0.3;
        const centerX = this.FIELD_WIDTH / 2;
        
        const arrowFontSize = Math.max(48, Math.min(64 * (this.FIELD_HEIGHT / 640), 72));
        
        const leftBtn = this.add.rectangle(
            centerX - btnSize / 2 - spacing / 2, 
            btnY, 
            btnSize, 
            btnSize, 
            isPlayer1 ? 0x4444ff : 0x44ff44, 
            0.7
        ).setInteractive().setScrollFactor(0).setDepth(100);
        
        leftBtn.setStrokeStyle(4, 0xffffff, 0.8);
        
        this.add.text(leftBtn.x, leftBtn.y, '◄', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);
        
        const rightBtn = this.add.rectangle(
            centerX + btnSize / 2 + spacing / 2, 
            btnY, 
            btnSize, 
            btnSize, 
            isPlayer1 ? 0x4444ff : 0x44ff44, 
            0.7
        ).setInteractive().setScrollFactor(0).setDepth(100);
        
        rightBtn.setStrokeStyle(4, 0xffffff, 0.8);
        
        this.add.text(rightBtn.x, rightBtn.y, '►', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);
        
        // События кнопок
        const touchState = isPlayer1 ? this.player1Touch : this.player2Touch;
        
        leftBtn.on('pointerdown', () => {
            touchState.left = true;
            leftBtn.setFillStyle(isPlayer1 ? 0x6666ff : 0x66ff66, 0.9);
        });
        leftBtn.on('pointerup', () => {
            touchState.left = false;
            leftBtn.setFillStyle(isPlayer1 ? 0x4444ff : 0x44ff44, 0.7);
        });
        leftBtn.on('pointerout', () => {
            touchState.left = false;
            leftBtn.setFillStyle(isPlayer1 ? 0x4444ff : 0x44ff44, 0.7);
        });
        
        rightBtn.on('pointerdown', () => {
            touchState.right = true;
            rightBtn.setFillStyle(isPlayer1 ? 0x6666ff : 0x66ff66, 0.9);
        });
        rightBtn.on('pointerup', () => {
            touchState.right = false;
            rightBtn.setFillStyle(isPlayer1 ? 0x4444ff : 0x44ff44, 0.7);
        });
        rightBtn.on('pointerout', () => {
            touchState.right = false;
            rightBtn.setFillStyle(isPlayer1 ? 0x4444ff : 0x44ff44, 0.7);
        });
        
        console.log('Multiplayer controls created:', {
            isPlayer1,
            buttonSize: btnSize,
            buttonPosition: { x: centerX, y: btnY }
        });
    }

    private createLocalMultiplayerControls() {
        // Для локальной игры на одном экране - разделяем экран на две половины
        const halfWidth = this.FIELD_WIDTH / 2;
        const btnSize = Math.min(80 * (this.FIELD_HEIGHT / 640), 80);
        const margin = Math.min(15 * (this.FIELD_HEIGHT / 640), 20);
        const controlsHeight = 120 * (this.FIELD_HEIGHT / 640);
        const jumpZoneHeight = this.FIELD_HEIGHT - controlsHeight - 20;
        
        console.log('Creating local multiplayer controls (LANDSCAPE):', {
            halfWidth,
            fieldWidth: this.FIELD_WIDTH,
            fieldHeight: this.FIELD_HEIGHT
        });
        
        // Зона прыжка игрока 1 - левая половина
        this.player1JumpZone = this.add.zone(halfWidth / 2, jumpZoneHeight / 2, halfWidth, jumpZoneHeight)
            .setInteractive()
            .setScrollFactor(0);
        
        // Зона прыжка игрока 2 - правая половина
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
        
        // Кнопки игрока 1 - слева
        const p1LeftBtn = this.add.rectangle(margin + btnSize / 2, btnY, btnSize, btnSize, 0x4444ff, 0.6)
            .setInteractive()
            .setScrollFactor(0)
            .setDepth(100);
        this.add.text(p1LeftBtn.x, p1LeftBtn.y, '◄', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

        const p1RightBtn = this.add.rectangle(margin * 2 + btnSize * 1.5, btnY, btnSize, btnSize, 0x4444ff, 0.6)
            .setInteractive()
            .setScrollFactor(0)
            .setDepth(100);
        this.add.text(p1RightBtn.x, p1RightBtn.y, '►', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

        // Кнопки игрока 2 - справа
        const p2LeftBtn = this.add.rectangle(this.FIELD_WIDTH - margin * 2 - btnSize * 1.5, btnY, btnSize, btnSize, 0x44ff44, 0.6)
            .setInteractive()
            .setScrollFactor(0)
            .setDepth(100);
        this.add.text(p2LeftBtn.x, p2LeftBtn.y, '◄', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

        const p2RightBtn = this.add.rectangle(this.FIELD_WIDTH - margin - btnSize / 2, btnY, btnSize, btnSize, 0x44ff44, 0.6)
            .setInteractive()
            .setScrollFactor(0)
            .setDepth(100);
        this.add.text(p2RightBtn.x, p2RightBtn.y, '►', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101).setScrollFactor(0);

        // События игрока 1
        this.player1JumpZone.on('pointerdown', () => {
            if (this.player1.body!.blocked.down) {
                this.player1.setVelocityY(this.JUMP_VELOCITY);
                const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                if (!ballBody.enable) ballBody.enable = true;
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
            if (this.player2.body!.blocked.down) {
                this.player2.setVelocityY(this.JUMP_VELOCITY);
                const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                if (!ballBody.enable) ballBody.enable = true;
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
                const lerpFactor = 0.5;
                
                // Player1
                const p1x = this.denormalizeX(data.player1.x);
                const p1y = this.denormalizeY(data.player1.y);
                this.player1.x = this.lerp(this.player1.x, p1x, lerpFactor);
                this.player1.y = this.lerp(this.player1.y, p1y, lerpFactor);
                this.player1.setVelocityX(data.player1.vx * this.PLAYER_SPEED);
                
                // Ball
                const ballX = this.denormalizeX(data.ball.x);
                const ballY = this.denormalizeY(data.ball.y);
                const ballLerpFactor = 0.6;
                this.ball.x = this.lerp(this.ball.x, ballX, ballLerpFactor);
                this.ball.y = this.lerp(this.ball.y, ballY, ballLerpFactor);
                this.ball.setVelocity(
                    data.ball.vx * this.BALL_FORCE * 2,
                    data.ball.vy * this.BALL_FORCE * 2
                );
                this.ball.setAngle(data.ball.angle);
                
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
                const lerpFactor = 0.5;
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
                        const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                        if (!ballBody.enable) ballBody.enable = true;
                    }
                } else if (!this.isHost && data.player === 1) {
                    if (this.player1.body!.blocked.down) {
                        this.player1.setVelocityY(this.JUMP_VELOCITY);
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
            else if (data.type === 'gameOver') {
                console.log('Received gameOver message:', data);
                this.player1Score = data.score.player1;
                this.player2Score = data.score.player2;
                this.scoreText.setText(`${this.player1Score} - ${this.player2Score}`);
                
                // Задержка перед завершением игры
                this.time.delayedCall(1500, () => {
                    this.endGame();
                });
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
                    enabled: ballBody.enable
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
        
        // Проверка победы
        if (this.player1Score >= this.WINNING_SCORE || this.player2Score >= this.WINNING_SCORE) {
            console.log('Game Over! Winner:', this.player1Score >= this.WINNING_SCORE ? 'Player 1' : 'Player 2');
            
            // Отправляем результат второму игроку если это мультиплеер
            if (this.isMultiplayer && this.isHost && this.dataChannel && this.dataChannel.readyState === 'open') {
                this.dataChannel.send(JSON.stringify({
                    type: 'gameOver',
                    winner: this.player1Score >= this.WINNING_SCORE ? 1 : 2,
                    score: {
                        player1: this.player1Score,
                        player2: this.player2Score
                    }
                }));
            }
            
            // Небольшая задержка перед переходом к экрану победы
            this.time.delayedCall(1500, () => {
                this.endGame();
            });
            return;
        }
        
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
        const startY = this.FIELD_HEIGHT - this.GROUND_HEIGHT - 200 * (this.FIELD_HEIGHT / 640);
        
        this.ball.setPosition(startX, startY);
        this.ball.setVelocity(0, 0);
        this.ball.setAngularVelocity(0);
        (this.ball.body as Phaser.Physics.Arcade.Body).enable = false;

        this.touches = 0;
        this.lastToucher = null;
        
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

        // Центр поля (позиция сетки)
        const fieldCenter = this.FIELD_WIDTH / 2;
        const boundary = 30; // отступ от сетки

        // Игрок 1 - не должен заходить за сетку
        if (canControlPlayer1) {
            if (this.isMobile) {
                if (this.player1Touch.left && this.player1.x > 0) {
                    this.player1.setVelocityX(-this.PLAYER_SPEED);
                } else if (this.player1Touch.right && this.player1.x < fieldCenter - boundary) {
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
                } else if (p1Right && this.player1.x < fieldCenter - boundary) {
                    this.player1.setVelocityX(this.PLAYER_SPEED);
                } else {
                    this.player1.setVelocityX(0);
                }
                
                if (p1Jump && this.player1.body!.blocked.down) {
                    this.player1.setVelocityY(this.JUMP_VELOCITY);
                    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                    if (!ballBody.enable) ballBody.enable = true;
                    
                    if (this.isMultiplayer && this.isHost && this.dataChannel && this.dataChannel.readyState === 'open') {
                        this.dataChannel.send(JSON.stringify({ type: 'jump', player: 1 }));
                    }
                }
            }
        }

        // Игрок 2 - не должен заходить за сетку
        if (canControlPlayer2) {
            if (this.isMobile) {
                if (this.player2Touch.left && this.player2.x > fieldCenter + boundary) {
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

                if (p2Left && this.player2.x > fieldCenter + boundary) {
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

    private endGame() {
        console.log('Ending game, returning to main menu');
        
        // Останавливаем физику
        this.physics.pause();
        
        // Показываем результат игры
        const winner = this.player1Score >= this.WINNING_SCORE ? 1 : 2;
        const winnerText = winner === 1 ? 'Игрок 1' : 'Игрок 2';
        
        // Затемнение
        const overlay = this.add.rectangle(
            this.FIELD_WIDTH / 2,
            this.FIELD_HEIGHT / 2,
            this.FIELD_WIDTH,
            this.FIELD_HEIGHT,
            0x000000,
            0.7
        ).setDepth(1000);
        
        const posScale = this.FIELD_HEIGHT / 640;
        const titleSize = Math.round(48 * posScale);
        const textSize = Math.round(32 * posScale);
        
        // Заголовок победы
        const victoryText = this.add.text(
            this.FIELD_WIDTH / 2,
            this.FIELD_HEIGHT * 0.35,
            '🏆 ПОБЕДА! 🏆',
            {
                fontSize: `${titleSize}px`,
                color: '#FFD700',
                fontFamily: 'Arial Black',
                stroke: '#000',
                strokeThickness: 6,
                align: 'center'
            }
        ).setOrigin(0.5).setDepth(1001);
        
        // Победитель
        const resultText = this.add.text(
            this.FIELD_WIDTH / 2,
            this.FIELD_HEIGHT * 0.5,
            `${winnerText} побеждает!\n\n${this.player1Score} - ${this.player2Score}`,
            {
                fontSize: `${textSize}px`,
                color: '#FFF',
                fontFamily: 'Arial',
                align: 'center',
                lineSpacing: 10
            }
        ).setOrigin(0.5).setDepth(1001);
        
        // Автоматический возврат в меню через 3 секунды
        const countdownText = this.add.text(
            this.FIELD_WIDTH / 2,
            this.FIELD_HEIGHT * 0.7,
            'Возврат в меню через 3...',
            {
                fontSize: `${Math.round(20 * posScale)}px`,
                color: '#AAA',
                fontFamily: 'Arial'
            }
        ).setOrigin(0.5).setDepth(1001);
        
        let countdown = 3;
        const timer = this.time.addEvent({
            delay: 1000,
            callback: () => {
                countdown--;
                if (countdown > 0) {
                    countdownText.setText(`Возврат в меню через ${countdown}...`);
                } else {
                    this.returnToMainMenu();
                }
            },
            repeat: 2
        });
    }
    
    private returnToMainMenu() {
        console.log('Returning to main menu');
        
        // Отключаем WebRTC если подключен
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        
        // Возвращаемся в главное меню
        this.scene.start('MainMenu');
    }

    // Обработка изменения размера окна
    resize(gameSize: Phaser.Structs.Size) {
        const width = gameSize.width;
        const height = gameSize.height;
        
        console.log('Game resize event:', { width, height });
        
        // Сохраняем старые размеры для пропорционального пересчета позиций
        const oldWidth = this.FIELD_WIDTH;
        const oldHeight = this.FIELD_HEIGHT;
        
        // Обновляем ориентацию и размеры
        this.updateOrientation();
        
        // Обновляем границы физического мира
        this.physics.world.setBounds(0, 0, this.FIELD_WIDTH, this.FIELD_HEIGHT);
        
        console.log('Physics world bounds updated:', {
            width: this.FIELD_WIDTH,
            height: this.FIELD_HEIGHT
        });
        
        // Пересчитываем позиции объектов пропорционально
        if (this.ball && this.player1 && this.player2 && this.volleyNet && this.scoreText) {
            const scaleX = this.FIELD_WIDTH / oldWidth;
            const scaleY = this.FIELD_HEIGHT / oldHeight;
            
            console.log('Rescaling objects:', { scaleX, scaleY, oldWidth, oldHeight });
            
            // Обновляем фон
            if (this.background) {
                this.background.setPosition(this.FIELD_WIDTH / 2, this.FIELD_HEIGHT / 2);
                
                const bgTexture = this.textures.get("beach").getSourceImage() as HTMLImageElement;
                const bgScaleX = this.FIELD_WIDTH / bgTexture.width;
                const bgScaleY = this.FIELD_HEIGHT / bgTexture.height;
                const bgScale = Math.max(bgScaleX, bgScaleY) * 1.15; // Увеличили до 1.15
                
                this.background.setScale(bgScale);
                
                console.log('Background rescaled:', { 
                    bgScale,
                    covers: {
                        width: (bgTexture.width * bgScale) >= this.FIELD_WIDTH,
                        height: (bgTexture.height * bgScale) >= this.FIELD_HEIGHT
                    }
                });
            }
            
            // Обновляем позиции
            this.ball.x *= scaleX;
            this.ball.y *= scaleY;
            
            this.player1.x *= scaleX;
            this.player1.y *= scaleY;
            
            this.player2.x *= scaleX;
            this.player2.y *= scaleY;
            
            this.volleyNet.x = this.FIELD_WIDTH / 2;
            this.volleyNet.y *= scaleY;
            
            this.scoreText.x = this.FIELD_WIDTH / 2;
            this.scoreText.y *= scaleY;
            
            console.log('Objects repositioned:', {
                ball: { x: this.ball.x, y: this.ball.y },
                player1: { x: this.player1.x, y: this.player1.y },
                player2: { x: this.player2.x, y: this.player2.y },
                net: { x: this.volleyNet.x, y: this.volleyNet.y },
                netIsCenter: Math.abs(this.volleyNet.x - this.FIELD_WIDTH / 2) < 1
            });
        }
    }
}