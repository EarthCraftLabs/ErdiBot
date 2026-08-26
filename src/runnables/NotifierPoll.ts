import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";
import logger from "../utils/logger";

export default class NotifierPoll extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "NotifierPoll",
            description: "Prüft YouTube und Twitch auf neue Streams und Videos",
            type: TaskTypes.INTERVAL,
            // Der Takt ist die Untergrenze, nicht die Frequenz: jede Plattform hat ihr eigenes
            // Intervall (Twitch 1 Min., YouTube 5 Min.) und wird nur geprüft,
            // wenn ihres abgelaufen ist. Ein kürzerer Takt hier erzeugt keine einzige Anfrage mehr.
            expression: "1m",
        });
    }

    async Execute(): Promise<void> {
        const summary = await this.client.notifierService.Poll();

        if (summary.checked === 0) return;

        logger.tasks(
            `🔔 Notifier: ${summary.checked} geprüft, ${summary.notified} gemeldet, ` +
                `${summary.skipped} übersprungen${summary.failed > 0 ? `, ${summary.failed} fehlgeschlagen` : ""}`
        );
    }
}
