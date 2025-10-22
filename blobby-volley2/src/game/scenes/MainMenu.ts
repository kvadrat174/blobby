import { GameObjects, Scene } from "phaser";
import { EventBus } from "../EventBus";
import { WebRTCService } from "../WebRTCService";
import { shareUrl } from "../../telegram";

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
    joinClearButton!: GameObjects.Text;
    confirmJoinButton!: GameObjects.Text;
    cancelJoinButton!: GameObjects.Text;
    
    infoText!: GameObjects.Text;
    backButton!: GameObjects.Text;

    private rtc!: WebRTCService;
    private currentMatchCode: string = "";
    private inputCode: string = "";
    private autoJoinCode: string = ""; // ✅ Отдельная переменная для авто-присоединения
    private isInLobby: boolean = false;

    constructor() {
        super("MainMenu");
    }

    create() {
        this.updateOrientation();
        
        // ВАЖНО: Сначала проверяем URL параметры
        const urlParams = new URLSearchParams(window.location.search);
        const gameCode = urlParams.get('code') || urlParams.get('game');
        
        // Если есть код в URL - это автоматическое присоединение
        if (gameCode && gameCode.trim()) {
            const trimmedCode = gameCode.trim();
            console.log('Game code found in URL, will auto-join:', trimmedCode);
            this.autoJoinCode = trimmedCode; // ✅ Сохраняем отдельно для авто-присоединения
            this.inputCode = trimmedCode;    // Сохраняем и в обычное поле
        }
        
        EventBus.emit("current-scene-ready", this);
    }

    private showWelcomeMessage() {
        // Временно показываем приветственное сообщение
        const w = Math.min(this.scale.width, this.scale.height);
        const h = Math.max(this.scale.width, this.scale.height);
        
        const welcomeText = this.add.text(w / 2, h * 0.5, 
            '🎮 Присоединяемся к игре...\n\nПодождите немного...', {
            fontSize: '24px',
            color: '#4CAF50',
            fontFamily: 'Arial',
            align: 'center',
            fontStyle: 'bold',
            stroke: '#000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(10000);
        
        // Удаляем сообщение через 2.5 секунды
        this.time.delayedCall(2500, () => {
            welcomeText.destroy();
        });
    }

    private async autoJoinFromURL() {
        const codeToJoin = this.autoJoinCode; // ✅ Используем сохраненный код
        
        console.log('=== AUTO JOIN FROM URL ===');
        console.log('Code to join:', codeToJoin);
        console.log('Code length:', codeToJoin?.length);
        console.log('Code type:', typeof codeToJoin);
        console.log('=== ===');
        
        // Показываем экран присоединения
        this.hideMainMenu();
        this.joinContainer.setVisible(true);
        this.backButton.setVisible(true);
        this.isInLobby = true;
        
        // Показываем код
        this.joinCodeText.setText(codeToJoin);
        this.joinCodeText.setColor("#4CAF50");
        this.joinClearButton.setVisible(true);
        
        // Показываем сообщение
        this.infoText.setText("Подключение к игре...");
        this.infoText.setColor("#FFF");
        
        try {
            console.log('Calling rtc.joinMatch with code:', codeToJoin);
            // ВАЖНО: joinMatch делает нас гостем (не хостом)
            await this.rtc.joinMatch(codeToJoin);
            
            // ✅ ПРОВЕРКА: убеждаемся что мы гость
            if (this.rtc.getIsHost()) {
                console.error('⚠️ ERROR: Auto-joined from URL but marked as HOST!');
                throw new Error('Invalid role assignment');
            }
            
            console.log('✅ Successfully auto-joined from URL as GUEST');
            
            // После успешного подключения игра запустится автоматически
            // через callback dataChannel.onopen
            
        } catch (err) {
            console.error('Failed to auto-join from URL:', err);
            this.infoText.setText("❌ Не удалось подключиться. Игра не найдена или уже началась.");
            this.infoText.setColor("#f44336");
        }
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
        this.background = this.add.image(w / 2, h / 2, "beach").setDisplaySize(w, h);
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
        
        this.localGameButton = this.createButton(w / 2, h * 0.35, "🎮 Локальная игра", "#4CAF50", buttonSize);
        this.localGameButton.on("pointerdown", () => this.startLocalGame());

        this.hostButton = this.createButton(w / 2, h * 0.48, "🌐 Создать онлайн игру", "#2196F3", buttonSize);
        this.hostButton.on("pointerdown", () => this.createOnlineGame());

        this.joinButton = this.createButton(w / 2, h * 0.61, "🔗 Присоединиться к игре", "#FF9800", buttonSize);
        this.joinButton.on("pointerdown", () => this.showJoinScreen());

        // === ЭКРАН СОЗДАНИЯ ИГРЫ ===
        
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
        
        // Кнопка "Поделиться ссылкой"
        const shareLinkButton = this.createButton(0, h * 0.09, "🔗 Поделиться ссылкой", "#9C27B0", smallSize);
        shareLinkButton.on("pointerdown", () => this.shareGameLink());
        
        this.waitingText = this.add.text(0, h * 0.16, "Ожидание соперника...", {
            fontSize: `${smallSize}px`,
            color: "#FFD700",
            fontFamily: "Arial"
        }).setOrigin(0.5);
        
        this.matchCodeContainer.add([codeBg, this.matchCodeText, this.matchCodeValue, this.copyButton, shareLinkButton, this.waitingText]);
        this.matchCodeContainer.setVisible(false);

        // === ЭКРАН ПРИСОЕДИНЕНИЯ ===
        
        this.joinContainer = this.add.container(w / 2, h * 0.35);
        
        const joinBg = this.add.rectangle(0, 0, w * 0.85, h * 0.65, 0x1a1a1a, 0.95);
        joinBg.setStrokeStyle(3, 0xFF9800);
        
        const joinTitle = this.add.text(0, -h * 0.25, "Код игры:", {
            fontSize: `${smallSize}px`,
            color: "#fff",
            fontFamily: "Arial"
        }).setOrigin(0.5);
        
        // Поле отображения кода (только для показа, не интерактивное)
        this.joinInputBg = this.add.rectangle(0, -h * 0.15, w * 0.7, buttonSize * 2.2, 0x333333, 1);
        this.joinInputBg.setStrokeStyle(2, 0xFF9800);
        
        this.joinCodeText = this.add.text(0, -h * 0.15, "Код не введен", {
            fontSize: `${Math.round(smallSize * 0.9)}px`,
            color: "#999",
            fontFamily: "Courier New",
            align: "center"
        }).setOrigin(0.5);
        
        // Кнопка "Ввести код"
        const enterCodeButton = this.createButton(0, -h * 0.04, "✏️ Ввести код", "#2196F3", smallSize);
        enterCodeButton.on("pointerdown", () => this.promptForCode());
        
        // Кнопка "Вставить ссылку"
        const pasteLinkButton = this.createButton(0, h * 0.02, "🔗 Вставить ссылку", "#9C27B0", Math.round(smallSize * 0.9));
        pasteLinkButton.on("pointerdown", () => this.promptForLink());
        
        // Кнопка "Очистить" 
        this.joinClearButton = this.createButton(0, h * 0.08, "🗑️ Очистить", "#666", Math.round(smallSize * 0.85));
        this.joinClearButton.setVisible(false);
        this.joinClearButton.on("pointerdown", () => {
            this.inputCode = "";
            this.joinCodeText.setText("Код не введен");
            this.joinCodeText.setColor("#999");
            this.joinClearButton.setVisible(false);
        });
        
        this.confirmJoinButton = this.createButton(0, h * 0.18, "✅ Подключиться", "#4CAF50", smallSize);
        this.confirmJoinButton.on("pointerdown", () => this.joinGame());
        
        this.cancelJoinButton = this.createButton(0, h * 0.26, "❌ Отмена", "#f44336", smallSize);
        this.cancelJoinButton.on("pointerdown", () => this.showMainMenu());
        
        this.joinContainer.add([
            joinBg, 
            joinTitle, 
            this.joinInputBg, 
            this.joinCodeText,
            enterCodeButton,
            pasteLinkButton,
            this.joinClearButton,
            this.confirmJoinButton, 
            this.cancelJoinButton
        ]);
        this.joinContainer.setVisible(false);

        // Кнопка возврата
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
        const wsUrl = isDev ? 'ws://localhost:8080' : 'wss://game.kvadrat.tech/ws';

        console.log('Connecting to WebSocket server:', wsUrl);

        this.rtc = new WebRTCService(wsUrl, (dc) => {
            console.log('=== DataChannel callback in MainMenu ===');
            console.log('DataChannel received, isHost:', this.rtc.getIsHost());
            console.log('Match code:', this.currentMatchCode || this.inputCode);
            
            dc.onopen = () => {
                console.log('=== Data channel opened! ===');
                console.log('My role:', this.rtc.getIsHost() ? 'HOST (Player 1)' : 'GUEST (Player 2)');
                console.log('Match ID:', this.rtc.getMatchId());
                
                // Небольшая задержка для визуальной обратной связи
                this.infoText.setText("✅ Подключено! Запуск игры...");
                this.infoText.setColor("#4CAF50");
                
                // Даем пользователю увидеть сообщение
                this.time.delayedCall(800, () => {
                    this.startMultiplayerGame();
                });
            };
            dc.onerror = (err) => {
                this.showError("Ошибка соединения");
                console.error('Data channel error:', err);
            };
            dc.onclose = () => {
                console.log('Data channel closed');
            };
        });
        
        // ПОСЛЕ инициализации WebRTC проверяем URL для автоматического присоединения
        if (this.autoJoinCode) { // ✅ Используем отдельную переменную
            console.log('Auto-joining from URL with code:', this.autoJoinCode);
            this.showWelcomeMessage();
            // Увеличили задержку до 2.5 секунд чтобы UI точно успел загрузиться
            this.time.delayedCall(2500, () => {
                this.autoJoinFromURL();
            });
        }
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
        this.inputCode = "";
    }

    private hideMainMenu() {
        this.localGameButton.setVisible(false);
        this.hostButton.setVisible(false);
        this.joinButton.setVisible(false);
    }

    // === ЛОКАЛЬНАЯ ИГРА ===

    private startLocalGame() {
        console.log('Starting local game, requesting fullscreen...');
        
        // Запрашиваем fullscreen для мобильных
        if (this.isMobile()) {
            this.requestFullscreenBeforeGame();
        }
        
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
            this.infoText.setColor("#FFF");
            
            const matchId = await this.rtc.createMatch();
            this.currentMatchCode = matchId; // Сохраняем как есть
            
            this.matchCodeValue.setText(this.currentMatchCode);
            this.matchCodeContainer.setVisible(true);
            this.backButton.setVisible(true);
            this.isInLobby = true;
            this.infoText.setText("");
            
            console.log('Game created with code:', this.currentMatchCode);
            
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
                        this.infoText.setText("✅ Код скопирован в буфер обмена!");
                        this.infoText.setColor("#4CAF50");
                        this.time.delayedCall(3000, () => {
                            if (this.isInLobby) {
                                this.infoText.setText("");
                            }
                        });
                    })
                    .catch(() => {
                        this.showCodeFallback(this.currentMatchCode);
                    });
            } else {
                this.showCodeFallback(this.currentMatchCode);
            }
        }
    }

    private shareGameLink() {
        if (!this.currentMatchCode) return;
        
        // Создаем ссылку с кодом игры
        const gameUrl = `${window.location.origin}${window.location.pathname}?code=${this.currentMatchCode}`;
        
        console.log('Sharing game link:', gameUrl);
        
        // Проверяем поддержку Web Share API (для мобильных)
        if (navigator.share) {
            navigator.share({
                title: 'Волейбол - Присоединяйся к игре!',
                text: `Присоединяйся к игре в волейбол! Код: ${this.currentMatchCode}`,
                url: gameUrl
            })
            .then(() => {
                console.log('Successfully shared');
                this.infoText.setText("✅ Ссылка отправлена!");
                this.infoText.setColor("#4CAF50");
                this.time.delayedCall(3000, () => {
                    if (this.isInLobby) this.infoText.setText("");
                });
            })
            .catch((err) => {
                console.log('Share cancelled or failed:', err);
                // Если отменили - просто копируем ссылку
                this.copyGameLink(gameUrl);
            });
        } else {
            // Для desktop - копируем ссылку в буфер
            this.copyGameLink(gameUrl);
        }
    }
    
    private copyGameLink(gameUrl: string) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(gameUrl)
                .then(() => {
                    this.infoText.setText("✅ Ссылка скопирована! Отправьте другу.");
                    this.infoText.setColor("#4CAF50");
                    this.time.delayedCall(4000, () => {
                        if (this.isInLobby) this.infoText.setText("");
                    });
                })
                .catch(() => {
                    this.showLinkFallback(gameUrl);
                });
        } else {
            this.showLinkFallback(gameUrl);
        }
    }
    
    private showLinkFallback(gameUrl: string) {
        if (window.Telegram?.WebApp) {
            shareUrl(gameUrl);
        } else {
            prompt("Скопируйте ссылку на игру:", gameUrl);
        }
    }
    
    private showCodeFallback(code: string) {
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.showAlert(`Код игры:\n\n${code}\n\nСкопируйте его и отправьте другу!`);
        } else {
            const message = `Код игры: ${code}\n\nСкопируйте его и отправьте другу!`;
            this.infoText.setText(`📋 Код: ${code}`);
            this.infoText.setColor("#FFD700");
            alert(message);
        }
    }

    // === ПРИСОЕДИНЕНИЕ К ИГРЕ ===

    private showJoinScreen() {
        this.hideMainMenu();
        this.joinContainer.setVisible(true);
        this.backButton.setVisible(true);
        this.isInLobby = true;
        this.inputCode = "";
        this.joinCodeText.setText("Код не введен");
        this.joinCodeText.setColor("#999");
        
        if (this.joinClearButton) {
            this.joinClearButton.setVisible(false);
        }
        
        console.log('Join screen shown');
    }

    private promptForCode() {
        let promptText = "Вставьте код игры:";
        
        if (this.isMobile()) {
            promptText += "\n\n(Удерживайте поле и выберите 'Вставить')";
        }
        
        const code = prompt(promptText);
        
        if (code && code.trim()) {
            this.inputCode = code.trim();
            this.joinCodeText.setText(this.inputCode);
            this.joinCodeText.setColor("#4CAF50");
            this.joinClearButton.setVisible(true);
            
            console.log('Code entered:', this.inputCode);
        } else if (code !== null) {
            this.showError("Введите код игры", false);
        }
    }
    
    private promptForLink() {
        let promptText = "Вставьте ссылку на игру:";
        
        if (this.isMobile()) {
            promptText += "\n\n(Удерживайте поле и выберите 'Вставить')";
        }
        
        const link = prompt(promptText);
        
        if (link && link.trim()) {
            // Извлекаем код из ссылки
            const code = this.extractCodeFromURL(link.trim());
            
            if (code) {
                this.inputCode = code;
                this.joinCodeText.setText(this.inputCode);
                this.joinCodeText.setColor("#4CAF50");
                this.joinClearButton.setVisible(true);
                
                console.log('Code extracted from link:', this.inputCode);
                
                this.infoText.setText("✅ Код извлечен из ссылки!");
                this.infoText.setColor("#4CAF50");
                this.time.delayedCall(2000, () => {
                    if (this.isInLobby) this.infoText.setText("");
                });
            } else {
                this.showError("Не удалось извлечь код из ссылки", false);
            }
        }
    }
    
    private extractCodeFromURL(url: string): string | null {
        try {
            // Пытаемся распарсить как URL
            const urlObj = new URL(url);
            const code = urlObj.searchParams.get('code') || urlObj.searchParams.get('game');
            
            if (code) {
                return code.trim();
            }
        } catch (e) {
            // Если не URL, может быть просто код
            console.log('Not a valid URL, might be just a code');
        }
        
        // Пытаемся найти паттерн ?code= или &code= в строке
        const codeMatch = url.match(/[?&]code=([^&\s]+)/i);
        if (codeMatch && codeMatch[1]) {
            return codeMatch[1].trim();
        }
        
        const gameMatch = url.match(/[?&]game=([^&\s]+)/i);
        if (gameMatch && gameMatch[1]) {
            return gameMatch[1].trim();
        }
        
        return null;
    }
    
    private isMobile(): boolean {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    private async joinGame() {
        if (!this.inputCode || this.inputCode.trim().length === 0) {
            this.showError("Введите код игры", false);
            return;
        }

        try {
            console.log('Attempting to join match:', this.inputCode.trim());
            this.infoText.setText("Подключение...");
            this.infoText.setColor("#FFF");
            
            await this.rtc.joinMatch(this.inputCode.trim());
            
            console.log('Successfully joined match');
        } catch (err) {
            console.error('Failed to join match:', err);
            
            this.infoText.setText("❌ Не удалось подключиться. Проверьте код.");
            this.infoText.setColor("#f44336");
            
            this.time.delayedCall(5000, () => {
                if (this.isInLobby) {
                    this.infoText.setText("");
                }
            });
        }
    }

    // === ЗАПУСК МУЛЬТИПЛЕЕРА ===

    private startMultiplayerGame() {
        console.log('Starting multiplayer game, requesting fullscreen...');
        console.log('Game setup - isHost:', this.rtc.getIsHost(), 'dataChannel ready:', !!this.rtc.getDataChannel());
        
        // ⚠️ ФИНАЛЬНАЯ ПРОВЕРКА
        const isHost = this.rtc.getIsHost();
        const wasAutoJoined = !!this.autoJoinCode; // Если был код в URL
        
        if (wasAutoJoined && isHost) {
            console.error('🚨 CRITICAL ERROR: Auto-joined player is marked as HOST!');
            console.error('This should NEVER happen. Check WebRTCService.joinMatch()');
        }
        
        // Запрашиваем fullscreen перед запуском игры
        this.requestFullscreenBeforeGame();
        
        // Запускаем игру с правильными параметрами
        const gameConfig = {
            isMultiplayer: true,
            isHost: isHost, // Это КРИТИЧЕСКИ важно!
            dataChannel: this.rtc.getDataChannel()
        };
        
        console.log('Launching Game scene with config:', gameConfig);
        console.log('Player role:', isHost ? '🏠 HOST (Player 1 - LEFT)' : '👤 GUEST (Player 2 - RIGHT)');
        
        this.scene.start("Game", gameConfig);
    }
    
    private async requestFullscreenBeforeGame() {
        // Проверяем мобильное устройство
        const isMobile = this.isMobile();
        
        if (!isMobile) {
            console.log('Desktop detected, skipping fullscreen request');
            return;
        }
        
        console.log('Mobile detected, requesting fullscreen');
        
        try {
            // Импортируем функции из telegram.ts
            const { requestFullscreen, isTelegramMobilePlatform } = await import('../../telegram');
            
            const isTgMobile = isTelegramMobilePlatform();
            
            if (isTgMobile) {
                console.log('Telegram mobile platform, using Telegram API');
                await requestFullscreen();
            } else {
                console.log('Regular mobile browser, using HTML5 Fullscreen API');
                await this.requestHTML5Fullscreen();
            }
            
            console.log('Fullscreen request successful');
        } catch (err) {
            console.error('Failed to enter fullscreen:', err);
            // Не критично, продолжаем игру
        }
    }
    
    private async requestHTML5Fullscreen(): Promise<void> {
        try {
            const elem = document.documentElement;
            
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if ((elem as any).webkitRequestFullscreen) {
                await (elem as any).webkitRequestFullscreen();
            } else if ((elem as any).mozRequestFullScreen) {
                await (elem as any).mozRequestFullScreen();
            } else if ((elem as any).msRequestFullscreen) {
                await (elem as any).msRequestFullscreen();
            }
            
            // Блокируем ориентацию в landscape если возможно
            if (screen.orientation && (screen.orientation as any).lock) {
                try {
                    await (screen.orientation as any).lock('landscape');
                } catch (e) {
                    console.warn('Could not lock orientation:', e);
                }
            }
        } catch (err) {
            console.error('HTML5 fullscreen request failed:', err);
            throw err;
        }
    }

    // === ОТМЕНА И ВЫХОД ===

    private cancelLobby() {
        this.rtc.disconnect();
        this.showMainMenu();
    }

    private showError(message: string, returnToMenu: boolean = true) {
        this.infoText.setText("❌ " + message);
        this.infoText.setColor("#f44336");
        
        if (returnToMenu) {
            this.time.delayedCall(3000, () => {
                this.showMainMenu();
            });
        } else {
            // Просто очищаем сообщение через 3 секунды
            this.time.delayedCall(3000, () => {
                if (this.isInLobby) {
                    this.infoText.setText("");
                }
            });
        }
    }

    // === API для внешнего вызова ===

    changeScene() {
        this.startLocalGame();
    }
    
    // Обработка изменения размера окна
    resize(gameSize: Phaser.Structs.Size) {
        const width = gameSize.width;
        const height = gameSize.height;
        
        console.log('MainMenu resize event:', { width, height });
        this.updateOrientation();
    }
}