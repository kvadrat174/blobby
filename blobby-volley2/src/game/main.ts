import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { Preloader } from './scenes/Preloader';

export default function StartGame(parent: string, width: number, height: number): Phaser.Game {
    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: width,
        height: height,
        parent: parent,
        backgroundColor: '#028af8',
        scale: {
            mode: Phaser.Scale.NONE, // Отключаем автоматическое масштабирование
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: width,
            height: height
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { x: 0, y: 0 },
                debug: false
            }
        },
        input: {
            keyboard: true,
            activePointers: 3 // Поддержка нескольких касаний
        },
        scene: [
            Boot,
            Preloader,
            MainMenu,
            MainGame,
            GameOver
        ]
    };
    
    return new Phaser.Game(config);
}