import { Guild, GuildMember, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import Repository from "../database/Repository";
import IReactionRolePanel, { IPanelMedia, IReactionRoleEntry } from "../interfaces/services/reactionroles/IReactionRolePanel";
import { IGalleryEntry } from "../interfaces/services/gallery/IGalleryService";
import IReactionRoleRecord from "../interfaces/services/reactionroles/IReactionRoleRecord";
import IReactionRolesService, { IRoleChange } from "../interfaces/services/reactionroles/IReactionRolesService";
import BuildReactionRoles from "../builder/ReactionRolesMessage";
import {
    DefaultPanel,
    MAX_ENTRIES,
    MAX_LABEL_LENGTH,
    MAX_PANELS,
    NewId,
    IsMediaUrl,
    NormalizeAccent,
    NormalizeEntries,
    NormalizeMode,
    NormalizeMedia,
    NormalizeStyle,
} from "../constants/ReactionRoles";

const MODEL = "ReactionRolePanel";

export default class ReactionRolesService implements IReactionRolesService {
    client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    async List(guildId: string): Promise<IReactionRolePanel[]> {
        const rows = await this.Records().Find({ guildId }, { orderBy: { id: "ASC" }, limit: MAX_PANELS });

        return rows.map((row) => this.ToPanel(row));
    }

    async Get(panelId: string): Promise<IReactionRolePanel | null> {
        const row = await this.Records().FindOne({ panelId });

        return row ? this.ToPanel(row) : null;
    }

    Create(guildId: string): IReactionRolePanel {
        return DefaultPanel(guildId);
    }

    async Save(panel: IReactionRolePanel): Promise<void> {
        const values = {
            guildId: panel.guildId,
            channelId: panel.channelId,
            messageId: panel.messageId,
            title: panel.title,
            description: panel.description,
            accent: panel.accent,
            thumbnail: panel.thumbnail,
            image: panel.image,
            style: panel.style,
            mode: panel.mode,
            entries: panel.entries,
            updatedAt: new Date(),
        };

        const records = this.Records();
        const updated = await records.Update({ panelId: panel.panelId }, values);

        if (updated === 0) await records.Insert({ panelId: panel.panelId, ...values });
    }

    async Delete(panelId: string): Promise<void> {
        await this.Records().Delete({ panelId });
    }

    AddEntry(panel: IReactionRolePanel, roleId: string, label: string): IReactionRoleEntry | null {
        if (panel.entries.length >= MAX_ENTRIES) return null;
        if (panel.entries.some((entry) => entry.roleId === roleId)) return null;

        const entry: IReactionRoleEntry = {
            id: NewId("e"),
            roleId,
            label: label.slice(0, MAX_LABEL_LENGTH) || "Rolle",
            description: null,
            emoji: null,
            tone: "secondary",
        };

        panel.entries.push(entry);

        return entry;
    }

    RemoveEntry(panel: IReactionRolePanel, entryId: string): boolean {
        const index = panel.entries.findIndex((entry) => entry.id === entryId);
        if (index === -1) return false;

        panel.entries.splice(index, 1);

        return true;
    }

    MoveEntry(panel: IReactionRolePanel, entryId: string, direction: -1 | 1): boolean {
        const index = panel.entries.findIndex((entry) => entry.id === entryId);
        const target = index + direction;

        if (index === -1 || target < 0 || target >= panel.entries.length) return false;

        const [entry] = panel.entries.splice(index, 1);
        panel.entries.splice(target, 0, entry);

        return true;
    }

    /**
     * Löst die beiden Bildfelder auf: eine eigene Adresse geht direkt durch, eine Galerie-ID
     * über `Attach()` — das liefert im Dev-Modus einen Anhang, weil Discord `localhost` nicht lädt.
     */
    async Media(panel: IReactionRolePanel): Promise<IPanelMedia> {
        const ids = [...new Set([panel.thumbnail, panel.image].filter((value): value is string => value !== null && !IsMediaUrl(value)))];

        const found = await Promise.all(ids.map((id) => this.client.galleryService.GetImage(id)));
        const entries = found.filter((entry): entry is IGalleryEntry => entry !== null);
        const attached = this.client.galleryService.Attach(entries);
        const media = new Map(entries.map((entry, index) => [entry.id, attached.media[index]]));

        const resolve = (value: string | null): string | null => {
            if (value === null) return null;

            return IsMediaUrl(value) ? value : (media.get(value) ?? null);
        };

        return { thumbnail: resolve(panel.thumbnail), image: resolve(panel.image), files: attached.files };
    }

    /** Postet die Nachricht oder aktualisiert die vorhandene. Fehler kommen als Klartext zurück. */
    async Publish(panel: IReactionRolePanel): Promise<void> {
        if (panel.entries.length === 0) throw new Error("Das Panel hat noch keine Rollen.");
        if (!panel.channelId) throw new Error("Für das Panel ist noch kein Kanal gewählt.");

        const channel = await this.client.channels.fetch(panel.channelId).catch(() => null);

        if (!channel?.isTextBased() || channel.isDMBased()) {
            throw new Error("Der gewählte Kanal ist nicht erreichbar.");
        }

        const media = await this.Media(panel);
        const message = { ...BuildReactionRoles(panel, channel.guild, media), files: media.files };

        if (panel.messageId) {
            const existing = await channel.messages.fetch(panel.messageId).catch(() => null);

            if (existing?.editable) {
                // Ohne das leere attachments-Feld blieben alte Anhänge zusätzlich hängen.
                await existing.edit({ ...message, attachments: [] });
                await this.Save(panel);

                return;
            }
        }

        const sent = await channel.send(message);

        panel.messageId = sent.id;

        await this.Save(panel);
    }

    async Unpublish(panel: IReactionRolePanel): Promise<boolean> {
        if (!panel.channelId || !panel.messageId) return false;

        const channel = await this.client.channels.fetch(panel.channelId).catch(() => null);

        if (channel?.isTextBased() && !channel.isDMBased()) {
            const message = await channel.messages.fetch(panel.messageId).catch(() => null);

            await message?.delete().catch(() => {});
        }

        panel.messageId = null;

        await this.Save(panel);

        return true;
    }

    async Apply(member: GuildMember, change: IRoleChange, reason: string): Promise<void> {
        if (change.remove.length > 0) await member.roles.remove(change.remove, reason);
        if (change.add.length > 0) await member.roles.add(change.add, reason);
    }

    /** Der Grund, warum eine Rolle nicht vergeben werden kann — oder null, wenn alles passt. */
    Issue(guild: Guild, roleId: string): string | null {
        const role = guild.roles.cache.get(roleId);

        if (!role) return "gelöscht";
        if (role.id === guild.id) return "@everyone geht nicht";
        if (role.managed) return "wird von einer Integration verwaltet";

        const me = guild.members.me;

        if (!me) return "ich bin im Server nicht geladen";
        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return "mir fehlt „Rollen verwalten“";
        if (me.roles.highest.comparePositionTo(role) <= 0) return "liegt über meiner höchsten Rolle";

        return null;
    }

    private Records(): Repository<IReactionRoleRecord> {
        return this.client.database.GetRepository<IReactionRoleRecord>(MODEL);
    }

    private ToPanel(row: IReactionRoleRecord): IReactionRolePanel {
        return {
            panelId: row.panelId,
            guildId: row.guildId,
            channelId: row.channelId,
            messageId: row.messageId,
            title: row.title,
            description: row.description,
            accent: NormalizeAccent(row.accent),
            thumbnail: NormalizeMedia(row.thumbnail),
            image: NormalizeMedia(row.image),
            style: NormalizeStyle(row.style),
            mode: NormalizeMode(row.mode),
            entries: NormalizeEntries(row.entries),
            updatedAt: row.updatedAt,
        };
    }
}
