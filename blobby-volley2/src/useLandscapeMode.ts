// useLandscapeMode.ts - React Hook для управления ландшафтным режимом

import { useEffect, useState } from 'react';

export interface LandscapeSize {
    width: number;
    height: number;
    isLandscape: boolean;
}

export function useLandscapeMode() {
    const [size, setSize] = useState<LandscapeSize>(() => getLandscapeSize());

    useEffect(() => {
        const handleResize = () => {
            setSize(getLandscapeSize());
        };

        const handleOrientationChange = () => {
            // Небольшая задержка для корректного обновления размеров
            setTimeout(handleResize, 100);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleOrientationChange);
        
        // Проверяем изменения viewport для Telegram
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            const viewportHandler = () => {
                console.log('Viewport changed in hook:', {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    viewportHeight: tg.viewportHeight,
                    isExpanded: tg.isExpanded
                });
                handleResize();
            };
            tg.onEvent('viewportChanged', viewportHandler);
            
            return () => {
                window.removeEventListener('resize', handleResize);
                window.removeEventListener('orientationchange', handleOrientationChange);
                tg.offEvent('viewportChanged', viewportHandler);
            };
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleOrientationChange);
        };
    }, []);

    return size;
}

function getLandscapeSize(): LandscapeSize {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isLandscape = width >= height;

    // Всегда возвращаем размеры в ландшафтной ориентации
    return {
        width: Math.max(width, height),
        height: Math.min(width, height),
        isLandscape
    };
}

export function isDeviceInLandscape(): boolean {
    if (window.screen?.orientation) {
        const type = window.screen.orientation.type;
        return type.includes('landscape');
    }
    
    // Fallback для старых браузеров
    return window.innerWidth > window.innerHeight;
}