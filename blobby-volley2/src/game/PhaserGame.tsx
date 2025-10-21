// PhaserGame.tsx
import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import StartGame from './main';
import { EventBus } from './EventBus';

export interface IRefPhaserGame {
    game: Phaser.Game | null;
    scene: Phaser.Scene | null;
}

interface IProps {
    currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

export const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame({ currentActiveScene }, ref) {
    const game = useRef<Phaser.Game | null>(null);

    useLayoutEffect(() => {
        if (game.current === null) {
            // Создаем игру с текущими размерами окна
            // Каждая сцена сама определит свою ориентацию
            const width = window.innerWidth;
            const height = window.innerHeight;

            console.log('Creating Phaser game with initial size:', { width, height });

            game.current = StartGame('game-container', width, height);

            if (typeof ref === 'function') {
                ref({ game: game.current, scene: null });
            } else if (ref) {
                ref.current = { game: game.current, scene: null };
            }
        }

        return () => {
            if (game.current) {
                game.current.destroy(true);
                game.current = null;
            }
        };
    }, [ref]);

    useEffect(() => {
        EventBus.on('current-scene-ready', (scene_instance: Phaser.Scene) => {
            if (currentActiveScene && typeof currentActiveScene === 'function') {
                currentActiveScene(scene_instance);
            }

            if (typeof ref === 'function') {
                ref({ game: game.current, scene: scene_instance });
            } else if (ref) {
                ref.current = { game: game.current, scene: scene_instance };
            }

            // Обновляем класс canvas в зависимости от сцены
            updateCanvasClass(scene_instance.scene.key);
        });
        
        return () => {
            EventBus.removeListener('current-scene-ready');
        };
    }, [currentActiveScene, ref]);

    // Функция для обновления класса canvas
    const updateCanvasClass = (sceneKey: string) => {
        if (!game.current) return;
        
        const canvas = game.current.canvas;
        if (!canvas) return;

        const isPortraitDevice = window.innerHeight > window.innerWidth;
        
        // Удаляем все классы
        canvas.classList.remove('game-landscape', 'menu-portrait');
        
        if (sceneKey === 'Game' && isPortraitDevice) {
            // Игра в landscape на портретном устройстве - нужна ротация
            canvas.classList.add('game-landscape');
        } else if (sceneKey !== 'Game' && !isPortraitDevice) {
            // Меню в portrait на ландшафтном устройстве - нужна ротация
            canvas.classList.add('menu-portrait');
        }
        
        console.log('Canvas class updated:', {
            sceneKey,
            isPortraitDevice,
            classes: canvas.className
        });
    };

    // Слушаем изменения размера окна и обновляем размер игры
    // НО сохраняем ориентацию текущей сцены
    useEffect(() => {
        const handleResize = () => {
            if (game.current && game.current.scene.scenes.length > 0) {
                const currentScene = game.current.scene.getScenes(true)[0];
                const sceneName = currentScene?.scene.key;
                
                const width = window.innerWidth;
                const height = window.innerHeight;
                
                console.log('Window resized:', { width, height, scene: sceneName });
                
                // Определяем какую ориентацию нужно использовать
                let finalWidth, finalHeight;
                
                if (sceneName === 'Game') {
                    // Игра всегда в ландшафте (широкая сторона = ширина)
                    finalWidth = Math.max(width, height);
                    finalHeight = Math.min(width, height);
                } else {
                    // Меню всегда в портрете (узкая сторона = ширина)
                    finalWidth = Math.min(width, height);
                    finalHeight = Math.max(width, height);
                }
                
                console.log('Applying size:', { finalWidth, finalHeight, scene: sceneName });
                
                // Обновляем размеры игры
                game.current.scale.resize(finalWidth, finalHeight);
                
                // Обновляем класс canvas
                updateCanvasClass(sceneName || '');
                
                // Обновляем камеру текущей сцены
                if (currentScene && currentScene.cameras && currentScene.cameras.main) {
                    currentScene.cameras.main.setSize(finalWidth, finalHeight);
                    
                    // Вызываем resize на сцене если метод существует
                    if (typeof (currentScene as any).resize === 'function') {
                        (currentScene as any).resize({ width: finalWidth, height: finalHeight });
                    }
                }
            }
        };

        window.addEventListener('resize', handleResize);
        
        const handleOrientationChange = () => {
            // Задержка для корректного получения новых размеров
            setTimeout(handleResize, 150);
        };
        
        window.addEventListener('orientationchange', handleOrientationChange);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleOrientationChange);
        };
    }, []);

    return (
        <div 
            id="game-container" 
            style={{ 
                width: '100%', 
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#000'
            }}
        />
    );
});