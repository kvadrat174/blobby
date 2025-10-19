import { EventBus } from "../EventBus";
import { GameObjects, Physics, Scene } from "phaser";

type PlayerControls = {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
};

export class Game extends Scene {
    ball: Physics.Arcade.Sprite;
    volleyNet: GameObjects.Image;
    player1: Physics.Arcade.Sprite;
    player2: Physics.Arcade.Sprite;

    player1Controls: PlayerControls;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;

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

    // Адаптивные параметры (вычисляются в init)
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
        
        // Определяем мобильное устройство
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Получаем размеры экрана
        const { width, height } = this.cameras.main;
        
        this.FIELD_WIDTH = width;
        this.FIELD_HEIGHT = height;
        
        // Для landscape используем высоту как базу, для portrait - ширину
        const isLandscape = width >= height;
        const scale = isLandscape ? height / 640 : width / 640;
        
        // Ограничиваем масштаб для стабильности
        const finalScale = Math.max(0.4, Math.min(scale, 2.0));
        
        this.GROUND_HEIGHT = 20 * finalScale;
        this.NET_HEIGHT = this.FIELD_HEIGHT * 0.33;
        this.PLAYER_SCALE = finalScale;
        this.BALL_SCALE = finalScale;
        this.PLAYER_SPEED = 160 * finalScale;
        
        // ВАЖНО: Сила прыжка должна быть больше, чем просто высота!
        // Используем физическую формулу: v = √(2 * g * h)
        const gravity = 600 * finalScale;
        const desiredJumpHeight = this.NET_HEIGHT * 1.1; // Чуть выше сетки
        this.JUMP_VELOCITY = -Math.sqrt(2 * gravity * desiredJumpHeight);
        
        this.BALL_FORCE = 500 * finalScale;
        
        console.log('Game dimensions:', {
            width: this.FIELD_WIDTH,
            height: this.FIELD_HEIGHT,
            scale: finalScale,
            isLandscape: isLandscape,
            isMobile: this.isMobile,
            netHeight: this.NET_HEIGHT,
            jumpVelocity: this.JUMP_VELOCITY,
            gravity: gravity
        });
        
        console.log('Game dimensions:', {
            width: this.FIELD_WIDTH,
            height: this.FIELD_HEIGHT,
            scale: finalScale,
            isLandscape: isLandscape,
            isMobile: this.isMobile
        });
    }

    create() {
        // Фон (растянуть на весь экран)
        const bg = this.add.image(this.FIELD_WIDTH / 2, this.FIELD_HEIGHT / 2, "beach");
        bg.setDisplaySize(this.FIELD_WIDTH, this.FIELD_HEIGHT);

        // Вычисляем масштаб для позиционирования
        const posScale = this.FIELD_HEIGHT / 640;
        
        // Вычисляем правильные позиции
        const groundY = this.FIELD_HEIGHT - this.GROUND_HEIGHT / 2;
        const netY = this.FIELD_HEIGHT;
        const playerY = this.FIELD_HEIGHT - this.GROUND_HEIGHT - 60 * posScale;
        const ballY = this.FIELD_HEIGHT - this.GROUND_HEIGHT - 150 * posScale;
        
        // ВАЖНО: Гравитация теперь привязана к finalScale
        const gravity = 600 * posScale;

// === СЕТКА (с корректным физическим телом) ===

// Позиция центра сетки
const netCenterY = groundY - this.NET_HEIGHT / 2;

// Добавляем физический объект
this.volleyNet = this.physics.add.staticImage(
    this.FIELD_WIDTH / 2,
    netCenterY,
    "volley-net"
);

// Масштабируем по высоте (ширина не важна — коллайдер зададим вручную)
const netTexture = this.textures.get("volley-net").getSourceImage() as HTMLImageElement;
const netScaleY = this.NET_HEIGHT / netTexture.height;
this.volleyNet.setScale(netScaleY);

// Устанавливаем якорь (центр)
this.volleyNet.setOrigin(0.5, 0.5);

// === КЛЮЧЕВОЕ: обновляем тело ===
(this.volleyNet as Phaser.Types.Physics.Arcade.ImageWithStaticBody).refreshBody();

// === Задаём точный размер и позицию тела ===
const netBody = this.volleyNet.body as Phaser.Physics.Arcade.Body;

// Узкая вертикальная граница в центре картинки
const bodyWidth = 10 * (this.FIELD_HEIGHT / 640);
const bodyHeight = this.NET_HEIGHT;

// Смещаем тело, чтобы оно совпадало с визуальным центром
netBody.setSize(bodyWidth, bodyHeight);
netBody.setOffset(
    this.volleyNet.displayWidth / 2 - bodyWidth / 2, // смещаем тело в центр
    this.volleyNet.displayHeight / 2 - bodyHeight / 2 // тело по центру по вертикали
);

        // "Пол" — физическая зона
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
            .setBounce(0.85, 0.85) // Уменьшаем отскок с 1.0 до 0.85 для реалистичности
            .setCollideWorldBounds(true)
            .setGravityY(gravity * 0.5); // Мяч легче игроков - гравитация 50%
        
        // Устанавливаем затухание для мяча
        (this.ball.body as Phaser.Physics.Arcade.Body).setDrag(20, 0); // Небольшое сопротивление воздуха
        (this.ball.body as Phaser.Physics.Arcade.Body).setMaxVelocity(800 * posScale, 800 * posScale); // Ограничение скорости
        
        this.physics.add.collider(this.ball, ground, () => {
            const scoringPlayer =
                this.ball.x < this.FIELD_WIDTH / 2 ? this.player2 : this.player1;
            this.handlePointScored(scoringPlayer);
        });
        this.physics.add.collider(
            this.ball,
            this.volleyNet,
            this.handleNetCollision,
            undefined,
            this
        );

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
        this.physics.add.collider(this.ball, this.player1, () =>
            this.hitBall(this.player1)
        );
        this.physics.add.collider(this.ball, this.player2, () =>
            this.hitBall(this.player2)
        );

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

        // Счёт (адаптивный размер шрифта)
        const fontSize = Math.round(32 * posScale);
        this.scoreText = this.add
            .text(this.FIELD_WIDTH / 2, 50 * posScale, "0 - 0", {
                fontSize: `${fontSize}px`,
                color: "#FFF",
                fontFamily: "Arial",
            })
            .setOrigin(0.5);

        // WebRTC обработчики
        if (this.isMultiplayer && this.dataChannel) {
            this.setupDataChannel();
        }

        EventBus.emit("current-scene-ready", this);
    }

    private createMobileControls() {
        const halfWidth = this.FIELD_WIDTH / 2;
        const btnSize = Math.min(80 * (this.FIELD_HEIGHT / 640), 80); // Ограничиваем максимум 80px
        const margin = Math.min(15 * (this.FIELD_HEIGHT / 640), 20); // Меньший отступ
        
        // Высота зоны кнопок
        const controlsHeight = 120 * (this.FIELD_HEIGHT / 640);
        
        // Зоны для прыжка (тап по игроку) - уменьшаем, чтобы не перекрывать кнопки
        const jumpZoneHeight = this.FIELD_HEIGHT - controlsHeight - 20;
        
        this.player1JumpZone = this.add.zone(
            halfWidth / 2, 
            jumpZoneHeight / 2, 
            halfWidth, 
            jumpZoneHeight
        )
            .setInteractive()
            .setScrollFactor(0);
        
        this.player2JumpZone = this.add.zone(
            halfWidth + halfWidth / 2, 
            jumpZoneHeight / 2, 
            halfWidth, 
            jumpZoneHeight
        )
            .setInteractive()
            .setScrollFactor(0);

        // Полупрозрачные индикаторы зон
        const zoneGraphics = this.add.graphics();
        zoneGraphics.fillStyle(0x4444ff, 0.05);
        zoneGraphics.fillRect(0, 0, halfWidth, jumpZoneHeight);
        zoneGraphics.fillStyle(0x44ff44, 0.05);
        zoneGraphics.fillRect(halfWidth, 0, halfWidth, jumpZoneHeight);
        zoneGraphics.setDepth(50);

        // Подсказка (адаптивный размер)
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

        // === КНОПКИ ДЛЯ ИГРОКА 1 (СЛЕВА ВНИЗУ) ===
        
        const arrowFontSize = Math.max(32, Math.min(40 * (this.FIELD_HEIGHT / 640), 48));
        const btnY = this.FIELD_HEIGHT - margin - btnSize / 2;
        
        // Кнопка влево для игрока 1
        const p1LeftBtn = this.add.rectangle(
            margin + btnSize / 2,
            btnY,
            btnSize,
            btnSize,
            0x4444ff,
            0.6
        )
        .setInteractive()
        .setScrollFactor(0)
        .setDepth(100);

        this.add.text(p1LeftBtn.x, p1LeftBtn.y, '◄', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        // Кнопка вправо для игрока 1
        const p1RightBtn = this.add.rectangle(
            margin * 2 + btnSize * 1.5,
            btnY,
            btnSize,
            btnSize,
            0x4444ff,
            0.6
        )
        .setInteractive()
        .setScrollFactor(0)
        .setDepth(100);

        this.add.text(p1RightBtn.x, p1RightBtn.y, '►', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        // === КНОПКИ ДЛЯ ИГРОКА 2 (СПРАВА ВНИЗУ) ===
        
        // Кнопка влево для игрока 2
        const p2LeftBtn = this.add.rectangle(
            this.FIELD_WIDTH - margin * 2 - btnSize * 1.5,
            btnY,
            btnSize,
            btnSize,
            0x44ff44,
            0.6
        )
        .setInteractive()
        .setScrollFactor(0)
        .setDepth(100);

        this.add.text(p2LeftBtn.x, p2LeftBtn.y, '◄', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        // Кнопка вправо для игрока 2
        const p2RightBtn = this.add.rectangle(
            this.FIELD_WIDTH - margin - btnSize / 2,
            btnY,
            btnSize,
            btnSize,
            0x44ff44,
            0.6
        )
        .setInteractive()
        .setScrollFactor(0)
        .setDepth(100);

        this.add.text(p2RightBtn.x, p2RightBtn.y, '►', {
            fontSize: `${arrowFontSize}px`,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        // === СОБЫТИЯ ДЛЯ ИГРОКА 1 ===
        
        // Прыжок по тапу
        this.player1JumpZone.on('pointerdown', () => {
            if (this.player1.body!.blocked.down) {
                this.player1.setVelocityY(this.JUMP_VELOCITY);
                const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                if (!ballBody.enable) ballBody.enable = true;
                
                // Отправка в мультиплеере
                if (this.isMultiplayer && this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(JSON.stringify({
                        type: 'jump',
                        player: 1
                    }));
                }
            }
        });

        // Кнопка влево
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

        // Кнопка вправо
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

        // === СОБЫТИЯ ДЛЯ ИГРОКА 2 ===
        
        // Прыжок по тапу
        this.player2JumpZone.on('pointerdown', () => {
            if (this.player2.body!.blocked.down) {
                this.player2.setVelocityY(this.JUMP_VELOCITY);
                const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
                if (!ballBody.enable) ballBody.enable = true;
                
                // Отправка в мультиплеере
                if (this.isMultiplayer && this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(JSON.stringify({
                        type: 'jump',
                        player: 2
                    }));
                }
            }
        });

        // Кнопка влево
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

        // Кнопка вправо
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

        // Кнопка вправо
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

    private setupDataChannel() {
        if (!this.dataChannel) return;

        this.dataChannel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'gameState') {
                // Синхронизация состояния игры
                if (!this.isHost) {
                    this.ball.setPosition(data.ball.x, data.ball.y);
                    this.ball.setVelocity(data.ball.vx, data.ball.vy);
                    this.player2.setPosition(data.player2.x, data.player2.y);
                    this.player1Score = data.score.player1;
                    this.player2Score = data.score.player2;
                    this.scoreText.setText(`${this.player1Score} - ${this.player2Score}`);
                }
            } else if (data.type === 'playerInput') {
                // Получение ввода от удаленного игрока
                if (this.isHost) {
                    // Хост получает ввод игрока 2
                    this.player2Touch = data.input;
                } else {
                    // Гость получает ввод игрока 1
                    this.player1Touch = data.input;
                }
            } else if (data.type === 'jump') {
                // Синхронизация прыжка
                if (this.isHost && data.player === 2) {
                    if (this.player2.body!.blocked.down) {
                        this.player2.setVelocityY(this.JUMP_VELOCITY);
                    }
                } else if (!this.isHost && data.player === 1) {
                    if (this.player1.body!.blocked.down) {
                        this.player1.setVelocityY(this.JUMP_VELOCITY);
                    }
                }
            }
        };
    }

    private sendGameState() {
        if (!this.isMultiplayer || !this.dataChannel || this.dataChannel.readyState !== 'open') return;
        
        if (this.isHost) {
            const state = {
                type: 'gameState',
                ball: {
                    x: this.ball.x,
                    y: this.ball.y,
                    vx: this.ball.body!.velocity.x,
                    vy: this.ball.body!.velocity.y
                },
                player2: {
                    x: this.player2.x,
                    y: this.player2.y
                },
                score: {
                    player1: this.player1Score,
                    player2: this.player2Score
                }
            };
            this.dataChannel.send(JSON.stringify(state));
        }
    }

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

    update() {
        // Управление игроком 1
        if (this.isMobile) {
            // Мобильное управление
            if (this.player1Touch.left && this.player1.x > 0) {
                this.player1.setVelocityX(-this.PLAYER_SPEED);
            } else if (this.player1Touch.right && this.player1.x < this.FIELD_WIDTH / 2 - 30) {
                this.player1.setVelocityX(this.PLAYER_SPEED);
            } else {
                this.player1.setVelocityX(0);
            }
            
            // Отправка ввода в мультиплеере
            if (this.isMultiplayer && this.dataChannel && this.dataChannel.readyState === 'open') {
                this.dataChannel.send(JSON.stringify({
                    type: 'playerInput',
                    input: this.player1Touch
                }));
            }
        } else {
            // Клавиатурное управление
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
            }
        }

        // Управление игроком 2
        if (!this.isMultiplayer || this.isHost) {
            if (this.isMobile) {
                // Мобильное управление
                if (this.player2Touch.left && this.player2.x > this.FIELD_WIDTH / 2 + 30) {
                    this.player2.setVelocityX(-this.PLAYER_SPEED);
                } else if (this.player2Touch.right && this.player2.x < this.FIELD_WIDTH) {
                    this.player2.setVelocityX(this.PLAYER_SPEED);
                } else {
                    this.player2.setVelocityX(0);
                }
                
                // Отправка ввода в мультиплеере
                if (this.isMultiplayer && this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(JSON.stringify({
                        type: 'playerInput',
                        input: this.player2Touch
                    }));
                }
            } else {
                // Клавиатурное управление
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
                }
            }
        }

        // WebRTC синхронизация
        if (this.isMultiplayer && this.isHost) {
            this.sendGameState();
        }

        // Если мяч вышел за пределы экрана по Y
        if (this.ball.y > this.FIELD_HEIGHT || this.ball.y < 0) {
            this.handlePointScored();
        }
    }

    private hitBall(player: Physics.Arcade.Sprite) {
        if (this.lastToucher !== player) {
            this.touches = 0;
            this.lastToucher = player;
        }

        this.touches++;

        if (this.touches > 3) {
            this.handlePointScored(
                player === this.player1 ? this.player2 : this.player1
            );
            return;
        }

        // Вычисляем угол от игрока к мячу
        const angle = Phaser.Math.Angle.Between(
            player.x,
            player.y,
            this.ball.x,
            this.ball.y
        );
        
        // ВАЖНО: Используем BALL_FORCE который масштабируется правильно
        // Добавляем импульс вместо прямой установки скорости для более реалистичной физики
        const forceX = Math.cos(angle) * this.BALL_FORCE;
        const forceY = Math.sin(angle) * this.BALL_FORCE * 0.7; // Вертикальная составляющая меньше
        
        this.ball.setVelocity(forceX, forceY);
        
        // Добавляем небольшое вращение для визуального эффекта
        this.ball.setAngularVelocity((forceX / 5) * (this.FIELD_HEIGHT / 640));
    }

    private handlePointScored(scoringPlayer?: Physics.Arcade.Sprite) {
        if (!scoringPlayer) {
            scoringPlayer =
                this.ball.x < this.FIELD_WIDTH / 2 ? this.player2 : this.player1;
        }

        if (scoringPlayer === this.player1) {
            this.player1Score++;
        } else {
            this.player2Score++;
        }

        this.scoreText.setText(`${this.player1Score} - ${this.player2Score}`);
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
    }

    changeScene() {
        this.scene.start("GameOver");
    }
}