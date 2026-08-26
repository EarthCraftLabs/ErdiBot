import { ColorResolvable, MessageCreateOptions, MessageFlags } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import LogType from "../enums/LogType";
import { ILogEntry } from "../interfaces/services/logging/ILogEntry";
import { Category, Stamp } from "../constants/Logging";

// Jeder Log-Eintrag sieht gleich aus: Titel, Trenner, Text, Zeitstempel als Subtext.
// Die Farbe kommt aus der Kategorie, damit man im Kanal sofort sieht, worum es geht.
export default function BuildLogMessage(entry: ILogEntry): MessageCreateOptions {
    const category = Category(entry.type);

    const builder = new ComponentV2Builder({ accentColor: category.accent as ColorResolvable }).title(
        `${category.emoji} ${entry.title}`
    );

    builder.separator();

    // Der Thumbnail wird zum Element rechts neben dem Text - ohne ihn steht der Text allein.
    if (entry.thumbnailUrl) {
        builder.section(entry.description, { type: "thumbnail", url: entry.thumbnailUrl });
    } else {
        builder.text(entry.description);
    }

    builder.subtext(`🕐 ${Stamp()}`);

    if (entry.imageUrl) builder.gallery(entry.imageUrl);

    return {
        components: [builder.build()],
        flags: MessageFlags.IsComponentsV2,
        // Ein Log darf niemanden anpingen. Erwähnungen im Text bleiben als Text stehen,
        // damit man sieht, um wen es ging, ohne dass 40 Leute eine Meldung bekommen.
        allowedMentions: { parse: [] },
    };
}

export function LogTypeOf(entry: ILogEntry): LogType {
    return entry.type;
}
