import { GlobalFonts, SKRSContext2D, createCanvas } from "@napi-rs/canvas";
import path from "path";

// Die Abschlusskarte wird gezeichnet statt getippt: ein Bild trägt Raster, Farbe und
// Icons, die ein ComponentV2-Container so nicht hinbekommt.

const FONT_ROOT = path.join(process.cwd(), "src", "assets", "fonts");
const EMOJI = "Noto Color Emoji";
const MONO = "JetBrains Mono";

const WIDTH = 1400;
const PAD = 32;
const INNER = WIDTH - PAD * 2;

const HEADER_H = 186;
const ROW_H = 110;
const CARD_PAD = 22;
const GUTTER = 20;
const COLUMN_W = (INNER - GUTTER) / 2;
const STRIP_H = 78;
const LINE_H = 30;
const MAX_REASON_LINES = 3;

const COLORS = {
    page: "#080B11",
    card: "#0E141C",
    cardEdge: "#1A2330",
    divider: "#161E28",
    label: "#8B95A6",
    value: "#FFFFFF",
    muted: "#8B95A6",
    mention: "#58A6FF",
    footer: "#69748A",
};

export type ValueStyle = "plain" | "muted" | "mention" | "badge";

export interface ICardRow {
    emoji: string;
    tint: string;
    label: string;
    value: string;
    style?: ValueStyle;
    // Ein Badge darf eine andere Farbe tragen als seine Icon-Fläche - die Kategorie ist
    // lila, ihr Ordner-Icon blau.
    color?: string;
    // Die Discord-ID hinter dem Namen: Anzeigenamen ändern sich, die ID nicht.
    id?: string;
}

export interface ITranscriptCard {
    title: string;
    highlight: string;
    accent: string;
    statusEmoji: string;
    badge: string | null;
    subline: string;
    left: ICardRow[];
    right: ICardRow[];
    transcriptId: string;
    reason: string;
}

let ready = false;

// Der WelcomeService registriert Inter bereits beim Start - hier nur die Absicherung
// für alles, was ohne ihn läuft (Tests, Skripte).
function EnsureFonts(): void {
    if (ready) return;

    if (!GlobalFonts.has("Inter")) {
        GlobalFonts.registerFromPath(path.join(FONT_ROOT, "inter-regular.ttf"), "Inter");
    }

    if (!GlobalFonts.has(MONO)) {
        GlobalFonts.registerFromPath(path.join(FONT_ROOT, "jetbrainsmono-regular.ttf"), MONO);
    }

    ready = true;
}

function Family(): string {
    return GlobalFonts.has("Inter") ? "Inter" : "sans-serif";
}

function Mono(size: number, bold = false): string {
    return `${bold ? "bold " : ""}${size}px ${GlobalFonts.has(MONO) ? `"${MONO}"` : Family()}`;
}

// Emoji stehen hinter der Textschrift: Skia nimmt pro Zeichen die erste Schrift, die es
// kennt - Buchstaben also aus Inter, Symbole aus der Emoji-Schrift.
function Font(size: number, bold = false, italic = false): string {
    const style = `${italic ? "italic " : ""}${bold ? "bold " : ""}`;

    return `${style}${size}px ${Family()}, "${EMOJI}"`;
}

function RoundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Eine Fläche mit Rand und optionalem Akzentstreifen an der linken Kante.
function Panel(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    options: { fill: string; edge: string; radius?: number; accent?: string } = {
        fill: COLORS.card,
        edge: COLORS.cardEdge,
    }
): void {
    const radius = options.radius ?? 18;

    RoundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = options.fill;
    ctx.fill();
    ctx.strokeStyle = options.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (!options.accent) return;

    // Der Streifen wird auf die Fläche geklemmt, sonst steht er über die Rundung hinaus.
    ctx.save();
    RoundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.fillStyle = options.accent;
    ctx.fillRect(x, y, 6, h);
    ctx.restore();
}

// Die schrägen Streifen in der rechten Ecke - reine Deko, aber sie nehmen der Fläche
// die Leere, ohne mit dem Text zu konkurrieren.
function Stripes(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, color: string): void {
    ctx.save();
    RoundRect(ctx, x, y, w, h, 18);
    ctx.clip();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = color;

    for (let index = 0; index < 3; index++) {
        const start = x + w - 150 + index * 44;

        ctx.beginPath();
        ctx.moveTo(start, y - 10);
        ctx.lineTo(start + 26, y - 10);
        ctx.lineTo(start - 34, y + h + 10);
        ctx.lineTo(start - 60, y + h + 10);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function Tint(color: string, alpha: number): string {
    const value = color.replace("#", "");
    const int = parseInt(value, 16);

    return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

// Ein Wert in eigener Farbe auf getönter Fläche: Kategorie und Priorität sollen sich
// vom übrigen Text abheben, ohne dass die Zeile ihre Höhe ändert.
function Badge(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    text: string,
    color: string,
    size = 22,
    max = Infinity
): number {
    ctx.font = Font(size, true);

    const label = Clip(ctx, text, max - 28);
    const width = ctx.measureText(label).width + 28;
    const height = size + 18;

    RoundRect(ctx, x, y - height / 2, width, height, 9);
    ctx.fillStyle = Tint(color, 0.16);
    ctx.fill();
    ctx.strokeStyle = Tint(color, 0.45);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 14, y + 1);

    return width;
}

function IconBox(ctx: SKRSContext2D, x: number, y: number, size: number, emoji: string, tint: string): void {
    RoundRect(ctx, x, y, size, size, 14);
    ctx.fillStyle = Tint(tint, 0.12);
    ctx.fill();
    ctx.strokeStyle = Tint(tint, 0.3);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = Font(Math.round(size * 0.58));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = tint;
    ctx.fillText(emoji, x + size / 2, y + size / 2 + 1);
}

// Beide Spalten sind gleich hoch, auch wenn eine weniger Zeilen trägt - sonst stünde
// eine kürzere Fläche neben einer längeren.
function CardHeight(card: ITranscriptCard): number {
    return ROW_H * Math.max(card.left.length, card.right.length) + CARD_PAD * 2;
}

function Rows(ctx: SKRSContext2D, x: number, y: number, height: number, rows: ICardRow[]): void {
    Panel(ctx, x, y, COLUMN_W, height);

    rows.forEach((row, index) => {
        const top = y + CARD_PAD + index * ROW_H;
        const middle = top + ROW_H / 2;

        IconBox(ctx, x + 24, middle - 28, 56, row.emoji, row.tint);

        const textX = x + 24 + 56 + 24;

        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.font = Font(19);
        ctx.fillStyle = COLORS.label;
        ctx.fillText(row.label, textX, middle - 8);

        const style = row.style ?? "plain";
        const room = COLUMN_W - (textX - x) - 24;

        if (style === "badge") {
            Badge(ctx, textX, middle + 22, row.value, row.color ?? row.tint, 22, room);
        } else {
            const baseline = middle + 31;

            ctx.font = Mono(19);
            const idText = row.id ? ` ${row.id}` : "";
            const idWidth = row.id ? ctx.measureText(idText).width : 0;

            ctx.font = Font(25, style !== "muted", style === "muted");
            ctx.fillStyle =
                style === "muted" ? COLORS.muted : style === "mention" ? COLORS.mention : COLORS.value;

            const name = Clip(ctx, row.value, room - idWidth);
            const nameWidth = ctx.measureText(name).width;

            ctx.fillText(name, textX, baseline);

            if (row.id) {
                ctx.font = Mono(19);
                ctx.fillStyle = COLORS.footer;
                ctx.fillText(idText, textX + nameWidth, baseline);
            }
        }

        // Zwischen den Zeilen eine Linie, aber keine unter der letzten - die Kante der
        // Fläche macht dort schon den Abschluss.
        if (index < rows.length - 1) {
            ctx.fillStyle = COLORS.divider;
            ctx.fillRect(textX, top + ROW_H - 1, COLUMN_W - (textX - x) - 24, 1);
        }
    });
}

function Header(ctx: SKRSContext2D, card: ITranscriptCard): void {
    const y = PAD;

    Panel(ctx, PAD, y, INNER, HEADER_H, {
        fill: COLORS.card,
        edge: COLORS.cardEdge,
        accent: card.accent,
    });

    Stripes(ctx, PAD, y, INNER, HEADER_H, card.accent);

    // Das Schloss sitzt in einem leuchtenden Ring - der einzige Blickfang, den die Karte
    // sich leistet.
    const cx = PAD + 118;
    const cy = y + HEADER_H / 2;

    ctx.save();
    ctx.shadowColor = Tint(card.accent, 0.55);
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, Math.PI * 2);
    ctx.fillStyle = Tint(card.accent, 0.1);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = Tint(card.accent, 0.85);
    ctx.stroke();
    ctx.restore();

    ctx.font = Font(52);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(card.statusEmoji, cx, cy + 2);

    const textX = PAD + 205;

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = Font(46, true);
    ctx.fillStyle = COLORS.value;
    ctx.fillText(card.title, textX, y + 86);

    const titleWidth = ctx.measureText(`${card.title} `).width;
    ctx.fillStyle = card.accent;
    ctx.fillText(card.highlight, textX + titleWidth, y + 86);

    // Punkt, Nummer, Trenner, Kategorie-Badge - alles auf einer Grundlinie.
    const lineY = y + 130;

    ctx.beginPath();
    ctx.arc(textX + 10, lineY, 9, 0, Math.PI * 2);
    ctx.fillStyle = card.accent;
    ctx.fill();

    ctx.font = Font(23);
    ctx.fillStyle = COLORS.label;
    ctx.textBaseline = "middle";

    let cursor = textX + 32;
    ctx.fillText(card.subline, cursor, lineY + 1);
    cursor += ctx.measureText(card.subline).width + 14;

    if (card.badge) Badge(ctx, cursor, lineY, card.badge, "#A78BFA", 21, WIDTH - PAD - cursor - 24);

    ctx.textBaseline = "alphabetic";
}

// Grund und Transcript-ID stehen nebeneinander: beide sind kurz, untereinander wären
// sie zwei fast leere Zeilen.
function Strip(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    height: number,
    emoji: string,
    tint: string,
    label: string,
    lines: string[],
    mono = false
): void {
    Panel(ctx, x, y, COLUMN_W, height);

    const top = y + 26;

    IconBox(ctx, x + 24, y + height / 2 - 22, 44, emoji, tint);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = Font(19);
    ctx.fillStyle = COLORS.label;
    ctx.fillText(label, x + 104, top);

    ctx.font = mono ? Mono(24, true) : Font(24, true);
    ctx.fillStyle = COLORS.value;

    lines.forEach((line, index) => ctx.fillText(line, x + 104, top + 30 + index * LINE_H));

    ctx.textBaseline = "alphabetic";
}

// Bricht den Grund auf so viele Zeilen um, wie der Streifen trägt - was danach noch
// kommt, endet mit Auslassungspunkten.
function Wrap(ctx: SKRSContext2D, text: string, max: number, maxLines: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];

    let line = "";

    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;

        if (ctx.measureText(candidate).width <= max) {
            line = candidate;
            continue;
        }

        if (!line) line = word;

        lines.push(line);
        line = line === word ? "" : word;

        if (lines.length === maxLines) return Trim(ctx, lines, words, max);
    }

    if (line) lines.push(line);

    return lines.length > 0 ? lines : [""];
}

// Die letzte Zeile bekommt die Auslassungspunkte, sobald noch Wörter übrig sind.
function Trim(ctx: SKRSContext2D, lines: string[], words: string[], max: number): string[] {
    const used = lines.join(" ").split(/\s+/).length;

    if (used >= words.length) return lines;

    const last = lines.length - 1;
    lines[last] = Clip(ctx, `${lines[last]} …`, max);

    return lines;
}

export async function RenderTranscriptCard(card: ITranscriptCard): Promise<Buffer> {
    EnsureFonts();

    // Erst messen, dann das Blatt aufspannen: wie hoch die Streifen werden, hängt am
    // Umbruch des Grundes.
    const probe = createCanvas(1, 1).getContext("2d") as SKRSContext2D;
    probe.font = Font(24, true);

    const reason = Wrap(probe, card.reason, COLUMN_W - 128, MAX_REASON_LINES);
    const stripH = Math.max(STRIP_H, 56 + reason.length * LINE_H);

    const cardsH = CardHeight(card);
    const cardsY = PAD + HEADER_H + 22;
    const stripY = cardsY + cardsH + 22;
    const height = stripY + stripH + PAD;

    const canvas = createCanvas(WIDTH, height);
    const ctx = canvas.getContext("2d") as SKRSContext2D;

    ctx.fillStyle = COLORS.page;
    ctx.fillRect(0, 0, WIDTH, height);

    Header(ctx, card);
    Rows(ctx, PAD, cardsY, cardsH, card.left);
    Rows(ctx, PAD + COLUMN_W + GUTTER, cardsY, cardsH, card.right);

    Strip(ctx, PAD, stripY, stripH, "📋", "#F5A623", "Grund", reason);
    Strip(ctx, PAD + COLUMN_W + GUTTER, stripY, stripH, "📄", "#7C8CA0", "Transcript-ID", [card.transcriptId], true);

    return canvas.encode("png");
}

// Ein zu langer Grund darf die Karte nicht sprengen - lieber gekürzt als über den Rand.
function Clip(ctx: SKRSContext2D, text: string, max: number): string {
    if (ctx.measureText(text).width <= max) return text;

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);

    return `${cut}…`;
}
