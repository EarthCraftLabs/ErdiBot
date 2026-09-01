import path from "path";
import { EmbedBuilder, Interaction } from "discord.js";
import BotClient from "./client/BotClient";
import IDiscordLogChannel from "./interfaces/database/models/IDiscordLogChannel";
import ITeamRoles from "./interfaces/database/models/ITeamRoles";
import IGuardian from "./interfaces/services/guardian/IGuardian";
import ComponentV2Builder from "./builder/ComponentV2Builder";
import logger from "./utils/logger";
import { IGuardianServiceIDs } from "./interfaces/services/guardian/IGuardianServiceIDs";

export default class Guardian implements IGuardian {
    client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    Initialize(): void {
        this._initializeGlobalHandlers();
        logger.guardian("info", "✅  Guardian is operational");
    }

    private _initializeGlobalHandlers(): void {
        process.on("unhandledRejection", (reason) => {
            logger.guardian("error", "Unhandled Rejection erfasst:", reason);

            const error =
                reason instanceof Error
                    ? reason
                    : new Error(String(reason ?? "Unbekannter Promise Rejection Grund"));

            this.ReportError(error, null, "Unhandled Rejection").catch(() => {});
        });

        process.on("uncaughtException", (err, origin) => {
            logger.guardian("error", `Uncaught Exception erfasst: ${err}`, `Origin: ${origin}`);

            this.ReportError(err, null, "Uncaught Exception")
                .catch(() => {})
                .finally(() => process.exit(1));
        });
    }

    private _clamp(value: string | undefined, max: number): string {
        const text = value?.trim();
        if (!text) return "N/A";
        return text.length > max ? `${text.substring(0, max)}…` : text;
    }

    private async _sendUserReply(interaction: Interaction, errorId: string): Promise<void> {
        if (!interaction.isRepliable()) return;

        try {
            const replyMSG = new ComponentV2Builder({ accentColor: "Red" })
                .title("🛠️ | Oops, da ist etwas schiefgelaufen")
                .separator()
                .text(`Ein unerwarteter Fehler ist aufgetreten.\n**Fehler ID:** \`${errorId}\``)
                .subtext("Bitte öffne ein Ticket und gib die Fehler ID an, damit dir schnell geholfen wird.")
                .toMessage({ ephemeral: true });

            if (interaction.replied || interaction.deferred) await interaction.followUp(replyMSG);
            else await interaction.reply(replyMSG);
        } catch (error) {
            logger.guardian("error", `Fehler beim Senden der Antwort an den Benutzer: ${error}`);
        }
    }

    private _parseStackForLocation(error: Error) {
        if (!error.stack) return null;

        const stackLines = error.stack.split("\n").slice(1);
        const relevantLine = stackLines.find((line) => !line.includes("Guardian."));

        if (!relevantLine) return null;

        const locationMatch = relevantLine.match(/\((.*?)\)/);

        if (!locationMatch || !locationMatch[1]) return null;

        const fullPath = locationMatch[1];
        const parts = fullPath.split(":");
        const line = parts[parts.length - 2] || "N/A";
        const filePath = parts.slice(0, parts.length - 2).join(":") || "N/A";
        const fileName = path.basename(filePath) || "N/A";

        return { fileName, filePath, line };
    }

    private async _sendLogReport(
        error: Error,
        errorId: string,
        interaction: Interaction | null,
        type: string
    ): Promise<void> {
        const { errorLogChannelId, developerPingRoleId } = await this.GetServiceIDs(interaction?.guildId);

        if (!errorLogChannelId) {
            return logger.guardian(
                "warn",
                "Die Error Log Channel ID konnte nicht gefunden werden. Überspringe das Senden des Fehlerberichts"
            );
        }

        // Über den LoggingService, nicht per fetch: ist der Fehler-Kanal ein archivierter
        // Thread, muss er erst geweckt werden - sonst verschwinden genau die Meldungen
        // still, die man am dringendsten sehen will.
        const logChannel = await this.client.loggingService.Writable(errorLogChannelId).catch((fetchError) => {
            logger.guardian("error", `Fehler beim Abrufen des Log Channels: ${fetchError}`);
            return null;
        });

        if (!logChannel) {
            return logger.guardian(
                "warn",
                `Der Error Log Channel mit der ID ${errorLogChannelId} ist nicht erreichbar oder der Bot darf dort nicht schreiben`
            );
        }

        if (!developerPingRoleId) {
            logger.guardian(
                "warn",
                "Die Developer Ping Role ID konnte nicht gefunden werden - Report geht ohne Ping raus"
            );
        }

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle(`🛡️ Guardian | ${type}`)
            .setTimestamp()
            .setFooter({ text: `Error-ID: ${errorId}` });

        if (interaction) {
            embed.addFields(
                { name: "Triggered by", value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
                { name: "Server", value: `\`${interaction.guild?.name ?? "DM"}\``, inline: true },
                {
                    name: "Command",
                    value: interaction.isChatInputCommand() ? `\`/${interaction.commandName}\`` : "`N/A`",
                    inline: true,
                }
            );
        } else {
            embed.addFields({ name: "Context", value: "`Global Process`", inline: true });
        }

        const location = this._parseStackForLocation(error);
        if (location) {
            embed.addFields(
                { name: "📍 Location", value: `\`\`\`ini\n[File]: ${location.fileName}\n[Row]: ${location.line}\`\`\`` },
                { name: "Path", value: `\`${this._clamp(location.filePath, 1000)}\`` }
            );
        }

        embed.addFields(
            { name: "Error Message", value: `\`\`\`${this._clamp(error.message, 1000)}\`\`\`` },
            { name: "Stack Trace", value: `\`\`\`js\n${this._clamp(error.stack ?? error.toString(), 1000)}\`\`\`` }
        );

        await logChannel.send({
            content: developerPingRoleId ? `<@&${developerPingRoleId}>` : undefined,
            embeds: [embed],
        });
    }

    async GetServiceIDs(guildId: string | null | undefined): Promise<IGuardianServiceIDs> {
        const serviceIDs: IGuardianServiceIDs = {};

        if (!guildId || !this.client.database) return serviceIDs;

        try {
            const errorLogChannel = await this.client.database
                .GetRepository<IDiscordLogChannel>("DiscordLogChannel")
                .FindOne({ guildId, logType: "errorLog" });

            if (errorLogChannel) serviceIDs.errorLogChannelId = errorLogChannel.channelId;

            const teamRoles = await this.client.database.GetRepository<ITeamRoles>("TeamRoles").Find({ guildId });

            const devRegex = /\b(dev(eloper|elopment|s)?|entwickler(in)?|entwicklung|coder|programmierer(in)?|engineer)\b/i;
            const developerRole = teamRoles.find((role) => devRegex.test(role.roleName));

            if (developerRole) serviceIDs.developerPingRoleId = developerRole.roleId;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.guardian("warn", `GetServiceIDs übersprungen (DB/Modelle noch nicht bereit): ${errorMessage}`);
        }

        return serviceIDs;
    }

    GenErrorID(): string {
        const timestamp = Math.floor(Date.now() / 1000);
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `EarthCraft-${timestamp}-${randomPart}`;
    }

    async ReportError(error: Error, interaction: Interaction | null, type = "Unknown Error"): Promise<void> {
        const errorCode = (error as Error & { code?: number | string }).code;
        const normalizedCode = typeof errorCode === "string" ? Number(errorCode) : errorCode;

        if (typeof normalizedCode === "number" && [10062, 10008, 40060].includes(normalizedCode)) {
            return logger.guardian(
                "warn",
                `Ignored expired/already-acknowledged interaction [${errorCode}] in ${type} (Nutzer war vermutlich zu langsam oder hat doppelt geklickt).`
            );
        }

        const errorId = this.GenErrorID();

        logger.guardian("error", `Fehler gefunden [ID: ${errorId}] | Type: ${type}:`, error);

        const location = this._parseStackForLocation(error);
        if (location) {
            logger.guardian(
                "error",
                `📍 Error location: ${location.fileName} (line: ${location.line}) | Path: ${location.filePath}`
            );
        }

        try {
            await this._sendLogReport(error, errorId, interaction, type);
        } catch (reportError) {
            logger.guardian("error", `Fehlerbericht konnte nicht gesendet werden: ${reportError}`);
        }

        if (interaction) await this._sendUserReply(interaction, errorId);
    }

    async HandleCommand(
        errorMSG: string,
        interaction: Interaction | null,
        type = "Command Logic Error"
    ): Promise<void> {
        await this.ReportError(new Error(errorMSG), interaction, type);
    }

    async HandleEvent(errorMSG: string, context: { eventName?: string }): Promise<void> {
        const type = context?.eventName ? `Event Logic Error: ${context.eventName}` : "Event Logic Error";
        await this.ReportError(new Error(errorMSG), null, type);
    }

    async HandleGeneric(errorMSG: string, type = "Generic Error", stackTrace: string | null = null): Promise<void> {
        const error = new Error(errorMSG);
        if (stackTrace) error.stack = stackTrace;
        await this.ReportError(error, null, type);
    }

    async HandleRLAPI(errorMSG: string, context: { endpoint?: string }): Promise<void> {
        const error = new Error(errorMSG);
        const type = context?.endpoint ? `RLAPI Error: ${context.endpoint}` : "RLAPI Error";
        await this.ReportError(error, null, type);
    }

    async HandleRunnable(errorMSG: string, context: { taskName?: string; stack?: string }): Promise<void> {
        const error = new Error(errorMSG);
        if (context?.stack) error.stack = context.stack;
        const type = context?.taskName ? `Runnable Error: ${context.taskName}` : "Runnable Error";
        await this.ReportError(error, null, type);
    }

    async HandleServer(errorMSG: string, context: { route?: string; stack?: string }): Promise<void> {
        const error = new Error(errorMSG);
        if (context?.stack) error.stack = context.stack;
        const type = context?.route ? `Server Error: ${context.route}` : "Server Error";
        await this.ReportError(error, null, type);
    }
}
