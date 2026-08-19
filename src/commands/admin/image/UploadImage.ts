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

export default class UploadImage extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "uploadimage",
            description: "Lädt ein Bild hoch und ordnet es einer Kategorie zu",
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
                    .setName("kategorie")
                    .setDescription("Zielkategorie für das Bild")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addAttachmentOption((option) =>
                option.setName("bild").setDescription("Das Bild als Anhang (PNG, JPG, GIF, WEBP)")
            )
            .addStringOption((option) =>
                option.setName("url").setDescription("Alternativ: https-Adresse des Bildes")
            )
            .addStringOption((option) =>
                option
                    .setName("unterkategorie")
                    .setDescription("Optional: Zielordner innerhalb der Kategorie")
                    .setAutocomplete(true)
            )
            .addStringOption((option) =>
                option.setName("name").setDescription("Optional: Dateiname ohne Endung")
            );
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        await GalleryAutoComplete(interaction, { requireImages: false });
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guildId) return;

        const target = ParseCategory(interaction.options.getString("kategorie", true));
        const attachment = interaction.options.getAttachment("bild");
        const url = interaction.options.getString("url");

        if (!target || target.guildId !== interaction.guildId) {
            await interaction.reply(
                this.Notice(
                    "❌ | Nicht erlaubt",
                    "Es kann nur in eigene Server-Kategorien hochgeladen werden — die Default-Bilder kommen aus dem Bot selbst.",
                    true
                )
            );

            return;
        }

        if (!attachment && !url) {
            await interaction.reply(
                this.Notice("⚠️ | Nichts zum Hochladen", "Gib entweder `bild` oder `url` an.", true)
            );

            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const source = attachment?.url ?? url!;
        const name = interaction.options.getString("name") ?? attachment?.name;

        try {
            const image = await this.client.galleryService.AddImage(
                { ...target, subcategory: interaction.options.getString("unterkategorie") },
                source,
                name ?? undefined
            );

            const { media, files } = this.client.galleryService.Attach([image]);

            const builder = new ComponentV2Builder({ accentColor: "Green" })
                .title("✅ | Bild gespeichert", image.shortPath)
                .separator()
                .gallery(...media)
                .text(`**Web-URL:** [${image.file}](${image.url})`);

            if (this.client.developerMode) {
                builder.subtext("Dev-Modus: Die Web-URL zeigt auf `localhost` und ist von aussen nicht erreichbar.");
            }

            await interaction.editReply({ ...builder.toMessage(), files });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await interaction.editReply(this.Notice("❌ | Upload fehlgeschlagen", message));
        }
    }

    private Notice(title: string, text: string, ephemeral = false) {
        return new ComponentV2Builder({ accentColor: "Red" })
            .title(title)
            .separator()
            .text(text)
            .toMessage({ ephemeral });
    }
}
