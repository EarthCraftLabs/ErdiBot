import { Events, Interaction, MessageComponentInteraction, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { RenderHub, SetupModule } from "../../builder/SetupPanel";
import { PANEL_PREFIX } from "../../constants/Setup";

export default class SetupHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient die Setup-Übersicht und öffnet die einzelnen Bereiche",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isMessageComponent()) return;
        if (!interaction.customId.startsWith(PANEL_PREFIX)) return;
        if (!interaction.guildId) return;

        try {
            const action = interaction.customId.slice(PANEL_PREFIX.length + 1);

            if (action === "module" && interaction.isStringSelectMenu()) {
                const module = SetupModule(interaction.values[0]);

                if (module) {
                    const view = await module.Open(this.client, interaction.guildId, interaction.message.id);

                    await interaction.update({ ...view, flags: MessageFlags.IsComponentsV2, attachments: [] });

                    return;
                }
            }

            await this.Hub(interaction);
        } catch (error) {
            if (!this.client.database.IsReady) {
                await this.Fail(interaction, "Der Bot hat gerade keine Verbindung zur Datenbank.");

                return;
            }

            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Setup Error: ${interaction.customId}`);
        }
    }

    private async Hub(interaction: MessageComponentInteraction): Promise<void> {
        const view = await RenderHub(this.client, interaction.guildId!);

        await interaction.update({ ...view, flags: MessageFlags.IsComponentsV2, attachments: [], files: [] });
    }

    private async Fail(interaction: MessageComponentInteraction, text: string): Promise<void> {
        const message = new ComponentV2Builder({ accentColor: "Red" })
            .title("🗄️ | Datenbank nicht erreichbar")
            .separator()
            .text(text)
            .toMessage();

        const send =
            interaction.deferred || interaction.replied
                ? interaction.editReply(message)
                : interaction.reply({ ...message, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        await send.catch(() => {});
    }
}
