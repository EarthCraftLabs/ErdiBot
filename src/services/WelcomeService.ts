import path from "path";
import { readFile } from "node:fs/promises";
import { GlobalFonts, Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { AttachmentBuilder, GuildMember } from "discord.js";
import BotClient from "../client/BotClient";
import IWelcomeConfig, { IWelcomeCard } from "../interfaces/services/welcome/IWelcomeConfig";
import IWelcomeRecord from "../interfaces/services/welcome/IWelcomeRecord";
import IWelcomeService, { IFontEntry, IPlaceholderContext } from "../interfaces/services/welcome/IWelcomeService";
import {
    IAvatarLayer,
    IImageLayer,
    IShapeLayer,
    ITextLayer,
    LayerType,
    WelcomeLayer,
} from "../interfaces/services/welcome/IWelcomeLayer";
import {
    DEFAULT_FONT,
    DefaultConfig,
    LayerPosition,
    NormalizeCard,
    NormalizeMode,
    Ordinal,
    PREVIEW_MEMBER,
} from "../constants/Welcome";
import { ResolveImagePath } from "../constants/Gallery";
import logger from "../utils/logger";

const MODEL = "WelcomeConfig";
const FONT_ROOT = path.join(process.cwd(), "src", "assets", "fonts");

const AVATAR_TIMEOUT = 8_000;
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const PREVIEW_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

export default class WelcomeService implements IWelcomeService {
    client: BotClient;

    private fonts: IFontEntry[] = [];
    private families = new Set<string>();

    constructor(client: BotClient) {
        this.client = client;
    }

    get Fonts(): IFontEntry[] {
        return this.fonts;
    }

    HasFont(family: string): boolean {
        return this.families.has(family);
    }

    async Initialize(): Promise<void> {
        const manifest = await readFile(path.join(FONT_ROOT, "manifest.json"), "utf8").catch(() => null);

        if (!manifest) {
            logger.warn("🔤 Keine Schriften gefunden — `npm run fonts` legt sie an");

            return;
        }

        this.fonts = JSON.parse(manifest) as IFontEntry[];

        for (const font of this.fonts) {
            GlobalFonts.registerFromPath(path.join(FONT_ROOT, font.regular), font.family);
            this.families.add(font.family);
        }

        logger.info(`🔤 ${this.families.size} Schriftart(en) registriert`);
    }

    async Get(guildId: string): Promise<IWelcomeConfig> {
        const row = await this.Records().FindOne({ guildId });
        if (!row) return DefaultConfig(guildId);

        return {
            guildId,
            enabled: row.enabled,
            channelId: row.channelId,
            mode: NormalizeMode(row.mode),
            title: row.title,
            message: row.message,
            accent: row.accent,
            card: NormalizeCard(row.card),
            updatedAt: row.updatedAt,
        };
    }

    async Save(config: IWelcomeConfig): Promise<void> {
        const values = {
            enabled: config.enabled,
            channelId: config.channelId,
            mode: config.mode,
            title: config.title,
            message: config.message,
            accent: config.accent,
            card: NormalizeCard(config.card),
            updatedAt: new Date(),
        };

        const records = this.Records();
        const updated = await records.Update({ guildId: config.guildId }, values);

        if (updated === 0) await records.Insert({ guildId: config.guildId, ...values });
    }

    async Reset(guildId: string): Promise<void> {
        await this.Records().Delete({ guildId });
    }

    AddLayer(card: IWelcomeCard, type: LayerType): WelcomeLayer {
        const id = `${type}-${Date.now().toString(36)}`;
        const index = card.layers.length + 1;

        const base = { id, anchor: "middle-center" as const, offsetX: 0, offsetY: 0, opacity: 100, hidden: false };

        const layer: WelcomeLayer =
            type === "text"
                ? {
                      ...base,
                      type: "text",
                      name: `Text ${index}`,
                      text: "Neuer Text",
                      font: DEFAULT_FONT,
                      size: 40,
                      color: "#FFFFFF",
                      bold: false,
                      italic: false,
                      align: "center",
                      effect: "shadow",
                      effectColor: "#000000",
                      maxWidth: Math.round(card.width * 0.8),
                  }
                : type === "avatar"
                  ? {
                        ...base,
                        type: "avatar",
                        name: `Avatar ${index}`,
                        size: 160,
                        shape: "circle",
                        border: 6,
                        borderColor: "#FFFFFF",
                    }
                  : type === "image"
                    ? { ...base, type: "image", name: `Bild ${index}`, image: "", width: 200, height: 200, radius: 16 }
                    : {
                          ...base,
                          type: "shape",
                          name: `Form ${index}`,
                          shape: "rect",
                          width: 300,
                          height: 8,
                          color: "#5865F2",
                          radius: 4,
                      };

        card.layers.push(layer);

        return layer;
    }

    RemoveLayer(card: IWelcomeCard, id: string): boolean {
        const index = card.layers.findIndex((layer) => layer.id === id);
        if (index === -1) return false;

        card.layers.splice(index, 1);

        return true;
    }

    MoveLayer(card: IWelcomeCard, id: string, direction: -1 | 1): boolean {
        const index = card.layers.findIndex((layer) => layer.id === id);
        const target = index + direction;

        if (index === -1 || target < 0 || target >= card.layers.length) return false;

        const [layer] = card.layers.splice(index, 1);
        card.layers.splice(target, 0, layer);

        return true;
    }

    Context(member: GuildMember): IPlaceholderContext {
        return {
            mention: `<@${member.id}>`,
            username: member.user.username,
            displayName: member.displayName,
            tag: member.user.tag,
            guild: member.guild.name,
            memberCount: member.guild.memberCount,
            avatar: member.displayAvatarURL({ extension: "png", size: 512 }),
            joinedAt: member.joinedAt ?? new Date(),
        };
    }

    Fill(template: string, context: IPlaceholderContext): string {
        const values: Record<string, string> = {
            "{user}": context.mention,
            "{username}": context.username,
            "{displayname}": context.displayName,
            "{tag}": context.tag,
            "{server}": context.guild,
            "{membercount}": String(context.memberCount),
            "{ordinal}": Ordinal(context.memberCount),
            "{date}": context.joinedAt.toLocaleDateString("de-DE"),
        };

        return template.replace(/\{[a-z]+\}/gi, (match) => values[match.toLowerCase()] ?? match);
    }

    async Preview(config: IWelcomeConfig, guildName: string): Promise<AttachmentBuilder> {
        return this.Render(config, {
            mention: `@${PREVIEW_MEMBER.displayName}`,
            username: PREVIEW_MEMBER.username,
            displayName: PREVIEW_MEMBER.displayName,
            tag: PREVIEW_MEMBER.username,
            guild: guildName,
            memberCount: PREVIEW_MEMBER.memberCount,
            avatar: PREVIEW_AVATAR,
            joinedAt: new Date(),
        });
    }

    async Render(config: IWelcomeConfig, context: IPlaceholderContext): Promise<AttachmentBuilder> {
        const card = NormalizeCard(config.card);
        const canvas = createCanvas(card.width, card.height);
        const ctx = canvas.getContext("2d") as SKRSContext2D;

        if (card.radius > 0) {
            this.RoundedPath(ctx, 0, 0, card.width, card.height, card.radius);
            ctx.clip();
        }

        await this.Background(ctx, card, config.guildId);

        for (const layer of card.layers) {
            if (layer.hidden) continue;

            ctx.save();
            ctx.globalAlpha = layer.opacity / 100;

            try {
                await this.Layer(ctx, card, layer, context, config.guildId);
            } catch (error) {
                logger.debug(`[WelcomeService] Ebene "${layer.name}" konnte nicht gezeichnet werden: ${error}`);
            }

            ctx.restore();
        }

        return new AttachmentBuilder(await canvas.encode("png"), { name: "welcome.png" });
    }

    private Records() {
        return this.client.database.GetRepository<IWelcomeRecord>(MODEL);
    }

    private async Background(ctx: SKRSContext2D, card: IWelcomeCard, guildId: string): Promise<void> {
        if (card.gradient) {
            const gradient = ctx.createLinearGradient(0, 0, card.width, card.height);

            gradient.addColorStop(0, card.color);
            gradient.addColorStop(1, card.gradient);
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = card.color;
        }

        ctx.fillRect(0, 0, card.width, card.height);

        const image = card.background ? await this.GalleryImage(card.background, guildId) : null;

        if (image) this.DrawFitted(ctx, image, card);

        if (card.overlay > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${card.overlay / 100})`;
            ctx.fillRect(0, 0, card.width, card.height);
        }
    }

    private DrawFitted(ctx: SKRSContext2D, image: Image, card: IWelcomeCard): void {
        if (card.fit === "stretch") {
            ctx.drawImage(image, 0, 0, card.width, card.height);

            return;
        }

        const ratio = image.width / image.height;
        const target = card.width / card.height;
        const cover = card.fit === "cover";

        const wider = cover ? ratio > target : ratio < target;

        const width = wider ? card.height * ratio : card.width;
        const height = wider ? card.height : card.width / ratio;

        ctx.drawImage(image, (card.width - width) / 2, (card.height - height) / 2, width, height);
    }

    private async Layer(
        ctx: SKRSContext2D,
        card: IWelcomeCard,
        layer: WelcomeLayer,
        context: IPlaceholderContext,
        guildId: string
    ): Promise<void> {
        const { x, y } = LayerPosition(layer, card);

        if (layer.type === "text") return this.DrawText(ctx, layer, x, y, context);
        if (layer.type === "avatar") return this.DrawAvatar(ctx, layer, x, y, context);
        if (layer.type === "shape") return this.DrawShape(ctx, layer, x, y);

        const image = await this.GalleryImage(layer.image, guildId);
        if (image) this.DrawImage(ctx, layer, image, x, y);
    }

    private DrawText(ctx: SKRSContext2D, layer: ITextLayer, x: number, y: number, context: IPlaceholderContext): void {
        const family = this.HasFont(layer.font) ? layer.font : DEFAULT_FONT;
        const style = `${layer.italic ? "italic " : ""}${layer.bold ? "bold " : ""}${layer.size}px "${family}"`;

        ctx.font = style;
        ctx.textAlign = layer.align;
        ctx.textBaseline = "top";
        ctx.fillStyle = layer.color;

        if (layer.effect === "shadow" || layer.effect === "both") {
            ctx.shadowColor = layer.effectColor;
            ctx.shadowBlur = Math.max(2, layer.size / 6);
            ctx.shadowOffsetY = Math.max(1, layer.size / 14);
        }

        const lines = this.Wrap(ctx, this.Fill(layer.text, context), layer.maxWidth);
        const height = layer.size * 1.25;

        lines.forEach((line, index) => {
            const top = y + index * height;

            if (layer.effect === "outline" || layer.effect === "both") {
                ctx.strokeStyle = layer.effectColor;
                ctx.lineWidth = Math.max(2, layer.size / 12);
                ctx.lineJoin = "round";
                ctx.strokeText(line, x, top);
            }

            ctx.fillText(line, x, top);
        });
    }

    private Wrap(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
        const paragraphs = text.split("\n");
        if (maxWidth <= 0) return paragraphs;

        const lines: string[] = [];

        for (const paragraph of paragraphs) {
            let current = "";

            for (const word of paragraph.split(" ")) {
                const candidate = current ? `${current} ${word}` : word;

                if (current && ctx.measureText(candidate).width > maxWidth) {
                    lines.push(current);
                    current = word;

                    continue;
                }

                current = candidate;
            }

            lines.push(current);
        }

        return lines;
    }

    private async DrawAvatar(
        ctx: SKRSContext2D,
        layer: IAvatarLayer,
        x: number,
        y: number,
        context: IPlaceholderContext
    ): Promise<void> {
        const image = await this.Remote(context.avatar);
        if (!image) return;

        const size = layer.size;

        ctx.save();

        if (layer.shape === "circle") {
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
        } else if (layer.shape === "rounded") {
            this.RoundedPath(ctx, x, y, size, size, size / 6);
        } else {
            ctx.beginPath();
            ctx.rect(x, y, size, size);
        }

        ctx.clip();
        ctx.drawImage(image, x, y, size, size);
        ctx.restore();

        if (layer.border <= 0) return;

        ctx.strokeStyle = layer.borderColor;
        ctx.lineWidth = layer.border;

        if (layer.shape === "circle") {
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, (size - layer.border) / 2, 0, Math.PI * 2);
            ctx.stroke();

            return;
        }

        if (layer.shape === "rounded") this.RoundedPath(ctx, x, y, size, size, size / 6);
        else {
            ctx.beginPath();
            ctx.rect(x, y, size, size);
        }

        ctx.stroke();
    }

    private DrawImage(ctx: SKRSContext2D, layer: IImageLayer, image: Image, x: number, y: number): void {
        ctx.save();

        if (layer.radius > 0) {
            this.RoundedPath(ctx, x, y, layer.width, layer.height, Math.min(layer.radius, layer.width / 2));
            ctx.clip();
        }

        ctx.drawImage(image, x, y, layer.width, layer.height);
        ctx.restore();
    }

    private DrawShape(ctx: SKRSContext2D, layer: IShapeLayer, x: number, y: number): void {
        ctx.fillStyle = layer.color;

        if (layer.shape === "circle") {
            ctx.beginPath();
            ctx.arc(x + layer.width / 2, y + layer.width / 2, layer.width / 2, 0, Math.PI * 2);
            ctx.fill();

            return;
        }

        const height = layer.shape === "line" ? Math.max(1, layer.height) : layer.height;

        if (layer.radius > 0) {
            this.RoundedPath(ctx, x, y, layer.width, height, Math.min(layer.radius, height / 2));
            ctx.fill();

            return;
        }

        ctx.fillRect(x, y, layer.width, height);
    }

    private RoundedPath(
        ctx: SKRSContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number
    ): void {
        const limit = Math.min(radius, width / 2, height / 2);

        ctx.beginPath();
        ctx.moveTo(x + limit, y);
        ctx.lineTo(x + width - limit, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + limit);
        ctx.lineTo(x + width, y + height - limit);
        ctx.quadraticCurveTo(x + width, y + height, x + width - limit, y + height);
        ctx.lineTo(x + limit, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - limit);
        ctx.lineTo(x, y + limit);
        ctx.quadraticCurveTo(x, y, x + limit, y);
        ctx.closePath();
    }

    private async GalleryImage(id: string, guildId: string): Promise<Image | null> {
        if (!id) return null;

        const entry = await this.client.galleryService.GetImage(id).catch(() => null);
        if (!entry) return null;

        // Fremde Server dürfen ihre Bilder nicht in dieser Guild landen lassen.
        if (entry.guildId !== guildId && entry.guildId !== "default") return null;

        const segments = [entry.guildId, entry.category, entry.subcategory, entry.file].filter(Boolean) as string[];
        const file = ResolveImagePath(segments.join("/"));
        if (!file) return null;

        return loadImage(file).catch(() => null);
    }

    private async Remote(url: string): Promise<Image | null> {
        const response = await fetch(url, { signal: AbortSignal.timeout(AVATAR_TIMEOUT) }).catch(() => null);
        if (!response?.ok) return null;

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_AVATAR_BYTES) return null;

        return loadImage(buffer).catch(() => null);
    }
}
