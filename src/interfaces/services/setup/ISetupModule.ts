import { AttachmentBuilder, ContainerBuilder } from "discord.js";
import BotClient from "../../../client/BotClient";

export interface ISetupView {
    components: ContainerBuilder[];
    files: AttachmentBuilder[];
}

export default interface ISetupModule {
    /** Muss dem "value" der passenden Option in setup.json entsprechen. */
    readonly key: string;

    /** Einzeiler für die Übersicht, z. B. "🟢 Aktiv · <#123>". */
    Status(client: BotClient, guildId: string): Promise<string>;

    /**
     * Legt den Panel-Zustand für diese Nachricht an und rendert die erste Ansicht.
     * Ab da bedient der Handler des Moduls seine eigenen customIds auf derselben Nachricht.
     */
    Open(client: BotClient, guildId: string, messageId: string): Promise<ISetupView>;
}
