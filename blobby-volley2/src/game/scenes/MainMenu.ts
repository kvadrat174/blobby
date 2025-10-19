import { GameObjects, Scene } from "phaser";
import { EventBus } from "../EventBus";
import { WebRTCService } from "../WebRTCService";

export class MainMenu extends Scene {
    background!: GameObjects.Image;
    title!: GameObjects.Text;
    hostButton!: GameObjects.Text;
    joinButton!: GameObjects.Text;
    infoText!: GameObjects.Text;

    private rtc!: WebRTCService;

    constructor() {
        super("MainMenu");
    }

    create() {
        const w = this.scale.width;
        const h = this.scale.height;

        this.background = this.add.image(w / 2, h / 2, "background")
            .setDisplaySize(w, h);

        this.title = this.add.text(w / 2, h * 0.25, "Volley Match", {
            fontFamily: "Arial Black",
            fontSize: "48px",
            color: "#fff",
            stroke: "#000",
            strokeThickness: 6
        }).setOrigin(0.5);

        this.hostButton = this.add.text(w / 2, h * 0.5, "🟢 Создать игру", {
            fontSize: "38px",
            color: "#00ff88",
            backgroundColor: "#00220077",
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();

        this.joinButton = this.add.text(w / 2, h * 0.65, "🔵 Присоединиться", {
            fontSize: "38px",
            color: "#88ccff",
            backgroundColor: "#00113377",
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive();

        this.infoText = this.add.text(w / 2, h * 0.8, "", {
            fontSize: "24px",
            color: "#fff"
        }).setOrigin(0.5);

        this.rtc = new WebRTCService("wss://game.kvadrat.tech/ws", (dc) => {
            dc.onopen = () => {
                this.scene.start("Game", {
                    isMultiplayer: true,
                    isHost: this.rtc["isHost"],
                    dataChannel: dc
                });
            };
        });

        this.hostButton.on("pointerdown", async () => {
            const id = await this.rtc.createMatch();
            this.infoText.setText(`Код игры: ${id}`);
        });

        this.joinButton.on("pointerdown", async () => {
            const code = prompt("Введите код матча:");
            if (code) {
                this.infoText.setText("Подключаемся...");
                await this.rtc.joinMatch(code);
            }
        });

        EventBus.emit("current-scene-ready", this);
    }

    changeScene ()
    {

        this.scene.start('Game');
    }
}
