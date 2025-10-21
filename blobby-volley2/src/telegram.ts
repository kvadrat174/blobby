// telegram.ts
export interface TelegramWebApp {
    initData: string;
    initDataUnsafe: {
        user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
        };
        start_param?: string;
    };
    version: string;
    platform: string;
    colorScheme: 'light' | 'dark';
    themeParams: any;
    isExpanded: boolean;
    viewportHeight: number;
    viewportStableHeight: number;
    headerColor: string;
    backgroundColor: string;
    BackButton: any;
    MainButton: any;
    
    // Viewport info
    isFullscreen?: boolean;
    
    // Methods
    ready: () => void;
    expand: () => void;
    close: () => void;
    enableClosingConfirmation: () => void;
    disableClosingConfirmation: () => void;
    requestFullscreen?: () => Promise<boolean>;
    exitFullscreen?: () => Promise<boolean>;
    onEvent: (eventType: string, callback: (data?: any) => void) => void;
    offEvent: (eventType: string, callback: (data?: any) => void) => void;
    sendData: (data: string) => void;
    openLink: (url: string) => void;
    openTelegramLink: (url: string) => void;
    showPopup: (params: any, callback?: (id: string) => void) => void;
    showAlert: (message: string, callback?: () => void) => void;
    showConfirm: (message: string, callback?: (ok: boolean) => void) => void;
    HapticFeedback: {
        impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        selectionChanged: () => void;
    };
}

declare global {
    interface Window {
        Telegram?: {
            WebApp: TelegramWebApp;
        };
    }
}

export const tg = window.Telegram?.WebApp;

export function initTelegram() {
    if (!tg) {
        console.warn('Telegram WebApp не найден. Запуск в обычном режиме.');
        return null;
    }

    try {
        tg.ready();
        tg.expand();
        tg.BackButton.hide();
        tg.enableClosingConfirmation();

        console.log('Telegram Mini App initialized:', {
            version: tg.version,
            platform: tg.platform,
            user: tg.initDataUnsafe.user,
            viewportHeight: tg.viewportHeight,
            isExpanded: tg.isExpanded,
            isFullscreen: tg.isFullscreen
        });

        // Слушаем изменения viewport для адаптации
        tg.onEvent('viewportChanged', (data) => {
            console.log('Viewport changed:', {
                height: tg.viewportHeight,
                stableHeight: tg.viewportStableHeight,
                isExpanded: tg.isExpanded,
                isFullscreen: tg.isFullscreen,
                data
            });
            window.dispatchEvent(new Event('resize'));
        });

    } catch (error) {
        console.error('Ошибка инициализации Telegram WebApp:', error);
    }

    return tg;
}

export function isMobileDevice(): boolean {
    if (tg) {
        const mobilePlatforms = ['android', 'ios', 'android_x', 'ios_x'];
        return mobilePlatforms.includes(tg.platform.toLowerCase());
    }
    
    const ua = navigator.userAgent.toLowerCase();
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
    
    return mobileRegex.test(ua) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
}

export function isTelegramMobilePlatform(): boolean {
    if (!tg) return false;
    const mobilePlatforms = ['android', 'ios', 'android_x', 'ios_x'];
    return mobilePlatforms.includes(tg.platform.toLowerCase());
}

/**
 * Запрос полноэкранного режима через Telegram API (только для мобильных)
 * Для desktop использует стандартный HTML5 Fullscreen API
 */
export async function requestFullscreen(): Promise<boolean> {
    // Для Telegram Mobile используем их API
    if (tg && isTelegramMobilePlatform()) {
        if (typeof tg.requestFullscreen === 'function') {
            try {
                const result = await tg.requestFullscreen();
                console.log('Telegram fullscreen requested:', result);
                
                // Блокируем ориентацию в landscape
                await lockOrientationLandscape();
                
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }
                
                return true;
            } catch (error) {
                console.error('Ошибка запроса fullscreen через Telegram:', error);
            }
        } else {
            console.warn('requestFullscreen не поддерживается в версии Telegram WebApp', tg.version);
        }
    }
    
    // Fallback на стандартный HTML5 Fullscreen API для desktop или если Telegram API недоступен
    if (!isTelegramMobilePlatform()) {
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
            
            await lockOrientationLandscape();
            return true;
        } catch (error) {
            console.error('Ошибка входа в fullscreen (HTML5):', error);
        }
    }
    
    return false;
}

/**
 * Выход из полноэкранного режима
 */
export async function exitFullscreen(): Promise<boolean> {
    // Для Telegram Mobile
    if (tg && isTelegramMobilePlatform() && typeof tg.exitFullscreen === 'function') {
        try {
            const result = await tg.exitFullscreen();
            console.log('Telegram fullscreen exited:', result);
            return true;
        } catch (error) {
            console.error('Ошибка выхода из fullscreen через Telegram:', error);
        }
    }
    
    // Для desktop или fallback
    try {
        if (document.exitFullscreen) {
            await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
            await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
            await (document as any).msExitFullscreen();
        }
        return true;
    } catch (error) {
        console.error('Ошибка выхода из fullscreen:', error);
    }
    
    return false;
}

/**
 * Проверка, находится ли приложение в fullscreen
 */
export function isInFullscreen(): boolean {
    // Проверяем через Telegram API если доступно
    if (tg && isTelegramMobilePlatform()) {
        return tg.isFullscreen === true;
    }
    
    // Проверяем через стандартный API
    return !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
    );
}

/**
 * Блокировка ориентации в landscape
 */
async function lockOrientationLandscape(): Promise<boolean> {
    try {
        if (screen.orientation && (screen.orientation as any).lock) {
            await (screen.orientation as any).lock('landscape');
            console.log('Ориентация заблокирована: landscape');
            return true;
        }
    } catch (error) {
        console.warn('Не удалось заблокировать ориентацию:', error);
    }
    return false;
}

/**
 * Разблокировка ориентации
 */
export function unlockOrientation() {
    try {
        if (screen.orientation && (screen.orientation as any).unlock) {
            (screen.orientation as any).unlock();
            console.log('Ориентация разблокирована');
        }
    } catch (error) {
        console.warn('Не удалось разблокировать ориентацию:', error);
    }
}

/**
 * Поделиться ссылкой через Telegram
 * @param url - URL для шэринга
 * @param text - Текст сообщения (опционально)
 */
export function shareUrl(url: string, text?: string): boolean {
    if (!tg) {
        console.warn('Telegram WebApp недоступен');
        // Fallback на стандартный Web Share API
        return fallbackShare(url, text);
    }

    try {
        // Формируем сообщение
        const message = text ? `${text}\n${url}` : url;
        
        // Используем Telegram Share API
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
        
        tg.openTelegramLink(shareUrl);
        
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }
        
        console.log('Ссылка отправлена на шэринг:', { url, text });
        return true;
    } catch (error) {
        console.error('Ошибка шэринга через Telegram:', error);
        return fallbackShare(url, text);
    }
}

/**
 * Пригласить друга (специальный метод для реферальных ссылок)
 * @param botUsername - имя бота (без @)
 * @param startParam - параметр для start (например, реферальный код)
 * @param text - текст приглашения
 */
export function inviteFriend(botUsername: string, startParam: string, text?: string): boolean {
    if (!tg) {
        console.warn('Telegram WebApp недоступен');
        return false;
    }

    try {
        const inviteUrl = `https://t.me/${botUsername}?start=${startParam}`;
        const message = text || `Присоединяйся к игре!`;
        
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(message)}`;
        
        tg.openTelegramLink(shareUrl);
        
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium');
        }
        
        console.log('Приглашение отправлено:', { botUsername, startParam, text });
        return true;
    } catch (error) {
        console.error('Ошибка отправки приглашения:', error);
        return false;
    }
}

/**
 * Поделиться результатом игры
 * @param score - счет игрока
 * @param botUsername - имя бота
 * @param startParam - реферальный параметр (опционально)
 */
export function shareGameResult(score: number, botUsername: string, startParam?: string): boolean {
    const text = `🎮 Я набрал ${score} очков! Сможешь побить мой рекорд?`;
    const url = startParam 
        ? `https://t.me/${botUsername}?start=${startParam}`
        : `https://t.me/${botUsername}`;
    
    return shareUrl(url, text);
}

/**
 * Fallback на стандартный Web Share API
 */
function fallbackShare(url: string, text?: string): boolean {
    if (navigator.share) {
        try {
            navigator.share({
                title: text || 'Поделиться',
                text: text,
                url: url
            });
            return true;
        } catch (error) {
            console.error('Ошибка Web Share API:', error);
        }
    }
    
    // Последний fallback - копирование в буфер обмена
    try {
        navigator.clipboard.writeText(url);
        console.log('Ссылка скопирована в буфер обмена');
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }
        return true;
    } catch (error) {
        console.error('Ошибка копирования в буфер обмена:', error);
        return false;
    }
}

/**
 * Открыть внешнюю ссылку
 * @param url - URL для открытия
 * @param tryInstantView - попытаться открыть в Instant View (только для некоторых сайтов)
 */
export function openExternalLink(url: string, tryInstantView: boolean = false): void {
    if (!tg) {
        window.open(url, '_blank');
        return;
    }

    try {
        if (tryInstantView) {
            tg.openTelegramLink(url);
        } else {
            tg.openLink(url);
        }
        
        if (tg.HapticFeedback) {
            tg.HapticFeedback.selectionChanged();
        }
    } catch (error) {
        console.error('Ошибка открытия ссылки:', error);
        window.open(url, '_blank');
    }
}