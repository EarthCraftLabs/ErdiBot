import { Anchor, WelcomeLayer } from "../interfaces/services/welcome/IWelcomeLayer";
import IWelcomeConfig, { IWelcomeCard, WelcomeMode } from "../interfaces/services/welcome/IWelcomeConfig";

export const CONFIG_KEY = "welcome";

export const MAX_LAYERS = 12;
export const MAX_TEXT_LENGTH = 200;
export const MAX_MESSAGE_LENGTH = 1000;

export const MIN_CARD_SIZE = 200;
export const MAX_CARD_SIZE = 2000;

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;

export const DEFAULT_FONT = "Montserrat";
export const HEX = /^#[0-9a-fA-F]{6}$/;

export const PREVIEW_MEMBER = {
    username: "mecrytv",
    displayName: "MecryTv",
    memberCount: 1337,
};

export function IsHex(value: string): boolean {
    return HEX.test(value);
}

export function ClampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;

    return Math.min(Math.max(Math.round(value), min), max);
}

export function Ordinal(count: number): string {
    return `${count}.`;
}

// Der Anker legt fest, an welchem Punkt der Karte eine Ebene klebt - der Offset schiebt sie von dort weg.
export function AnchorPoint(anchor: Anchor, card: IWelcomeCard): { x: number; y: number } {
    const [vertical, horizontal] = anchor.split("-");

    const x = horizontal === "left" ? 0 : horizontal === "right" ? card.width : card.width / 2;
    const y = vertical === "top" ? 0 : vertical === "bottom" ? card.height : card.height / 2;

    return { x, y };
}

export function LayerPosition(layer: WelcomeLayer, card: IWelcomeCard): { x: number; y: number } {
    const point = AnchorPoint(layer.anchor, card);

    return { x: point.x + layer.offsetX, y: point.y + layer.offsetY };
}

export function DefaultCard(): IWelcomeCard {
    return {
        width: 1024,
        height: 400,
        background: null,
        fit: "cover",
        color: "#2B2D31",
        gradient: "#5865F2",
        overlay: 25,
        radius: 32,
        layers: [
            {
                id: "avatar",
                type: "avatar",
                name: "Avatar",
                anchor: "middle-left",
                offsetX: 60,
                offsetY: -80,
                opacity: 100,
                hidden: false,
                size: 160,
                shape: "circle",
                border: 6,
                borderColor: "#FFFFFF",
            },
            {
                id: "title",
                type: "text",
                name: "Titel",
                anchor: "middle-left",
                offsetX: 260,
                offsetY: -20,
                opacity: 100,
                hidden: false,
                text: "Willkommen, {displayname}!",
                font: "Bebas Neue",
                size: 64,
                color: "#FFFFFF",
                bold: false,
                italic: false,
                align: "left",
                effect: "shadow",
                effectColor: "#000000",
                maxWidth: 700,
            },
            {
                id: "subtitle",
                type: "text",
                name: "Untertitel",
                anchor: "middle-left",
                offsetX: 260,
                offsetY: 40,
                opacity: 100,
                hidden: false,
                text: "Du bist unser {ordinal} Mitglied auf {server}",
                font: "Montserrat",
                size: 28,
                color: "#D9DBE1",
                bold: false,
                italic: false,
                align: "left",
                effect: "shadow",
                effectColor: "#000000",
                maxWidth: 700,
            },
        ],
    };
}

export function DefaultConfig(guildId: string): IWelcomeConfig {
    return {
        guildId,
        enabled: false,
        channelId: null,
        mode: "image_container",
        title: "👋 | Willkommen",
        message: "Schön, dass du da bist {user}! Schau dich ruhig um.",
        accent: "#5865F2",
        card: DefaultCard(),
        updatedAt: new Date(),
    };
}

function Text(value: unknown, fallback: string, max: number): string {
    return typeof value === "string" && value.trim() ? value.slice(0, max) : fallback;
}

function Color(value: unknown, fallback: string): string {
    return typeof value === "string" && IsHex(value) ? value.toUpperCase() : fallback;
}

function Num(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === "number" ? ClampNumber(value, min, max) : fallback;
}

function Choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
}

const ANCHORS = [
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-center",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
] as const;

const ALIGNS = ["left", "center", "right"] as const;
const EFFECTS = ["none", "shadow", "outline", "both"] as const;
const AVATAR_SHAPES = ["circle", "rounded", "square"] as const;
const SHAPES = ["rect", "circle", "line"] as const;
const FITS = ["cover", "contain", "stretch"] as const;
const MODES = ["image", "image_container", "container"] as const;

export const LAYER_TYPES = ["text", "avatar", "image", "shape"] as const;

// Die Karte liegt als JSON in der Datenbank. Alles, was von dort kommt, ist erstmal unbekannt.
function NormalizeLayer(raw: unknown, index: number): WelcomeLayer | null {
    if (typeof raw !== "object" || raw === null) return null;

    const source = raw as Record<string, unknown>;
    const type = Choice(source.type, LAYER_TYPES, "text");

    const base = {
        id: Text(source.id, `layer-${index}`, 32),
        name: Text(source.name, `Ebene ${index + 1}`, 40),
        anchor: Choice(source.anchor, ANCHORS, "middle-center"),
        offsetX: Num(source.offsetX, 0, -MAX_CARD_SIZE, MAX_CARD_SIZE),
        offsetY: Num(source.offsetY, 0, -MAX_CARD_SIZE, MAX_CARD_SIZE),
        opacity: Num(source.opacity, 100, 0, 100),
        hidden: source.hidden === true,
    };

    if (type === "text") {
        return {
            ...base,
            type,
            text: Text(source.text, "Text", MAX_TEXT_LENGTH),
            font: Text(source.font, DEFAULT_FONT, 40),
            size: Num(source.size, 48, MIN_FONT_SIZE, MAX_FONT_SIZE),
            color: Color(source.color, "#FFFFFF"),
            bold: source.bold === true,
            italic: source.italic === true,
            align: Choice(source.align, ALIGNS, "left"),
            effect: Choice(source.effect, EFFECTS, "none"),
            effectColor: Color(source.effectColor, "#000000"),
            maxWidth: Num(source.maxWidth, 700, 0, MAX_CARD_SIZE),
        };
    }

    if (type === "avatar") {
        return {
            ...base,
            type,
            size: Num(source.size, 160, 16, MAX_CARD_SIZE),
            shape: Choice(source.shape, AVATAR_SHAPES, "circle"),
            border: Num(source.border, 0, 0, 40),
            borderColor: Color(source.borderColor, "#FFFFFF"),
        };
    }

    if (type === "image") {
        return {
            ...base,
            type,
            image: Text(source.image, "", 64),
            width: Num(source.width, 200, 8, MAX_CARD_SIZE),
            height: Num(source.height, 200, 8, MAX_CARD_SIZE),
            radius: Num(source.radius, 0, 0, MAX_CARD_SIZE),
        };
    }

    return {
        ...base,
        type: "shape",
        shape: Choice(source.shape, SHAPES, "rect"),
        width: Num(source.width, 200, 1, MAX_CARD_SIZE),
        height: Num(source.height, 8, 1, MAX_CARD_SIZE),
        color: Color(source.color, "#5865F2"),
        radius: Num(source.radius, 0, 0, MAX_CARD_SIZE),
    };
}

export function NormalizeCard(raw: unknown): IWelcomeCard {
    const fallback = DefaultCard();

    if (typeof raw !== "object" || raw === null) return fallback;

    const source = raw as Record<string, unknown>;
    const layers = Array.isArray(source.layers) ? source.layers : [];

    const normalized = layers
        .slice(0, MAX_LAYERS)
        .map((layer, index) => NormalizeLayer(layer, index))
        .filter((layer): layer is WelcomeLayer => layer !== null);

    const gradient = typeof source.gradient === "string" && IsHex(source.gradient) ? source.gradient : null;

    return {
        width: Num(source.width, fallback.width, MIN_CARD_SIZE, MAX_CARD_SIZE),
        height: Num(source.height, fallback.height, MIN_CARD_SIZE, MAX_CARD_SIZE),
        background: typeof source.background === "string" && source.background ? source.background.slice(0, 64) : null,
        fit: Choice(source.fit, FITS, "cover"),
        color: Color(source.color, fallback.color),
        gradient,
        overlay: Num(source.overlay, 0, 0, 100),
        radius: Num(source.radius, 0, 0, 200),
        layers: normalized,
    };
}

export function NormalizeMode(value: unknown): WelcomeMode {
    return Choice(value, MODES, "image_container");
}
