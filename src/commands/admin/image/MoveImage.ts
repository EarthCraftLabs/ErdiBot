import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import BotClient from "../../../client/BotClient";
import Command from "../../../structures/Command";
import Category from "../../../enums/Category";
import ComponentV2Builder from "../../../builder/ComponentV2Builder";
import GalleryAutoComplete, { ParseCategory } from "../../../utils/galleryOptions";

export default class MoveImage extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "moveimage",
            description: "Verschiebt ein Bild in eine andere Kategorie",
            category: Category.Admin,
            cooldown: 5,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addStringOption((option) =>
                option
                    .setName("bild")
                    .setDescription("Das Bild, das verschoben werden soll")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption((option) =>
                option
                    .setName("ziel-kategorie")
                    .setDescription("Die Kategorie, in die das Bild soll")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption((option) =>
                option
                    .setName("ziel-unterkategorie")
                    .setDescription("Optional: Unterordner im Zielverzeichnis")
                    .setAutocomplete(true)
            );
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        await GalleryAutoComplete(interaction, { includeDefault: false, requireImages: false });
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guildId) return;

        const gallery = this.client.galleryService;
        const image = await gallery.GetImage(interaction.options.getString("bild", true));
        const destination = ParseCategory(interaction.options.getString("ziel-kategorie", true));

        if (!image || image.guildId !== interaction.guildId) {
            await interaction.reply(
                this.Notice("❌ | Nicht gefunden", "Wähle ein Bild aus der Vorschlagsliste aus.", true)
            );

            return;
        }

        if (!destination || destination.guildId !== interaction.guildId) {
            await interaction.reply(
                this.Notice(
                    "❌ | Ungültiges Ziel",
                    "Bilder lassen sich nur in eigene Server-Kategorien verschieben.",
                    true
                )
            );

            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const from = image.shortPath;
        const subcategory = interaction.options.getString("ziel-unterkategorie");
        const moved = await gallery.MoveImage(image.id, { category: destination.category, subcategory });

        if (!moved) {
            await interaction.editReply(
                this.Notice("❌ | Fehlgeschlagen", "Die Datei konnte nicht verschoben werden.")
            );

            return;
        }

        const updated = await gallery.GetImage(image.id);

        await interaction.editReply(
            new ComponentV2Builder({ accentColor: "Green" })
                .title("✅ | Bild verschoben", image.file)
                .separator()
                .list([`**Von:** \`${from}\``, `**Nach:** \`${updated?.shortPath ?? "?"}\``])
                .subtext("Die Web-URL des Bildes hat sich dadurch geändert.")
                .toMessage()
        );
    }

    private Notice(title: string, text: string, ephemeral = false) {
        return new ComponentV2Builder({ accentColor: "Red" })
            .title(title)
            .separator()
            .text(text)
            .toMessage({ ephemeral });
    }
}
