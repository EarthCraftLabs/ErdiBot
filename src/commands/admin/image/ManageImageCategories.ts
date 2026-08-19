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
import GalleryAutoComplete, { ParseCategory } from "../../../utils/galleryOptions";
import { SanitizeName } from "../../../constants/Gallery";

export default class ManageImageCategories extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "manageimagecategories",
            description: "Verwaltet die Bild-Kategorien dieses Servers",
            category: Category.Admin,
            cooldown: 5,
            developerOnly: false,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addSubcommand((sub) =>
                sub
                    .setName("erstellen")
                    .setDescription("Legt eine Kategorie oder Unterkategorie an")
                    .addStringOption((option) =>
                        option.setName("kategorie").setDescription("Name der Hauptkategorie").setRequired(true)
                    )
                    .addStringOption((option) =>
                        option.setName("unterkategorie").setDescription("Optional: Name der Unterkategorie")
                    )
            )
            .addSubcommand((sub) =>
                sub
                    .setName("loeschen")
                    .setDescription("Löscht eine Kategorie samt aller Bilder darin")
                    .addStringOption((option) =>
                        option
                            .setName("kategorie")
                            .setDescription("Die zu löschende Hauptkategorie")
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption((option) =>
                        option
                            .setName("unterkategorie")
                            .setDescription("Optional: nur diesen Unterordner löschen")
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand((sub) => sub.setName("liste").setDescription("Zeigt alle Kategorien mit Bildanzahl"));
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        await GalleryAutoComplete(interaction, { includeDefault: false, requireImages: false });
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const guildId = interaction.guildId;
        if (!guildId) return;

        await interaction.deferReply({ flags: 64 });

        switch (interaction.options.getSubcommand()) {
            case "erstellen":
                return this.Create(interaction, guildId);

            case "loeschen":
                return this.Delete(interaction, guildId);

            default:
                return this.List(interaction, guildId);
        }
    }

    private async Create(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const category = SanitizeName(interaction.options.getString("kategorie", true));
        const subcategory = interaction.options.getString("unterkategorie");
        const cleanSub = subcategory ? SanitizeName(subcategory) : null;

        if (!category || (subcategory && !cleanSub)) {
            await interaction.editReply(
                this.Notice(
                    "⚠️ | Ungültiger Name",
                    "Erlaubt sind Buchstaben, Zahlen, `-` und `_`. Alles andere wird entfernt.",
                    "Yellow"
                )
            );

            return;
        }

        const created = await this.client.galleryService.CreateCategory({ guildId, category, subcategory: cleanSub });
        const label = cleanSub ? `${category}/${cleanSub}` : category;

        await interaction.editReply(
            created
                ? this.Notice("✅ | Kategorie angelegt", `\`${label}\` steht ab sofort zur Verfügung.`, "Green")
                : this.Notice(
                      "⚠️ | Nicht angelegt",
                      cleanSub
                          ? `\`${label}\` existiert bereits — oder die Hauptkategorie \`${category}\` gibt es noch nicht.`
                          : `\`${label}\` existiert bereits.`,
                      "Yellow"
                  )
        );
    }

    private async Delete(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const target = ParseCategory(interaction.options.getString("kategorie", true));

        if (!target || target.guildId !== guildId) {
            await interaction.editReply(
                this.Notice("❌ | Nicht erlaubt", "Nur eigene Server-Kategorien können gelöscht werden.", "Red")
            );

            return;
        }

        const subcategory = interaction.options.getString("unterkategorie");
        const removed = await this.client.galleryService.DeleteCategory({ ...target, subcategory });
        const label = subcategory ? `${target.category}/${subcategory}` : target.category;

        await interaction.editReply(
            this.Notice("🗑️ | Kategorie gelöscht", `\`${label}\` wurde entfernt (${removed} Bild(er)).`, "Green")
        );
    }

    private async List(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const gallery = this.client.galleryService;
        const categories = await gallery.GetCategories(guildId, { requireImages: false });

        const builder = new ComponentV2Builder({ accentColor: "#B57BFF" })
            .title("📁 | Bild-Kategorien", "🌐 = mitgeliefert · ⭐ = eigener Server")
            .separator();

        if (categories.length === 0) {
            await interaction.editReply(
                builder.text("Noch keine Kategorien vorhanden. Lege eine mit `/manageimagecategories erstellen` an.")
                    .toMessage()
            );

            return;
        }

        for (const category of categories) {
            const subcategories = await gallery.GetSubcategories(category.guildId, category.name, {
                requireImages: false,
            });

            builder.text(
                `${category.scope === "default" ? "🌐" : "⭐"} **${category.name}** — ${category.images} Bild(er)`
            );

            if (subcategories.length > 0) {
                builder.list(
                    subcategories.map((sub) => `\`${sub.name}\` — ${sub.images} Bild(er)`),
                    { indent: 1 }
                );
            }
        }

        await interaction.editReply(builder.toMessage({ ephemeral: true }));
    }

    private Notice(title: string, text: string, color: ColorResolvable) {
        return new ComponentV2Builder({ accentColor: color }).title(title).separator().text(text).toMessage();
    }
}
