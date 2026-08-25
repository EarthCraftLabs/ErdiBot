import { Client, Collection, GatewayIntentBits } from "discord.js";
import IBotClient from "../interfaces/client/IBotClient";
import Command from "../structures/Command";
import logger from "../utils/logger";
import ConstructionHandler from "../handler/ContructionHandler";
import { IConfig } from "../interfaces/config/IConfig";
import DatabaseConnection from "../database/DatabaseConnection";
import Guardian from "../Guardian";
import RunnableService from "../services/RunnableService";
import GalleryService from "../services/GalleryService";
import ConfigService from "../services/ConfigService";
import DiscordService from "../services/DiscordService";
import DevLogsService from "../services/DevLogsService";
import WelcomeService from "../services/WelcomeService";
import ReactionRolesService from "../services/ReactionRolesService";
import Server from "../Server";

export default class BotClient extends Client implements IBotClient {

    config: IConfig;
    constructionHandlers: ConstructionHandler;
    commands: Collection<string, Command>;
    cooldowns: Collection<string, Collection<string, number>>;
    developerMode: boolean;
    guardian: Guardian;
    database: DatabaseConnection;
    runnableService: RunnableService;
    galleryService: GalleryService;
    configService: ConfigService;
    discordService: DiscordService;
    devLogsService: DevLogsService;
    welcomeService: WelcomeService;
    reactionRolesService: ReactionRolesService;
    server: Server;

    constructor() {
        super({ intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildEmojisAndStickers,
                GatewayIntentBits.GuildIntegrations,
                GatewayIntentBits.GuildScheduledEvents,
                GatewayIntentBits.GuildWebhooks,
                GatewayIntentBits.GuildInvites,
                GatewayIntentBits.GuildModeration,
                GatewayIntentBits.GuildMessageTyping,
                GatewayIntentBits.DirectMessages,
            ], 
        });

        this.config = require("../../config.json");
        this.constructionHandlers = new ConstructionHandler(this);
        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.developerMode = process.argv.includes("--dev");
        this.guardian = new Guardian(this);
        this.database = new DatabaseConnection(this);
        this.runnableService = new RunnableService(this);
        this.galleryService = new GalleryService(this);
        this.configService = new ConfigService(this);
        this.discordService = new DiscordService(this);
        this.devLogsService = new DevLogsService(this);
        this.welcomeService = new WelcomeService(this);
        this.reactionRolesService = new ReactionRolesService(this);
        this.server = new Server(this);
    }

    Init(): void {
        this.guardian.Initialize();

        logger.asciiBanner();
        logger.info(`🤖 Bot Mode: ${this.developerMode ? "Development" : "Production"}`);
        
        logger.beforeExit(async (signal) => {
            logger.info(`🛑 Shutting down (${signal})...`);
            this.runnableService.Stop();
            this.configService.Unwatch();
            await this.server.Stop();
            await this.database.Disconnect();
            await this.destroy();
            logger.info("👋 Discord connection closed");
        });

        this.database
            .Connect()
            .then(async () => {
                await this.runnableService.Initialize();
                await this.galleryService.Initialize();
                await this.welcomeService.Initialize();
            })
            .catch((err) => logger.error("🗄️  MariaDB connection failed", err));

        this.configService
            .Initialize()
            .then(() => {
                if (this.developerMode) this.configService.Watch();
            })
            .catch((err) => logger.error("⚙️  Konfigurationen konnten nicht geladen werden", err));

        this.server.Start().catch((err) => logger.error("🌐 Server konnte nicht starten", err));

        this.LoadContructionHandlers();
        this.login(this.developerMode ? this.config.DEV_CLIENT_TOKEN : this.config.CLIENT_TOKEN)
            .catch((err) => { console.error(err); });
    }

    async LoadContructionHandlers(): Promise<void> {
        await this.constructionHandlers.LoadEvents();
        await this.constructionHandlers.LoadCommands();
    }
}