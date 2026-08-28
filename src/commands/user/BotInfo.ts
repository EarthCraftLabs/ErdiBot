import { ChatInputCommandInteraction, SlashCommandBuilder, version as djsVersion } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { FormatDuration } from "../../constants/DevLogs";

const MEGABYTE = 1024 * 1024;

export default class BotInfo extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "botinfo",
            description: "Zeigt Zustand und Eckdaten des Bots",
            category: Category.User,
            cooldown: 5,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder().setName(this.name).setDescription(this.description);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const { client } = this;

        const members = client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);
        const memory = Math.round(process.memoryUsage().heapUsed / MEGABYTE);
        const started = Math.floor((Date.now() - process.uptime() * 1000) / 1000);

        const builder = new ComponentV2Builder({ accentColor: "Blurple" })
            .title(`🤖 | ${client.user?.username ?? "Bot"}`, client.developerMode ? "Entwicklungsmodus" : "Produktiv")
            .separator()
            .heading("Zustand")
            .list([
                `**Online seit:** <t:${started}:R>`,
                `**Laufzeit:** ${FormatDuration(Math.round(process.uptime() * 1000))}`,
                `**Latenz:** ${Math.max(client.ws.ping, 0)} ms`,
                `**Speicher:** ${memory} MB`,
            ])
            .separator()
            .heading("Reichweite")
            .list([
                `**Server:** ${client.guilds.cache.size}`,
                `**Mitglieder:** ${members.toLocaleString("de-DE")}`,
                `**Befehle:** ${client.commands.size}`,
            ])
            .separator()
            .heading("Technik")
            .list([`**discord.js:** v${djsVersion}`, `**Node:** ${process.version}`])
            .subtext("Quelltext: github.com/EarthCraftLabs/ErdiBot");

        if (client.user) builder.gallery(client.user.displayAvatarURL({ size: 256 }));

        await interaction.reply(builder.toMessage({ ephemeral: true }));
    }
}
