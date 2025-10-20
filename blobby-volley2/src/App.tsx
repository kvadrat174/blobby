import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './game/PhaserGame';
import { 
    initTelegram, 
    isMobileDevice, 
    isTelegramMobilePlatform,
    requestFullscreen,
    isInFullscreen,
    tg 
} from './telegram';
import { useLandscapeMode } from './useLandscapeMode';

function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isMobile] = useState(isMobileDevice());
    const [isTgMobile] = useState(isTelegramMobilePlatform());
    const [isFullscreen, setIsFullscreen] = useState(false);
    const landscapeSize = useLandscapeMode();

    // Функция входа в полноэкранный режим
    const enterFullscreen = async () => {
        try {
            const success = await requestFullscreen();
            if (success) {
                setIsFullscreen(true);
            }
        } catch (err) {
            console.error('Ошибка входа в полноэкранный режим:', err);
        }
    };

    // Основная инициализация
    useEffect(() => {
        initTelegram();

        // Обработчик изменений fullscreen для HTML5 API (desktop)
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = isInFullscreen();
            setIsFullscreen(isCurrentlyFullscreen);
        };

        // Обработчик изменений viewport для Telegram (mobile)
        const handleViewportChanged = () => {
            if (tg) {
                setIsFullscreen(tg.isFullscreen === true);
            }
        };

        // Подписываемся на события в зависимости от платформы
        if (isTgMobile && tg) {
            // Для Telegram Mobile отслеживаем через их API
            tg.onEvent('viewportChanged', handleViewportChanged);
            
            // Проверяем начальное состояние
            if (tg.isFullscreen !== undefined) {
                setIsFullscreen(tg.isFullscreen);
            }
        } else {
            // Для desktop используем стандартные события
            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        }

        setIsReady(true);

        // Показываем кнопку fullscreen только для мобильных
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn && isMobile) {
            fullscreenBtn.classList.add('show');
            fullscreenBtn.addEventListener('click', enterFullscreen);
        }

        // Автоматический вход в fullscreen по первому касанию (только мобильные)
        let firstInteraction = true;
        const handleFirstTouch = () => {
            if (firstInteraction && isMobile && !isFullscreen) {
                firstInteraction = false;
                // Небольшая задержка для корректной работы
                setTimeout(() => enterFullscreen(), 200);
            }
        };

        if (isMobile) {
            document.addEventListener('touchstart', handleFirstTouch, { once: true, passive: true });
            document.addEventListener('click', handleFirstTouch, { once: true });
        }

        return () => {
            if (isTgMobile && tg) {
                tg.offEvent('viewportChanged', handleViewportChanged);
            } else {
                document.removeEventListener('fullscreenchange', handleFullscreenChange);
                document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
                document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            }
            
            document.removeEventListener('touchstart', handleFirstTouch);
            document.removeEventListener('click', handleFirstTouch);
            
            if (fullscreenBtn) {
                fullscreenBtn.removeEventListener('click', enterFullscreen);
            }
        };
    }, [isMobile, isTgMobile, isFullscreen]);

    // Синхронизация размеров с Phaser при изменении landscape размеров
    useEffect(() => {
        if (phaserRef.current?.game && landscapeSize) {
            const { width, height } = landscapeSize;
            phaserRef.current.game.scale.resize(width, height);
        }
    }, [landscapeSize]);

    const currentScene = (scene: Phaser.Scene) => {
        console.log('Current scene:', scene.scene.key);
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }
    };

    if (!isReady) {
        return (
            <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                color: '#fff',
                fontFamily: 'Arial, sans-serif'
            }}>
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        border: '4px solid #0f3460',
                        borderTop: '4px solid #4CAF50',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        margin: '0 auto 24px'
                    }} />
                    <h2 style={{ 
                        fontSize: '24px', 
                        marginBottom: '12px',
                        fontWeight: 'bold',
                        letterSpacing: '1px'
                    }}>
                        🏐 Волейбол
                    </h2>
                    <p style={{ fontSize: '16px', color: '#a0a0a0' }}>
                        Загрузка игры...
                    </p>
                    {isMobile && !isFullscreen && (
                        <div style={{ 
                            marginTop: '32px', 
                            padding: '16px',
                            background: 'rgba(76, 175, 80, 0.1)',
                            borderRadius: '12px',
                            border: '1px solid rgba(76, 175, 80, 0.3)',
                            maxWidth: '320px',
                            margin: '32px auto 0'
                        }}>
                            <p style={{ 
                                fontSize: '14px', 
                                color: '#4CAF50',
                                marginBottom: '8px',
                                fontWeight: 'bold'
                            }}>
                                💡 Совет
                            </p>
                            <p style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.5' }}>
                                {isTgMobile 
                                    ? 'Нажмите на экран для полноэкранного режима' 
                                    : 'Для лучшего опыта поверните устройство горизонтально'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div id="app" style={{ 
            width: '100%', 
            height: '100%',
            overflow: 'hidden',
            position: 'relative'
        }}>
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            
            {/* Индикатор fullscreen режима */}
            {isFullscreen && isTgMobile && (
                <div style={{
                    position: 'fixed',
                    top: '10px',
                    left: '10px',
                    background: 'rgba(76, 175, 80, 0.8)',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    zIndex: 9998,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    <span>🔳</span>
                    Полный экран
                </div>
            )}
        </div>
    );
}

export default App;