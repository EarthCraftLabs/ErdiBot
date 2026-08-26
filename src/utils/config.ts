import path from "path";
import { readFileSync } from "node:fs";
import { IConfig, IDatabaseConfig } from "../interfaces/config/IConfig";

const CONFIG_FILE = "config.json";
const ENV_FILE = ".env";

// Erst beim Aufruf auflösen, nicht beim Import - sonst friert das Arbeitsverzeichnis
// beim Laden des Moduls ein und Aufrufer, die es später wechseln, lesen die falschen Dateien.
function Resolve(file: string): string {
    return path.join(process.cwd(), file);
}

// Echte Umgebungsvariablen gewinnen gegen die .env - loadEnvFile überschreibt nichts,
// was schon gesetzt ist. Damit funktioniert derselbe Code lokal wie in Docker oder systemd.
function LoadEnvFile(): void {
    try {
        process.loadEnvFile(Resolve(ENV_FILE));
    } catch {
        // Ohne .env ist der Start weiterhin möglich, solange die Variablen anders gesetzt sind.
    }
}

function ReadConfigFile(): Record<string, unknown> {
    let raw: string;

    try {
        raw = readFileSync(Resolve(CONFIG_FILE), "utf8");
    } catch {
        throw new Error("config.json fehlt - kopiere config.example.json nach config.json.");
    }

    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
        throw new Error(`config.json enthält kein gültiges JSON: ${error instanceof Error ? error.message : error}`);
    }
}

function Secret(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) throw new Error(`${name} fehlt in der .env - siehe .env.example.`);

    return value;
}

function Optional(name: string): string {
    return process.env[name]?.trim() ?? "";
}

function Section(file: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = file[key];

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`config.json: "${key}" fehlt oder ist kein Objekt.`);
    }

    return value as Record<string, unknown>;
}

function Text(file: Record<string, unknown>, key: string, fallback?: string): string {
    const value = file[key];

    if (typeof value === "string" && value.trim()) return value.trim();
    if (fallback !== undefined) return fallback;

    throw new Error(`config.json: "${key}" fehlt oder ist kein Text.`);
}

function Num(file: Record<string, unknown>, key: string, fallback: number): number {
    const value = file[key];

    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function Database(file: Record<string, unknown>, key: string, password: string): IDatabaseConfig {
    const section = Section(file, key);

    return {
        HOST: Text(section, "HOST"),
        PORT: Num(section, "PORT", 3306),
        USER: Text(section, "USER"),
        PASSWORD: password,
        NAME: Text(section, "NAME"),
    };
}

// config.json trägt die Infrastruktur (Hosts, Ports, Domain), die .env alle Geheimnisse.
// Zusammengesetzt wird beides genau einmal - hier.
export default function LoadConfig(): IConfig {
    LoadEnvFile();

    const file = ReadConfigFile();
    const developers = file.DEV_USER_IDs;

    return {
        CLIENT_TOKEN: Secret("CLIENT_TOKEN"),
        CLIENT_ID: Secret("CLIENT_ID"),
        DATABASE: Database(file, "DATABASE", Optional("DATABASE_PASSWORD")),

        DEV_CLIENT_TOKEN: Secret("DEV_CLIENT_TOKEN"),
        DEV_CLIENT_ID: Secret("DEV_CLIENT_ID"),
        DEV_GUILD_ID: Text(file, "DEV_GUILD_ID"),
        DEV_USER_IDs: Array.isArray(developers) ? developers.map(String) : [],
        DEV_DATABASE: Database(file, "DEV_DATABASE", Optional("DEV_DATABASE_PASSWORD")),

        SERVER_PORT: Num(file, "SERVER_PORT", 3000),
        SERVER_PUBLIC_URL: Text(file, "SERVER_PUBLIC_URL", "http://localhost:3000"),
        SERVER_JWT_SECRET: Secret("SERVER_JWT_SECRET"),
        SERVER_JWT_EXPIRES_IN: Text(file, "SERVER_JWT_EXPIRES_IN", "30d"),
        SERVER_RATE_LIMIT_MAX: Num(file, "SERVER_RATE_LIMIT_MAX", 100),
        SERVER_RATE_LIMIT_WINDOW: Text(file, "SERVER_RATE_LIMIT_WINDOW", "1 minute"),

        YOUTUBE_API_KEY: Optional("YOUTUBE_API_KEY"),
        TWITCH_CLIENT_ID: Optional("TWITCH_CLIENT_ID"),
        TWITCH_CLIENT_SECRET: Optional("TWITCH_CLIENT_SECRET"),
    };
}
