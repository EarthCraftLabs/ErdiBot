import { AttachmentBuilder, ColorResolvable, ContainerBuilder } from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "./ComponentV2Builder";
import IWelcomeConfig from "../interfaces/services/welcome/IWelcomeConfig";
import { IPlaceholderContext } from "../interfaces/services/welcome/IWelcomeService";

export interface IWelcomeMessage {
    components: ContainerBuilder[];
    files: AttachmentBuilder[];
    componentsV2: boolean;
}

// Dieselbe Nachricht bauen Testlauf und der echte Beitritt - der Modus entscheidet, was drin ist.
export default async function BuildWelcome(
    client: BotClient,
    config: IWelcomeConfig,
    context: IPlaceholderContext
): Promise<IWelcomeMessage> {
    const service = client.welcomeService;
    const files = config.mode === "container" ? [] : [await service.Render(config, context)];

    if (config.mode === "image") return { components: [], files, componentsV2: false };

    const builder = new ComponentV2Builder({ accentColor: config.accent as ColorResolvable })
        .title(service.Fill(config.title, context))
        .separator()
        .text(service.Fill(config.message, context));

    if (config.mode === "image_container") builder.gallery("attachment://welcome.png");

    return { components: [builder.build()], files, componentsV2: true };
}
