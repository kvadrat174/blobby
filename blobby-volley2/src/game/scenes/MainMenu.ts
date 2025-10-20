import { GameObjects, Scene } from "phaser";
import { EventBus } from "../EventBus";
import { WebRTCService } from "../WebRTCService";

export class MainMenu extends Scene {
    background!: GameObjects.Image;
    title!: GameObjects.Text;
    
    // Основные кнопки
    localGameButton!: GameObjects.Text;
    hostButton!: GameObjects.Text;
    joinButton!: GameObjects.Text;
    
    // UI элементы для мультиплеера
    matchCodeContainer!: GameObjects.Container;
    matchCodeText!: GameObjects.Text;
    matchCodeValue!: GameObjects.Text;
    copyButton!: GameObjects.Text;
    waitingText!: GameObjects.Text;
    
    joinContainer!: GameObjects.Container;
    joinInputBg!: GameObjects.Rectangle;
    joinCodeText!: GameObjects.Text;
    confirmJoinButton!: GameObjects.Text;
    cancelJoinButton!: GameObjects.Text;
    
    infoText!: GameObjects.Text;
    backButton!: GameObjects.Text;

    private rtc!: WebRTCService;
    private currentMatchCode: string = "";
    private inputCode: string = "";
    private isInLobby: boolean = false;

    constructor() {
        super("MainMenu");
    }

    create() {
        // Получаем реальные размеры камеры
        let cameraWidth = this.scale.width;
        let cameraHeight = this.scale.height;
        
        // Проверяем portrait mode
        const isPortrait = window.innerHeight > window.innerWidth;
        
        // Если portrait - меняем размеры местами для корректного расчета
        if (isPortrait) {
            [cameraWidth, cameraHeight] = [cameraHeight, cameraWidth];
        }
        
        // Теперь вычисляем landscape размеры
        const w = Math.max(cameraWidth, cameraHeight);
        const h = Math.min(cameraWidth, cameraHeight);
        
        console.log('MainMenu dimensions:', {
            isPortrait,
            originalCamera: {
                width: this.scale.width,
                height: this.scale.height
            },
            correctedCamera: {
                width: cameraWidth,
                height: cameraHeight
            },
            landscape: {
                width: w,
                height: h
            },
            window: {
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight
            }
        });
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
        
        // Адаптивные размеры
        const titleSize = isMobile ? Math.min(48, w * 0.1) : 48;
        const buttonSize = isMobile ? Math.min(32, w * 0.065) : 38;
        const smallSize = isMobile ? Math.min(20, w * 0.045) : 24;

        // Фон
        this.background = this.add.image(w / 2, h / 2, "beach")
            .setDisplaySize(w, h);

        // Затемнение для читаемости
        const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.4);

        // Заголовок
        this.title = this.add.text(w / 2, h * 0.15, "🏐 Volley Match", {
            fontFamily: "Arial Black",
            fontSize: `${titleSize}px`,
            color: "#fff",
            stroke: "#000",
            strokeThickness: 6,
            align: "center"
        }).setOrigin(0.5);

        // === ГЛАВНОЕ МЕНЮ ===
        
        // Кнопка локальной игры
        this.localGameButton = this.createButton(
            w / 2, h * 0.4,
            "🎮 Локальная игра",
            "#4CAF50",
            buttonSize
        );
        this.localGameButton.on("pointerdown", () => this.startLocalGame());

        // Кнопка создания игры
        this.hostButton = this.createButton(
            w / 2, h * 0.55,
            "🌐 Создать онлайн игру",
            "#2196F3",
            buttonSize
        );
        this.hostButton.on("pointerdown", () => this.createOnlineGame());

        // Кнопка присоединения
        this.joinButton = this.createButton(
            w / 2, h * 0.7,
            "🔗 Присоединиться к игре",
            "#FF9800",
            buttonSize
        );
        this.joinButton.on("pointerdown", () => this.showJoinScreen());

        // === ЭКРАН СОЗДАНИЯ ИГРЫ (скрыт по умолчанию) ===
        
        this.matchCodeContainer = this.add.container(w / 2, h / 2);
        
        const codeBg = this.add.rectangle(0, 0, w * 0.8, h * 0.5, 0x1a1a1a, 0.95);
        codeBg.setStrokeStyle(3, 0x4CAF50);
        
        this.matchCodeText = this.add.text(0, -h * 0.15, "Код вашей игры:", {
            fontSize: `${smallSize}px`,
            color: "#fff",
            fontFamily: "Arial"
        }).setOrigin(0.5);
        
        this.matchCodeValue = this.add.text(0, -h * 0.05, "", {
            fontSize: `${buttonSize + 4}px`,
            color: "#4CAF50",
            fontFamily: "Arial Black",
            backgroundColor: "#00000088",
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5);
        
        this.copyButton = this.createButton(0, h * 0.06, "📋 Копировать код", "#2196F3", smallSize);
        this.copyButton.on("pointerdown", () => this.copyMatchCode());
        
        this.waitingText = this.add.text(0, h * 0.15, "Ожидание соперника...", {
            fontSize: `${smallSize}px`,
            color: "#FFD700",
            fontFamily: "Arial"
        }).setOrigin(0.5);
        
        this.matchCodeContainer.add([codeBg, this.matchCodeText, this.matchCodeValue, this.copyButton, this.waitingText]);
        this.matchCodeContainer.setVisible(false);

        // === ЭКРАН ПРИСОЕДИНЕНИЯ (скрыт по умолчанию) ===
        
        this.joinContainer = this.add.container(w / 2, h / 2);
        
        const joinBg = this.add.rectangle(0, 0, w * 0.8, h * 0.5, 0x1a1a1a, 0.95);
        joinBg.setStrokeStyle(3, 0xFF9800);
        
        const joinTitle = this.add.text(0, -h * 0.15, "Введите код игры:", {
            fontSize: `${smallSize}px`,
            color: "#fff",
            fontFamily: "Arial"
        }).setOrigin(0.5);
        
        this.joinInputBg = this.add.rectangle(0, -h * 0.05, w * 0.6, buttonSize * 2, 0x333333, 1);
        this.joinInputBg.setStrokeStyle(2, 0xFF9800);
        this.joinInputBg.setInteractive();
        
        this.joinCodeText = this.add.text(0, -h * 0.05, "Нажмите для ввода", {
            fontSize: `${smallSize}px`,
            color: "#999",
            fontFamily: "Arial"
        }).setOrigin(0.5);
        
        this.joinInputBg.on("pointerdown", () => this.promptForCode());
        
        this.confirmJoinButton = this.createButton(0, h * 0.08, "✅ Подключиться", "#4CAF50", smallSize);
        this.confirmJoinButton.on("pointerdown", () => this.joinGame());
        
        this.cancelJoinButton = this.createButton(0, h * 0.16, "❌ Отмена", "#f44336", smallSize);
        this.cancelJoinButton.on("pointerdown", () => this.showMainMenu());
        
        this.joinContainer.add([joinBg, joinTitle, this.joinInputBg, this.joinCodeText, this.confirmJoinButton, this.cancelJoinButton]);
        this.joinContainer.setVisible(false);

        // Кнопка возврата (скрыта по умолчанию)
        this.backButton = this.createButton(w * 0.1, h * 0.9, "← Назад", "#666", smallSize);
        this.backButton.on("pointerdown", () => this.cancelLobby());
        this.backButton.setVisible(false);

        // Информационный текст
        this.infoText = this.add.text(w / 2, h * 0.88, "", {
            fontSize: `${Math.min(18, smallSize - 4)}px`,
            color: "#fff",
            align: "center",
            wordWrap: { width: w * 0.9 }
        }).setOrigin(0.5);

        // Инициализация WebRTC
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const wsUrl = isDev 
            ? 'ws://localhost:8080'
            : 'wss://game.kvadrat.tech/ws';

        console.log('Connecting to WebSocket server:', wsUrl);

        this.rtc = new WebRTCService(wsUrl, (dc) => {
            dc.onopen = () => {
                console.log('Data channel opened!');
                this.startMultiplayerGame();
            };
            dc.onerror = (err) => {
                this.showError("Ошибка соединения");
                console.error('Data channel error:', err);
            };
            dc.onclose = () => {
                console.log('Data channel closed');
            };
        });

        EventBus.emit("current-scene-ready", this);
    }

    // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

    private createButton(x: number, y: number, text: string, color: string, size: number): GameObjects.Text {
        const button = this.add.text(x, y, text, {
            fontSize: `${size}px`,
            color: "#fff",
            backgroundColor: color + "DD",
            padding: { x: 20, y: 10 },
            fontFamily: "Arial"
        }).setOrigin(0.5).setInteractive();

        button.on("pointerover", () => {
            button.setScale(1.05);
            button.setBackgroundColor(color + "FF");
        });
        button.on("pointerout", () => {
            button.setScale(1);
            button.setBackgroundColor(color + "DD");
        });

        return button;
    }

    private showMainMenu() {
        this.localGameButton.setVisible(true);
        this.hostButton.setVisible(true);
        this.joinButton.setVisible(true);
        this.matchCodeContainer.setVisible(false);
        this.joinContainer.setVisible(false);
        this.backButton.setVisible(false);
        this.infoText.setText("");
        this.isInLobby = false;
    }

    private hideMainMenu() {
        this.localGameButton.setVisible(false);
        this.hostButton.setVisible(false);
        this.joinButton.setVisible(false);
    }

    // === ЛОКАЛЬНАЯ ИГРА ===

    private startLocalGame() {
        this.scene.start("Game", {
            isMultiplayer: false,
            isHost: false,
            dataChannel: null
        });
    }

    // === СОЗДАНИЕ ОНЛАЙН ИГРЫ ===

    private async createOnlineGame() {
        try {
            this.hideMainMenu();
            this.infoText.setText("Создание игры...");
            
            const matchId = await this.rtc.createMatch();
            this.currentMatchCode = matchId;
            
            this.matchCodeValue.setText(matchId);
            this.matchCodeContainer.setVisible(true);
            this.backButton.setVisible(true);
            this.isInLobby = true;
            this.infoText.setText("");
            
        } catch (err) {
            this.showError("Не удалось создать игру");
            console.error(err);
        }
    }

    private copyMatchCode() {
        if (this.currentMatchCode) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(this.currentMatchCode)
                    .then(() => {
                        this.infoText.setText("✅ Код скопирован!");
                        this.time.delayedCall(2000, () => {
                            if (this.isInLobby) this.infoText.setText("");
                        });
                    })
                    .catch(() => {
                        this.showCodeFallback();
                    });
            } else {
                this.showCodeFallback();
            }
        }
    }

    private showCodeFallback() {
        prompt("Скопируйте код игры:", this.currentMatchCode);
    }

    // === ПРИСОЕДИНЕНИЕ К ИГРЕ ===

    private showJoinScreen() {
        this.hideMainMenu();
        this.joinContainer.setVisible(true);
        this.backButton.setVisible(true);
        this.isInLobby = true;
        this.inputCode = "";
        this.joinCodeText.setText("Нажмите для ввода");
        this.joinCodeText.setColor("#999");
    }

    private promptForCode() {
        const code = prompt("Введите код игры:");
        if (code && code.trim()) {
            this.inputCode = code.trim();
            this.joinCodeText.setText(this.inputCode);
            this.joinCodeText.setColor("#fff");
        }
    }

    private async joinGame() {
        if (!this.inputCode) {
            this.showError("Введите код игры");
            return;
        }

        try {
            this.infoText.setText("Подключение...");
            await this.rtc.joinMatch(this.inputCode);
        } catch (err) {
            this.showError("Не удалось подключиться");
            console.error(err);
        }
    }

    // === ЗАПУСК МУЛЬТИПЛЕЕРА ===

    private startMultiplayerGame() {
        this.scene.start("Game", {
            isMultiplayer: true,
            isHost: this.rtc.getIsHost(),
            dataChannel: this.rtc.getDataChannel()
        });
    }

    // === ОТМЕНА И ВЫХОД ===

    private cancelLobby() {
        this.rtc.disconnect();
        this.showMainMenu();
    }

    private showError(message: string) {
        this.infoText.setText("❌ " + message);
        this.time.delayedCall(3000, () => {
            this.showMainMenu();
        });
    }

    // === API для внешнего вызова ===

    changeScene() {
        this.startLocalGame();
    }
}