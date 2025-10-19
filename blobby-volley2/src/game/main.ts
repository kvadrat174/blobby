import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { AUTO, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';

// Определяем мобильное устройство
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Получаем реальные размеры окна
let width = window.innerWidth;
const height = window.innerHeight;

// Для мобильных в landscape: фиксируем соотношение сторон
if (isMobile && width > height) {
    // Соотношение 16:9 для лучшей совместимости
    const aspectRatio = 16 / 9;
    const currentRatio = width / height;
    
    if (currentRatio > aspectRatio) {
        // Слишком широкий - ограничиваем ширину
        width = height * aspectRatio;
    }
}

//  Адаптивная конфигурация игры для любых экранов
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: width,
    height: height,
    parent: 'game-container',
    backgroundColor: '#028af8',
    scale: {
        mode: Phaser.Scale.FIT,
        parent: 'game-container',
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: width,
        height: height
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 }, // Гравитация контролируется индивидуально для каждого объекта
            debug: true // Включите true для отладки столкновений
        }
    },
    input: {
        keyboard: true,
        activePointers: 3 // Поддержка нескольких касаний для мобильных
    },
    scene: [
        Boot,
        Preloader,
        MainMenu,
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
}

export default StartGame;