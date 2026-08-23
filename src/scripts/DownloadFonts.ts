import path from "path";
import { mkdir, writeFile } from "node:fs/promises";

const ROOT = path.join(process.cwd(), "src", "assets", "fonts");

const AGENT = { "User-Agent": "erdibot-font-setup" };
const DIRECTORIES = ["ofl", "apache", "ufl"];

interface IFamily {
    family: string;
    slug: string;
    category: string;
}

// Ein Stil pro Zeile, quer durch die Kategorien - das ist die Auswahl im Welcome-Editor.
const FAMILIES: IFamily[] = [
    { family: "Inter", slug: "inter", category: "Sans" },
    { family: "Roboto", slug: "roboto", category: "Sans" },
    { family: "Open Sans", slug: "opensans", category: "Sans" },
    { family: "Montserrat", slug: "montserrat", category: "Sans" },
    { family: "Poppins", slug: "poppins", category: "Sans" },
    { family: "Nunito", slug: "nunito", category: "Sans" },
    { family: "Raleway", slug: "raleway", category: "Sans" },
    { family: "Rubik", slug: "rubik", category: "Sans" },
    { family: "Quicksand", slug: "quicksand", category: "Sans" },
    { family: "Playfair Display", slug: "playfairdisplay", category: "Serif" },
    { family: "Merriweather", slug: "merriweather", category: "Serif" },
    { family: "Lora", slug: "lora", category: "Serif" },
    { family: "Cinzel", slug: "cinzel", category: "Serif" },
    { family: "Bebas Neue", slug: "bebasneue", category: "Display" },
    { family: "Anton", slug: "anton", category: "Display" },
    { family: "Oswald", slug: "oswald", category: "Display" },
    { family: "Righteous", slug: "righteous", category: "Display" },
    { family: "Bungee", slug: "bungee", category: "Display" },
    { family: "Titan One", slug: "titanone", category: "Display" },
    { family: "Pacifico", slug: "pacifico", category: "Handschrift" },
    { family: "Lobster", slug: "lobster", category: "Handschrift" },
    { family: "Dancing Script", slug: "dancingscript", category: "Handschrift" },
    { family: "Caveat", slug: "caveat", category: "Handschrift" },
    { family: "JetBrains Mono", slug: "jetbrainsmono", category: "Mono" },
    { family: "Orbitron", slug: "orbitron", category: "Gaming" },
];

interface IEntry {
    name: string;
    type: string;
    download_url: string | null;
}

export interface IFontManifestEntry {
    family: string;
    slug: string;
    category: string;
    regular: string;
    license: string;
    source: string;
}

async function Listing(directory: string, slug: string): Promise<IEntry[] | null> {
    const response = await fetch(`https://api.github.com/repos/google/fonts/contents/${directory}/${slug}`, {
        headers: AGENT,
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub antwortete mit ${response.status} für ${directory}/${slug}`);

    return (await response.json()) as IEntry[];
}

function Pick(entries: IEntry[], suffix: string): IEntry | null {
    return entries.find((entry) => entry.name.toLowerCase().endsWith(suffix.toLowerCase())) ?? null;
}

function Variable(entries: IEntry[]): IEntry | null {
    return entries.find((entry) => entry.name.endsWith(".ttf") && !entry.name.toLowerCase().includes("italic")) ?? null;
}

async function Save(url: string, file: string): Promise<number> {
    const response = await fetch(url, { headers: AGENT });
    if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}): ${url}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(file, buffer);

    return buffer.byteLength;
}

async function Download(entry: IFamily): Promise<IFontManifestEntry> {
    let directory: string | null = null;
    let files: IEntry[] | null = null;

    for (const candidate of DIRECTORIES) {
        files = await Listing(candidate, entry.slug);

        if (files) {
            directory = candidate;
            break;
        }
    }

    if (!files || !directory) throw new Error(`${entry.family} liegt in keinem bekannten Verzeichnis`);

    let pool = files;

    // Variable Familien legen die statischen Schnitte in einen Unterordner.
    if (!Pick(files, "-Regular.ttf") && files.some((file) => file.name === "static" && file.type === "dir")) {
        pool = (await Listing(directory, `${entry.slug}/static`)) ?? files;
    }

    const regular = Pick(pool, "-Regular.ttf") ?? Variable(pool);
    if (!regular?.download_url) throw new Error(`${entry.family}: keine Regular-Datei gefunden`);

    const license = files.find((file) => /^(OFL|LICENSE|UFL)\.txt$/i.test(file.name));

    const regularFile = `${entry.slug}-regular.ttf`;
    const licenseFile = `${entry.slug}.txt`;

    await Save(regular.download_url, path.join(ROOT, regularFile));
    if (license?.download_url) await Save(license.download_url, path.join(ROOT, "licenses", licenseFile));

    console.log(`  ${entry.family.padEnd(18)} ${regular.name}`);

    return {
        family: entry.family,
        slug: entry.slug,
        category: entry.category,
        regular: regularFile,
        license: license ? `licenses/${licenseFile}` : "",
        source: `https://github.com/google/fonts/tree/main/${directory}/${entry.slug}`,
    };
}

async function main(): Promise<void> {
    await mkdir(path.join(ROOT, "licenses"), { recursive: true });

    console.log(`Lade ${FAMILIES.length} Schriftfamilien nach src/assets/fonts …\n`);

    const manifest: IFontManifestEntry[] = [];

    for (const entry of FAMILIES) {
        manifest.push(await Download(entry));
    }

    await writeFile(path.join(ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`, "utf8");

    console.log(`\n${manifest.length} Familien geladen.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
