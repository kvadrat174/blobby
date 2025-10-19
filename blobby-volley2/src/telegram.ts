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
    ready: () => void;
    expand: () => void;
    close: () => void;
    enableClosingConfirmation: () => void;
    disableClosingConfirmation: () => void;
    onEvent: (eventType: string, callback: () => void) => void;
    offEvent: (eventType: string, callback: () => void) => void;
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

    // Инициализируем приложение
    tg.ready();
    
    // Разворачиваем на весь экран
    tg.expand();
    
    // Скрываем кнопку "Назад" по умолчанию
    tg.BackButton.hide();
    
    // Включаем подтверждение закрытия
    tg.enableClosingConfirmation();

    console.log('Telegram Mini App initialized:', {
        version: tg.version,
        platform: tg.platform,
        user: tg.initDataUnsafe.user,
        viewportHeight: tg.viewportHeight
    });

    return tg;
}

export function isMobileDevice(): boolean {
    // Проверяем через Telegram WebApp
    if (tg) {
        const mobilePlatforms = ['android', 'ios', 'android_x', 'ios_x'];
        return mobilePlatforms.includes(tg.platform.toLowerCase());
    }
    
    // Fallback на обычную проверку
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
    
    return mobileRegex.test(userAgent) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
}

export function isLandscape(): boolean {
    return window.innerWidth > window.innerHeight;
}

export function requestLandscape() {
    // Пытаемся войти в полноэкранный режим с альбомной ориентацией
    const elem = document.documentElement;
    
    if (elem.requestFullscreen) {
        elem.requestFullscreen({ navigationUI: 'hide' } as any).catch(err => {
            console.log('Fullscreen request failed:', err);
        });
    }
    
    // Пытаемся заблокировать ориентацию (работает не везде)
    const orientation = screen.orientation as any;
    if (orientation && typeof orientation.lock === 'function') {
        orientation.lock('landscape').catch((err: Error) => {
            console.log('Orientation lock failed:', err);
        });
    }
}