import { AutocompleteInteraction } from "discord.js";
import BotClient from "../client/BotClient";
import { DEFAULT_SCOPE } from "../constants/Gallery";

const MAX_CHOICES = 25;
const MAX_LABEL = 100;

export interface IAutoCompleteOptions {
    includeDefault?: boolean;
    requireImages?: boolean;
}

export function ParseCategory(value: string | null): { guildId: string; category: string } | null {
    const separator = value?.indexOf(":") ?? -1;
    if (!value || separator < 1) return null;

    return { guildId: value.slice(0, separator), category: value.slice(separator + 1) };
}

export default async function GalleryAutoComplete(
    interaction: AutocompleteInteraction,
    options: IAutoCompleteOptions = {}
): Promise<void> {
    const { includeDefault = false, requireImages = true } = options;
    const { guildId } = interaction;

    if (!guildId) return interaction.respond([]);

    const gallery = (interaction.client as BotClient).galleryService;
    const focused = interaction.options.getFocused(true);
    const query = focused.value.trim().toLowerCase();

    if (focused.name === "bild") {
        const images = await gallery.SearchImages(guildId, query, { includeDefault });

        return interaction.respond(
            images.map((image) => ({ name: image.shortPath.slice(0, MAX_LABEL), value: image.id }))
        );
    }

    if (focused.name.endsWith("unterkategorie")) {
        const parentOption = focused.name.startsWith("ziel") ? "ziel-kategorie" : "kategorie";
        const parent = ParseCategory(interaction.options.getString(parentOption));

        if (!parent) return interaction.respond([]);

        const subcategories = await gallery.GetSubcategories(parent.guildId, parent.category, { requireImages });

        return interaction.respond(
            subcategories
                .filter((entry) => entry.guildId === parent.guildId && entry.name.includes(query))
                .slice(0, MAX_CHOICES)
                .map((entry) => ({ name: `${entry.name} (${entry.images})`.slice(0, MAX_LABEL), value: entry.name }))
        );
    }

    const categories = await gallery.GetCategories(guildId, { requireImages });

    return interaction.respond(
        categories
            .filter((entry) => (includeDefault || entry.guildId !== DEFAULT_SCOPE) && entry.name.includes(query))
            .slice(0, MAX_CHOICES)
            .map((entry) => ({
                name: `${entry.scope === "default" ? "🌐" : "⭐"} ${entry.name} (${entry.images})`.slice(0, MAX_LABEL),
                value: `${entry.guildId}:${entry.name}`,
            }))
    );
}
