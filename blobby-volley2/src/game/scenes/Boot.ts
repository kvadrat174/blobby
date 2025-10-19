import { Scene } from 'phaser';

export class Boot extends Scene
{
    constructor ()
    {
        super('Boot');
    }

    preload ()
    {
        //  The Boot Scene is typically used to load in any assets you require for your Preloader, such as a game logo or background.
        //  The smaller the file size of the assets, the better, as the Boot Scene itself has no preloader.

        this.load.image('background', 'assets/bg.png');
        this.load.image('beach', 'assets/beach.jpg');
        this.load.image('volley-net', 'assets/pole_whole.png');
        this.load.image('ball', 'assets/ball.png');

        this.load.image('playerLeft', 'assets/playerleft.png');
        this.load.image('playerRight', 'assets/playerright.png');
    }

    create ()
    {
        this.scene.start('Preloader');
    }
}
