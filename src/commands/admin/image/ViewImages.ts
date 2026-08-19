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
import { NewPanelState, PanelStates, RenderPanel } from "../../../builder/GalleryPanel";
import { IGalleryEntry } from "../../../interfaces/services/gallery/IGalleryService";

const PAGE_SIZE = 10;
const BROWSE_TIMEOUT = 300_000;

export default class ViewImages extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "viewimages",
            description: "Zeigt alle Bilder einer Kategorie an",
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
                    .setDescription("Ohne Angabe erscheint ein Auswahlmenü")
                    .setAutocomplete(true)
            )
            .addStringOption((option) =>
                option
                    .setName("unterkategorie")
                    .setDescription("Optional: nur Bilder aus diesem Unterordner")
                    .setAutocomplete(true)
            );
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        await GalleryAutoComplete(interaction, { includeDefault: true });
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guildId) return;

        const choice = interaction.options.getString("kategorie");
        const subcategory = interaction.options.getString("unterkategorie");

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!choice) {
            const state = NewPanelState(interaction.guildId);
            const view = await RenderPanel(this.client, state);
            const message = await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2 });

            PanelStates.set(message.id, state);

            return;
        }

        const target = ParseCategory(choice);

        if (!target) {
            await interaction.editReply(
                this.Notice("⚠️ | Ungültige Kategorie", "Wähle eine Kategorie aus der Vorschlagsliste aus.")
            );

            return;
        }

        const images = await this.client.galleryService.GetImages({ ...target, subcategory });

        if (images.length === 0) {
            await interaction.editReply(
                this.Notice("❌ | Keine Bilder", "In diesem Ordner liegen aktuell keine Bilder.")
            );

            return;
        }

        const folder = subcategory ? `${target.category} ➔ ${subcategory}` : target.category;
        const pages = Math.ceil(images.length / PAGE_SIZE);
        let page = 0;

        while (true) {
            const view = this.Page(images, page, pages, folder);
            const message = await interaction.editReply(view);

            if (pages === 1) return;

            try {
                const button = await message.awaitMessageComponent({
                    filter: (component) => component.user.id === interaction.user.id,
                    time: BROWSE_TIMEOUT,
                });

                await button.deferUpdate();
                page = button.customId === "gallery:next" ? page + 1 : page - 1;
            } catch {
                await interaction.editReply(this.Page(images, page, pages, folder, true)).catch(() => {});
                return;
            }
        }
    }

    private Page(images: IGalleryEntry[], page: number, pages: number, folder: string, expired = false) {
        const slice = images.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
        const { media, files } = this.client.galleryService.Attach(slice);

        const builder = new ComponentV2Builder({ accentColor: "#B57BFF" })
            .title(`🖼️ | ${folder}`, `${images.length} Bild(er) · Seite ${page + 1} von ${pages}`)
            .separator()
            .gallery(...media)
            .list(slice.map((image) => `[\`${image.file}\`](${image.url})`));

        if (pages > 1) {
            builder.buttons(
                { customId: "gallery:prev", label: "Zurück", emoji: "◀️", disabled: expired || page === 0 },
                {
                    customId: "gallery:next",
                    label: "Weiter",
                    emoji: "▶️",
                    tone: "primary",
                    disabled: expired || page === pages - 1,
                }
            );
        }

        if (this.client.developerMode) {
            builder.subtext("Dev-Modus: Bilder werden als Anhang geschickt, weil Discord `localhost` nicht lädt.");
        }

        return { ...builder.toMessage(), files };
    }

    private Notice(title: string, text: string, ephemeral = false) {
        return new ComponentV2Builder({ accentColor: "Yellow" })
            .title(title)
            .separator()
            .text(text)
            .toMessage({ ephemeral });
    }
}
