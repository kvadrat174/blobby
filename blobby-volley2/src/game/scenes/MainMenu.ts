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
    
    // Кнопки виртуальной клавиатуры
    keyboardContainer!: GameObjects.Container;
    
    infoText!: GameObjects.Text;
    backButton!: GameObjects.Text;

    private rtc!: WebRTCService;
    private currentMatchCode: string = "";
    private inputCode: string = "";
    private isInLobby: boolean = false;
    private cursorBlink?: Phaser.Time.TimerEvent;

    constructor() {
        super("MainMenu");
    }

    create() {
        this.updateOrientation();
        EventBus.emit("current-scene-ready", this);
    }

    private updateOrientation() {
        // Для меню ВСЕГДА используем портретную ориентацию
        const currentWidth = this.scale.width || window.innerWidth;
        const currentHeight = this.scale.height || window.innerHeight;
        
        const w = Math.min(currentWidth, currentHeight); // портретная ширина
        const h = Math.max(currentWidth, currentHeight); // портретная высота
        
        console.log('MainMenu dimensions (PORTRAIT FORCED):', {
            width: w,
            height: h,
            scaleWidth: this.scale.width,
            scaleHeight: this.scale.height,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight
        });
        
        // Обновляем размер scale и камеры
        this.scale.resize(w, h);
        this.cameras.main.setSize(w, h);
        
        // Очищаем предыдущий контент если есть
        this.children.removeAll(true);
        
        this.createMenuContent(w, h);
    }

    private createMenuContent(w: number, h: number) {
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
        
        // Адаптивные размеры
        const titleSize = isMobile ? Math.min(48, w * 0.12) : 48;
        const buttonSize = isMobile ? Math.min(32, w * 0.08) : 38;
        const smallSize = isMobile ? Math.min(20, w * 0.055) : 24;

        // Фон
        this.background = this.add.image(w / 2, h / 2, "beach")
            .setDisplaySize(w, h);

        // Затемнение для читаемости
        const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.4);

        // Заголовок
        this.title = this.add.text(w / 2, h * 0.12, "🏐 Volley Match", {
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
            w / 2, h * 0.35,
            "🎮 Локальная игра",
            "#4CAF50",
            buttonSize
        );
        this.localGameButton.on("pointerdown", () => this.startLocalGame());

        // Кнопка создания игры
        this.hostButton = this.createButton(
            w / 2, h * 0.48,
            "🌐 Создать онлайн игру",
            "#2196F3",
            buttonSize
        );
        this.hostButton.on("pointerdown", () => this.createOnlineGame());

        // Кнопка присоединения
        this.joinButton = this.createButton(
            w / 2, h * 0.61,
            "🔗 Присоединиться к игре",
            "#FF9800",
            buttonSize
        );
        this.joinButton.on("pointerdown", () => this.showJoinScreen());

        // === ЭКРАН СОЗДАНИЯ ИГРЫ (скрыт по умолчанию) ===
        
        this.matchCodeContainer = this.add.container(w / 2, h / 2);
        
        const codeBg = this.add.rectangle(0, 0, w * 0.85, h * 0.45, 0x1a1a1a, 0.95);
        codeBg.setStrokeStyle(3, 0x4CAF50);
        
        this.matchCodeText = this.add.text(0, -h * 0.15, "Код вашей игры:", {
            fontSize: `${smallSize}px`,
            color: "#fff",
            fontFamily: "Arial"
        }).setOrigin(0.5);
        
        this.matchCodeValue = this.add.text(0, -h * 0.08, "", {
            fontSize: `${buttonSize + 4}px`,
            color: "#4CAF50",
            fontFamily: "Arial Black",
            backgroundColor: "#00000088",
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5);
        
        this.copyButton = this.createButton(0, h * 0.03, "📋 Копировать код", "#2196F3", smallSize);
        this.copyButton.on("pointerdown", () => this.copyMatchCode());
        
        this.waitingText = this.add.text(0, h * 0.12, "Ожидание соперника...", {
            fontSize: `${smallSize}px`,
            color: "#FFD700",
            fontFamily: "Arial"
        }).setOrigin(0.5);
        
        this.matchCodeContainer.add([codeBg, this.matchCodeText, this.matchCodeValue, this.copyButton, this.waitingText]);
        this.matchCodeContainer.setVisible(false);

        // === ЭКРАН ПРИСОЕДИНЕНИЯ (скрыт по умолчанию) ===
        
        this.joinContainer = this.add.container(w / 2, h * 0.35);
        
        const joinBg = this.add.rectangle(0, 0, w * 0.85, h * 0.65, 0x1a1a1a, 0.95);
        joinBg.setStrokeStyle(3, 0xFF9800);
        
        const joinTitle = this.add.text(0, -h * 0.25, "Введите код игры:", {
            fontSize: `${smallSize}px`,
            color: "#fff",
            fontFamily: "Arial"
        }).setOrigin(0.5);
        
        this.joinInputBg = this.add.rectangle(0, -h * 0.18, w * 0.7, buttonSize * 2.2, 0x333333, 1);
        this.joinInputBg.setStrokeStyle(2, 0xFF9800);
        this.joinInputBg.setInteractive();
        
        this.joinCodeText = this.add.text(0, -h * 0.18, "", {
            fontSize: `${buttonSize}px`,
            color: "#fff",
            fontFamily: "Courier New",
            fontStyle: "bold"
        }).setOrigin(0.5);
        
        // Виртуальная клавиатура для ввода кода
        this.keyboardContainer = this.createVirtualKeyboard(0, 0, w * 0.75, smallSize);
        
        this.confirmJoinButton = this.createButton(0, h * 0.22, "✅ Подключиться", "#4CAF50", smallSize);
        this.confirmJoinButton.on("pointerdown", () => this.joinGame());
        
        this.cancelJoinButton = this.createButton(0, h * 0.285, "❌ Отмена", "#f44336", smallSize);
        this.cancelJoinButton.on("pointerdown", () => this.showMainMenu());
        
        this.joinContainer.add([
            joinBg, 
            joinTitle, 
            this.joinInputBg, 
            this.joinCodeText, 
            this.keyboardContainer,
            this.confirmJoinButton, 
            this.cancelJoinButton
        ]);
        this.joinContainer.setVisible(false);

        // Кнопка возврата (скрыта по умолчанию)
        this.backButton = this.createButton(w * 0.15, h * 0.92, "← Назад", "#666", smallSize);
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

    // === ВИРТУАЛЬНАЯ КЛАВИАТУРА ===
    
    private createVirtualKeyboard(x: number, y: number, maxWidth: number, fontSize: number): GameObjects.Container {
        const container = this.add.container(x, y);
        
        // Символы для ввода (буквы и цифры)
        const keys = [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
        ];
        
        const keyWidth = maxWidth / 11;
        const keyHeight = keyWidth * 0.9;
        const spacing = 4;
        const startY = -keyHeight * 1.5;
        
        keys.forEach((row, rowIndex) => {
            const rowWidth = row.length * (keyWidth + spacing);
            const startX = -rowWidth / 2 + keyWidth / 2;
            
            row.forEach((key, colIndex) => {
                const keyX = startX + colIndex * (keyWidth + spacing);
                const keyY = startY + rowIndex * (keyHeight + spacing);
                
                const isBackspace = key === '⌫';
                const keyBg = this.add.rectangle(
                    keyX, keyY, 
                    isBackspace ? keyWidth * 1.5 : keyWidth, 
                    keyHeight, 
                    isBackspace ? 0xff6666 : 0x4a4a4a
                );
                keyBg.setInteractive();
                keyBg.setStrokeStyle(1, 0x666666);
                
                const keyText = this.add.text(keyX, keyY, key, {
                    fontSize: `${fontSize * 0.9}px`,
                    color: "#fff",
                    fontFamily: "Arial",
                    fontStyle: "bold"
                }).setOrigin(0.5);
                
                keyBg.on("pointerdown", () => {
                    if (isBackspace) {
                        this.handleBackspace();
                    } else {
                        this.handleKeyPress(key);
                    }
                    keyBg.setFillStyle(0x6a6a6a);
                });
                
                keyBg.on("pointerup", () => {
                    keyBg.setFillStyle(isBackspace ? 0xff6666 : 0x4a4a4a);
                });
                
                keyBg.on("pointerout", () => {
                    keyBg.setFillStyle(isBackspace ? 0xff6666 : 0x4a4a4a);
                });
                
                container.add([keyBg, keyText]);
            });
        });
        
        return container;
    }
    
    private handleKeyPress(key: string) {
        if (this.inputCode.length < 20) {
            this.inputCode += key;
            this.updateJoinCodeDisplay();
        }
    }
    
    private handleBackspace() {
        if (this.inputCode.length > 0) {
            this.inputCode = this.inputCode.slice(0, -1);
            this.updateJoinCodeDisplay();
        }
    }
    
    private updateJoinCodeDisplay() {
        if (this.inputCode.length > 0) {
            this.joinCodeText.setText(this.inputCode + '|');
            this.joinCodeText.setColor("#fff");
        } else {
            this.joinCodeText.setText('|');
            this.joinCodeText.setColor("#999");
        }
        
        // Мигающий курсор
        if (this.cursorBlink) {
            this.cursorBlink.destroy();
        }
        this.cursorBlink = this.time.addEvent({
            delay: 500,
            callback: () => {
                const currentText = this.joinCodeText.text;
                if (currentText.endsWith('|')) {
                    this.joinCodeText.setText(currentText.slice(0, -1));
                } else {
                    this.joinCodeText.setText(currentText + '|');
                }
            },
            loop: true
        });
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
        if (this.cursorBlink) {
            this.cursorBlink.destroy();
            this.cursorBlink = undefined;
        }
        
        this.localGameButton.setVisible(true);
        this.hostButton.setVisible(true);
        this.joinButton.setVisible(true);
        this.matchCodeContainer.setVisible(false);
        this.joinContainer.setVisible(false);
        this.backButton.setVisible(false);
        this.infoText.setText("");
        this.isInLobby = false;
        this.inputCode = "";
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
        // Для мобильных показываем alert вместо prompt
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.showAlert(`Код игры: ${this.currentMatchCode}\n\nСкопируйте его вручную.`);
        } else {
            alert(`Код игры: ${this.currentMatchCode}\n\nСкопируйте его вручную.`);
        }
    }

    // === ПРИСОЕДИНЕНИЕ К ИГРЕ ===

    private showJoinScreen() {
        this.hideMainMenu();
        this.joinContainer.setVisible(true);
        this.backButton.setVisible(true);
        this.isInLobby = true;
        this.inputCode = "";
        this.joinCodeText.setText("|");
        this.joinCodeText.setColor("#999");
        this.updateJoinCodeDisplay();
    }

    private async joinGame() {
        if (!this.inputCode || this.inputCode.trim().length === 0) {
            this.showError("Введите код игры");
            return;
        }

        try {
            this.infoText.setText("Подключение...");
            await this.rtc.joinMatch(this.inputCode.trim());
        } catch (err) {
            this.showError("Не удалось подключиться");
            console.error(err);
        }
    }

    // === ЗАПУСК МУЛЬТИПЛЕЕРА ===

    private startMultiplayerGame() {
        if (this.cursorBlink) {
            this.cursorBlink.destroy();
            this.cursorBlink = undefined;
        }
        
        this.scene.start("Game", {
            isMultiplayer: true,
            isHost: this.rtc.getIsHost(),
            dataChannel: this.rtc.getDataChannel()
        });
    }

    // === ОТМЕНА И ВЫХОД ===

    private cancelLobby() {
        if (this.cursorBlink) {
            this.cursorBlink.destroy();
            this.cursorBlink = undefined;
        }
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
    
    shutdown() {
        if (this.cursorBlink) {
            this.cursorBlink.destroy();
            this.cursorBlink = undefined;
        }
    }
}