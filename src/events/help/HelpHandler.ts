import { Events, GuildMember, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { PANEL_PREFIX, RenderHelp } from "../../builder/HelpPanel";

export default class HelpHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Wechselt die Kategorie im /help",
            once: false,
        });
    }

    // Ohne gespeicherten Zustand: die gewählte Kategorie steht im Wert, die Rechte kommen
    // frisch aus der Interaktion. Ein abgelaufenes Panel gibt es hier deshalb nicht.
    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isStringSelectMenu()) return;
        if (interaction.customId !== `${PANEL_PREFIX}:category`) return;

        const member = interaction.member as GuildMember | null;
        const builder = RenderHelp(this.client, member, interaction.user.id, interaction.values[0]);

        await interaction.update(builder.toMessage());
    }
}
