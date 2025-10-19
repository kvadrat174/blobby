import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './game/PhaserGame';
import { initTelegram, isMobileDevice, isLandscape, requestLandscape, tg } from './telegram';

function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isMobile] = useState(isMobileDevice());

    useEffect(() => {
        // Инициализируем Telegram Mini App
        const telegram = initTelegram();
        
        // Если мобильное устройство, пытаемся установить альбомную ориентацию
        if (isMobile) {
            requestLandscape();
            
            // Слушаем изменения ориентации
            const handleOrientationChange = () => {
                console.log('Orientation changed:', {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    isLandscape: isLandscape()
                });
            };
            
            window.addEventListener('orientationchange', handleOrientationChange);
            window.addEventListener('resize', handleOrientationChange);
            
            return () => {
                window.removeEventListener('orientationchange', handleOrientationChange);
                window.removeEventListener('resize', handleOrientationChange);
            };
        }
        
        setIsReady(true);
    }, [isMobile]);

    const currentScene = (scene: Phaser.Scene) => {
        console.log('Current scene:', scene.scene.key);
        
        // Haptic feedback при смене сцены (только в Telegram)
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
                background: '#000',
                color: '#fff',
                fontFamily: 'Arial'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                        width: '50px', 
                        height: '50px', 
                        border: '3px solid #444',
                        borderTop: '3px solid #fff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 20px'
                    }} />
                    <p>Загрузка...</p>
                </div>
            </div>
        );
    }

    return (
        <div id="app" style={{ width: '100%', height: '100%' }}>
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
        </div>
    );
}

export default App;