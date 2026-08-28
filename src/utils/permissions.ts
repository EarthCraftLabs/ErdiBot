import { GuildMember, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import Category from "../enums/Category";

// Wer welche Kategorie im /help sieht. Moderator und Admin kommen aus Discords eigenen
// Rechten - dieselbe Quelle, aus der auch setDefaultMemberPermissions entscheidet, wer
// die Befehle überhaupt aufrufen darf. Eine zweite Liste in der Datenbank könnte davon
// abweichen und würde Rechte vortäuschen, die Discord danach verweigert.
export function IsDeveloper(client: BotClient, userId: string): boolean {
    return client.config.DEV_USER_IDs.includes(userId);
}

export function IsAdmin(member: GuildMember | null): boolean {
    return member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
}

export function IsModerator(member: GuildMember | null): boolean {
    return IsAdmin(member) || (member?.permissions.has(PermissionFlagsBits.ModerateMembers) ?? false);
}

export function VisibleCategories(client: BotClient, member: GuildMember | null, userId: string): Category[] {
    const categories: Category[] = [Category.User];

    if (IsModerator(member)) categories.push(Category.Moderation);
    if (IsAdmin(member)) categories.push(Category.Admin);

    if (IsDeveloper(client, userId)) {
        categories.push(Category.Developer);
        categories.push(Category.Testing);
    }

    return categories;
}

// Ein Griff für alle Moderationsbefehle: wer darf sich an wem vergreifen. Ohne den
// hier könnte ein Moderator jemanden über sich bannen, sobald Discord es formal zulässt.
export function Blocked(actor: GuildMember, target: GuildMember): string | null {
    if (target.id === actor.id) return "Das kannst du nicht mit dir selbst machen.";
    if (target.id === actor.client.user.id) return "Mich selbst? Lieber nicht.";
    if (target.id === target.guild.ownerId) return "Der Serverinhaber ist unantastbar.";

    // Der Inhaber steht über der Rollenhierarchie, für alle anderen zählt die höchste Rolle.
    if (actor.id !== actor.guild.ownerId && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
        return "Diese Person steht auf gleicher Höhe oder über dir.";
    }

    const me = target.guild.members.me;

    if (!me) return "Ich finde mich selbst nicht auf diesem Server.";
    if (me.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
        return "Diese Person steht über meiner höchsten Rolle - verschieb meine Rolle nach oben.";
    }

    return null;
}
