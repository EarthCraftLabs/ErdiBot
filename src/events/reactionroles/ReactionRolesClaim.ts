import {
    ColorResolvable,
    Events,
    Interaction,
    MessageFlags,
    RepliableInteraction,
    StringSelectMenuInteraction,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import IReactionRolePanel from "../../interfaces/services/reactionroles/IReactionRolePanel";
import { IRoleChange } from "../../interfaces/services/reactionroles/IReactionRolesService";
import BuildReactionRoles from "../../builder/ReactionRolesMessage";
import { CLAIM_PREFIX, PICK_PREFIX, ResolveClick, ResolveSelect } from "../../constants/ReactionRoles";

export default class ReactionRolesClaim extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Vergibt die Rollen der veröffentlichten ReactionRoles-Panels",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        const isClaim = interaction.customId.startsWith(`${CLAIM_PREFIX}:`);
        const isPick = interaction.customId.startsWith(`${PICK_PREFIX}:`);

        if (!isClaim && !isPick) return;

        if (!interaction.inCachedGuild()) {
            await interaction.reply({
                ...this.Notice("❌ | Nicht verfügbar", "Das geht nur in einem Server.", "Red"),
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
        }

        // Ein Select behält die Auswahl im Client: dieselbe Option ein zweites Mal anzuklicken löst
        // sonst nichts mehr aus. Deshalb wird die Nachricht danach neu gesetzt — das leert das Menü.
        const menu = interaction.isStringSelectMenu();

        if (menu) await interaction.deferUpdate();
        else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const [, , panelId, entryId] = interaction.customId.split(":");
            const panel = await this.client.reactionRolesService.Get(panelId);

            if (!panel || panel.guildId !== interaction.guildId) {
                return this.Reply(interaction, menu, "❌ | Panel unbekannt", "Dieses Panel gibt es nicht mehr.", "Red");
            }

            const member = interaction.member;
            const current = [...member.roles.cache.keys()];
            const panelRoles = panel.entries.map((entry) => entry.roleId);

            const change = interaction.isStringSelectMenu()
                ? ResolveSelect(
                      panel.mode,
                      current,
                      panelRoles,
                      interaction.values
                          .map((value) => panel.entries.find((entry) => entry.id === value)?.roleId)
                          .filter((role): role is string => typeof role === "string")
                  )
                : this.FromButton(panel, current, panelRoles, entryId);

            if (!change) {
                return this.Reply(interaction, menu, "❌ | Eintrag unbekannt", "Diesen Knopf gibt es nicht mehr.", "Red");
            }

            const blocked: string[] = [];
            const filtered: IRoleChange = { add: [], remove: [] };

            for (const [key, roles] of Object.entries(change) as Array<[keyof IRoleChange, string[]]>) {
                for (const roleId of roles) {
                    const issue = this.client.reactionRolesService.Issue(interaction.guild, roleId);

                    if (issue) blocked.push(`<@&${roleId}> — ${issue}`);
                    else filtered[key].push(roleId);
                }
            }

            await this.client.reactionRolesService.Apply(member, filtered, `ReactionRoles: ${panel.title}`);

            if (menu) await this.Reset(interaction, panel);

            await this.Result(interaction, menu, panel, filtered, blocked);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.Reply(
                interaction,
                menu,
                "❌ | Hat nicht geklappt",
                "Deine Rollen konnten nicht geändert werden. Melde dich beim Team, falls das so bleibt.",
                "Red"
            );

            // Die Antwort steht schon oben - der Guardian soll nicht noch eine zweite schicken.
            await this.client.guardian.ReportError(normalized, null, "ReactionRoles Claim");
        }
    }

    /** Schreibt die Nachricht unverändert neu — das leert das Menü im Client. */
    private async Reset(interaction: StringSelectMenuInteraction<"cached">, panel: IReactionRolePanel): Promise<void> {
        const media = await this.client.reactionRolesService.Media(panel);
        const message = BuildReactionRoles(panel, interaction.guild, media);

        const payload = media.files.length > 0 ? { ...message, files: media.files, attachments: [] } : message;

        await interaction.editReply(payload).catch(() => {});
    }

    private FromButton(
        panel: IReactionRolePanel,
        current: string[],
        panelRoles: string[],
        entryId: string
    ): IRoleChange | null {
        const entry = panel.entries.find((item) => item.id === entryId);
        if (!entry) return null;

        return ResolveClick(panel.mode, current, panelRoles, entry.roleId);
    }

    private async Result(
        interaction: RepliableInteraction,
        menu: boolean,
        panel: IReactionRolePanel,
        change: IRoleChange,
        blocked: string[]
    ): Promise<void> {
        const lines: string[] = [];

        if (change.add.length > 0) lines.push(`✅ **Erhalten:** ${change.add.map((role) => `<@&${role}>`).join(", ")}`);
        if (change.remove.length > 0) {
            lines.push(`➖ **Entfernt:** ${change.remove.map((role) => `<@&${role}>`).join(", ")}`);
        }

        if (lines.length === 0) {
            lines.push(
                panel.mode === "verify"
                    ? "Du hast diese Rolle bereits — hier lässt sie sich nicht wieder abgeben."
                    : "Es hat sich nichts geändert."
            );
        }

        if (blocked.length > 0) lines.push(`\n⚠️ **Nicht möglich:**\n${blocked.map((entry) => `- ${entry}`).join("\n")}`);

        const builder = new ComponentV2Builder({ accentColor: panel.accent as ColorResolvable })
            .title("🎭 | Rollen aktualisiert")
            .separator()
            .text(lines.join("\n"));

        await this.Send(interaction, menu, builder.toMessage(), builder.toMessage({ ephemeral: true }));
    }

    private async Reply(
        interaction: RepliableInteraction,
        menu: boolean,
        title: string,
        text: string,
        accent: ColorResolvable
    ): Promise<void> {
        const builder = new ComponentV2Builder({ accentColor: accent }).title(title).separator().text(text);

        await this.Send(interaction, menu, builder.toMessage(), builder.toMessage({ ephemeral: true }));
    }

    /**
     * Nach `deferUpdate` gehört die Antwort der öffentlichen Nachricht — die Rückmeldung an das
     * Mitglied muss dann als eigene, sichtbar nur für sie bestimmte Nachricht kommen.
     */
    private async Send(
        interaction: RepliableInteraction,
        menu: boolean,
        edit: ReturnType<ComponentV2Builder["toMessage"]>,
        follow: ReturnType<ComponentV2Builder["toMessage"]>
    ): Promise<void> {
        const send = menu ? interaction.followUp(follow) : interaction.editReply(edit);

        await send.catch(() => {});
    }

    private Notice(title: string, text: string, accent: ColorResolvable) {
        return new ComponentV2Builder({ accentColor: accent }).title(title).separator().text(text).toMessage();
    }
}
