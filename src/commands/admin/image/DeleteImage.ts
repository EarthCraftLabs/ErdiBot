import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    ColorResolvable,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import BotClient from "../../../client/BotClient";
import Command from "../../../structures/Command";
import Category from "../../../enums/Category";
import ComponentV2Builder from "../../../builder/ComponentV2Builder";
import GalleryAutoComplete from "../../../utils/galleryOptions";

const CONFIRM_TIMEOUT = 30_000;

export default class DeleteImage extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "deleteimage",
            description: "Löscht ein selbst hochgeladenes Bild",
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
                    .setDescription("Das Bild, das gelöscht werden soll")
                    .setRequired(true)
                    .setAutocomplete(true)
            );
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        await GalleryAutoComplete(interaction, { includeDefault: false });
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guildId) return;

        const gallery = this.client.galleryService;
        const image = await gallery.GetImage(interaction.options.getString("bild", true));

        if (!image || image.guildId !== interaction.guildId) {
            await interaction.reply(
                this.Notice("❌ | Nicht gefunden", "Wähle ein Bild aus der Vorschlagsliste aus.", "Red", true)
            );

            return;
        }

        const { media, files } = gallery.Attach([image]);

        const question = new ComponentV2Builder({ accentColor: "Orange" })
            .title("🗑️ | Wirklich löschen?", image.shortPath)
            .separator()
            .gallery(...media)
            .text("Die Datei wird endgültig von der Platte entfernt. Das lässt sich nicht rückgängig machen.")
            .buttons(
                { customId: "delete:confirm", label: "Löschen", emoji: "🗑️", tone: "danger" },
                { customId: "delete:cancel", label: "Abbrechen", emoji: "✖️" }
            );

        const message = await interaction.reply({
            ...question.toMessage({ ephemeral: true }),
            files,
            withResponse: true,
        });

        try {
            const button = await message.resource!.message!.awaitMessageComponent({
                filter: (component) => component.user.id === interaction.user.id,
                time: CONFIRM_TIMEOUT,
            });

            await button.deferUpdate();

            if (button.customId === "delete:cancel") {
                await interaction.editReply(this.Notice("✖️ | Abgebrochen", "Das Bild bleibt erhalten.", "Grey"));
                return;
            }

            const deleted = await gallery.DeleteImage(image.id);

            await interaction.editReply(
                deleted
                    ? this.Notice("✅ | Gelöscht", `\`${image.shortPath}\` wurde entfernt.`, "Green")
                    : this.Notice("❌ | Fehlgeschlagen", "Das Bild konnte nicht gelöscht werden.", "Red")
            );
        } catch {
            await interaction
                .editReply(this.Notice("⏱️ | Zeitüberschreitung", "Vorgang abgebrochen.", "Grey"))
                .catch(() => {});
        }
    }

    private Notice(title: string, text: string, color: ColorResolvable, ephemeral = false) {
        return new ComponentV2Builder({ accentColor: color })
            .title(title)
            .separator()
            .text(text)
            .toMessage({ ephemeral });
    }
}
