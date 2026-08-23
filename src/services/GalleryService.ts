import path from "path";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import axios from "axios";
import { AttachmentBuilder } from "discord.js";
import BotClient from "../client/BotClient";
import IGalleryCategory from "../interfaces/services/gallery/IGalleryCategory";
import IGalleryImage from "../interfaces/services/gallery/IGalleryImage";
import IGalleryService, {
    GalleryDocument,
    IAttachedMedia,
    ICategoryEntry,
    IGalleryEntry,
    IGalleryFolder,
    IGalleryTarget,
    IListOptions,
    ISearchOptions,
} from "../interfaces/services/gallery/IGalleryService";
import {
    DEFAULT_SCOPE,
    GALLERY_ROOT,
    IMAGE_TYPES,
    IsImageFile,
    IsScope,
    ParseSource,
    PRIVATE_SCOPE,
    ResolveImagePath,
    SanitizeName,
} from "../constants/Gallery";
import logger from "../utils/logger";

const CATEGORY_MODEL = "GalleryCategory";
const IMAGE_MODEL = "GalleryImage";

const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 15_000;
const MAX_SELECT_OPTIONS = 25;
const EXTENSION_BY_MIME = new Map<string, string>();
for (const [extension, mime] of Object.entries(IMAGE_TYPES)) {
    if (!EXTENSION_BY_MIME.has(mime)) EXTENSION_BY_MIME.set(mime, extension);
}

export default class GalleryService implements IGalleryService {
    client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    async Initialize(): Promise<void> {
        await mkdir(path.join(GALLERY_ROOT, DEFAULT_SCOPE), { recursive: true });
        await mkdir(path.join(GALLERY_ROOT, PRIVATE_SCOPE), { recursive: true });
        await this.SyncDefaults();
    }

    async GetCategories(guildId: string, options: IListOptions = {}): Promise<ICategoryEntry[]> {
        return this.ListCategories(guildId, null, options);
    }

    async GetSubcategories(guildId: string, category: string, options: IListOptions = {}): Promise<ICategoryEntry[]> {
        return this.ListCategories(guildId, SanitizeName(category), options);
    }

    async GetImages(target: IGalleryTarget): Promise<IGalleryEntry[]> {
        const { guildId, category, subcategory } = this.Normalize(target);
        if (!guildId || !category) return [];

        const found = await this.Images().Find({ guildId, category, subcategory }, { orderBy: { file: "ASC" } });

        return found.map((document) => this.ToEntry(document));
    }

    async GetImage(id: string): Promise<IGalleryEntry | null> {
        const document = await this.FindImage(id);

        return document ? this.ToEntry(document) : null;
    }

    async SearchImages(guildId: string, query: string, options: ISearchOptions = {}): Promise<IGalleryEntry[]> {
        const { includeDefault = false, limit = MAX_SELECT_OPTIONS } = options;
        if (!IsScope(guildId)) return [];

        const scopes = includeDefault && guildId !== DEFAULT_SCOPE ? [DEFAULT_SCOPE, guildId] : [guildId];
        const found = await this.Images().Find(
            { guildId: { in: scopes } },
            { orderBy: { category: "ASC", file: "ASC" } }
        );

        const needle = query.trim().toLowerCase();

        return found
            .map((document) => this.ToEntry(document))
            .filter((image) => !needle || image.shortPath.includes(needle))
            .slice(0, limit);
    }

    Attach(images: IGalleryEntry[]): IAttachedMedia {
        if (!this.client.developerMode) {
            return { media: images.map((image) => image.url), files: [] };
        }

        const names = images.map((image, index) => `${index}-${image.file}`);

        return {
            media: names.map((name) => `attachment://${name}`),
            files: images.map((image, index) => new AttachmentBuilder(this.FileFor(image), { name: names[index] })),
        };
    }

    async Asset(assetPath: string): Promise<IAttachedMedia> {
        const file = ResolveImagePath(assetPath);
        const info = file ? await stat(file).catch(() => null) : null;

        if (!file || !info?.isFile()) {
            logger.warn(`🖼️  Asset "${assetPath}" wurde nicht gefunden`);

            return { media: [], files: [] };
        }

        const segments = path.relative(GALLERY_ROOT, file).split(path.sep);

        if (!this.client.developerMode) {
            const url = `${this.client.server.BaseURL}/images/${segments.map(encodeURIComponent).join("/")}`;

            return { media: [url], files: [] };
        }

        const name = segments.join("_").replace(/\s+/g, "_");

        return { media: [`attachment://${name}`], files: [new AttachmentBuilder(file, { name })] };
    }

    async CreateCategory(target: IGalleryTarget): Promise<boolean> {
        const { guildId, category, subcategory } = this.Normalize(target);

        if (!guildId || guildId === DEFAULT_SCOPE || !category) return false;

        const name = subcategory ?? category;
        const parent = subcategory ? category : null;
        const categories = this.Categories();

        if (parent && !(await categories.FindOne({ guildId, name: parent, parent: null }))) return false;
        if (await categories.FindOne({ guildId, name, parent })) return false;

        await mkdir(this.DirectoryFor(guildId, category, subcategory), { recursive: true });
        await categories.Insert({ guildId, name, parent, createdAt: new Date() });

        logger.info(`🖼️  Kategorie "${parent ? `${parent}/${name}` : name}" in ${guildId} angelegt`);

        return true;
    }

    async DeleteCategory(target: IGalleryTarget): Promise<number> {
        const { guildId, category, subcategory } = this.Normalize(target);
        if (!guildId || guildId === DEFAULT_SCOPE || !category) return 0;

        await rm(this.DirectoryFor(guildId, category, subcategory), { recursive: true, force: true });

        const removed = await this.Images().Delete(
            subcategory ? { guildId, category, subcategory } : { guildId, category }
        );

        if (subcategory) {
            await this.Categories().Delete({ guildId, name: subcategory, parent: category });
        } else {
            await this.Categories().Delete({ guildId, name: category, parent: null });
            await this.Categories().Delete({ guildId, parent: category });
        }

        logger.info(`🗑️  Kategorie "${category}" in ${guildId} gelöscht (${removed} Bild(er))`);

        return removed;
    }

    async AddImage(target: IGalleryTarget, url: string, fileName?: string): Promise<IGalleryEntry> {
        const { guildId, category, subcategory } = this.Normalize(target);

        if (!guildId || guildId === DEFAULT_SCOPE) throw new Error("Der Default-Scope kann nicht befüllt werden.");
        if (!category) throw new Error("Es wurde keine gültige Kategorie angegeben.");

        const source = ParseSource(url);

        const response = await axios.get<Readable>(source.href, {
            responseType: "stream",
            timeout: DOWNLOAD_TIMEOUT,
            maxRedirects: 3,
            maxContentLength: MAX_DOWNLOAD_BYTES,
            validateStatus: (status) => status === 200,
        });

        const contentType = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        const extension = EXTENSION_BY_MIME.get(contentType);

        if (!extension) {
            response.data.destroy();
            throw new Error(`Nicht unterstützter Dateityp: ${contentType || "unbekannt"}`);
        }

        const wanted = fileName ?? path.basename(source.pathname);
        const file = `${SanitizeName(path.parse(wanted).name) || `image-${Date.now()}`}${extension}`;

        const directory = this.DirectoryFor(guildId, category, subcategory);
        await mkdir(directory, { recursive: true });

        const destination = path.join(directory, file);

        let received = 0;
        response.data.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > MAX_DOWNLOAD_BYTES) {
                response.data.destroy(new Error(`Bild ist größer als ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB.`));
            }
        });

        try {
            await pipeline(response.data, createWriteStream(destination));
        } catch (error) {
            await unlink(destination).catch(() => {});
            throw error;
        }

        await this.EnsureCategory(guildId, category, subcategory);

        const document = await this.Images().Upsert(
            { guildId, category, subcategory, file },
            { createdAt: new Date() }
        );

        if (!document) throw new Error(`Das Bild "${file}" konnte nicht gespeichert werden.`);

        logger.info(`⬇️  Bild "${file}" in ${guildId}/${category} gespeichert`);

        return this.ToEntry(document);
    }

    async MoveImage(id: string, folder: IGalleryFolder): Promise<boolean> {
        const document = await this.FindImage(id);
        if (!document || document.guildId === DEFAULT_SCOPE) return false;

        const category = SanitizeName(folder.category);
        const subcategory = folder.subcategory ? SanitizeName(folder.subcategory) : null;
        if (!category) return false;

        const from = this.FileFor(document);
        const to = path.join(this.DirectoryFor(document.guildId, category, subcategory), document.file);
        if (from === to) return true;

        await mkdir(path.dirname(to), { recursive: true });
        await rename(from, to);

        await this.EnsureCategory(document.guildId, category, subcategory);
        await this.Images().Update({ id: document.id }, { category, subcategory });

        return true;
    }

    async DeleteImage(id: string): Promise<boolean> {
        const document = await this.FindImage(id);
        if (!document || document.guildId === DEFAULT_SCOPE) return false;

        await unlink(this.FileFor(document)).catch(() => {});
        await this.Images().Delete({ id: document.id });

        return true;
    }

    private Categories() {
        return this.client.database.GetRepository<IGalleryCategory>(CATEGORY_MODEL);
    }

    private Images() {
        return this.client.database.GetRepository<IGalleryImage>(IMAGE_MODEL);
    }

    private DirectoryFor(guildId: string, category: string, subcategory: string | null): string {
        return path.join(GALLERY_ROOT, guildId, category, subcategory ?? "");
    }

    private FileFor(image: IGalleryImage): string {
        return path.join(this.DirectoryFor(image.guildId, image.category, image.subcategory), image.file);
    }

    private Normalize(target: IGalleryTarget) {
        return {
            guildId: IsScope(target.guildId) ? target.guildId : null,
            category: SanitizeName(target.category),
            subcategory: target.subcategory ? SanitizeName(target.subcategory) : null,
        };
    }

    private async FindImage(id: string): Promise<GalleryDocument | null> {
        return this.Images().FindById(id);
    }

    private ToEntry(document: GalleryDocument): IGalleryEntry {
        const segments = [document.guildId, document.category, document.subcategory, document.file].filter(
            (segment): segment is string => Boolean(segment)
        );

        const label =
            document.guildId === DEFAULT_SCOPE
                ? DEFAULT_SCOPE
                : this.client.guilds.cache.get(document.guildId)?.name ?? document.guildId;

        const shortPath = segments.slice(1).join("/");

        return {
            guildId: document.guildId,
            category: document.category,
            subcategory: document.subcategory,
            file: document.file,
            createdAt: document.createdAt,
            id: String(document.id),
            url: `${this.client.server.BaseURL}/images/${segments.map(encodeURIComponent).join("/")}`,
            path: `${label}/${shortPath}`,
            shortPath,
        };
    }

    private async EnsureCategory(guildId: string, category: string, subcategory: string | null): Promise<void> {
        const categories = this.Categories();

        await categories.Upsert({ guildId, name: category, parent: null }, { createdAt: new Date() });

        if (!subcategory) return;

        await categories.Upsert({ guildId, name: subcategory, parent: category }, { createdAt: new Date() });
    }

    private async ListCategories(
        guildId: string,
        parent: string | null,
        options: IListOptions
    ): Promise<ICategoryEntry[]> {
        const { requireImages = true } = options;
        const scopes = IsScope(guildId) && guildId !== DEFAULT_SCOPE ? [DEFAULT_SCOPE, guildId] : [DEFAULT_SCOPE];

        const [found, images] = await Promise.all([
            this.Categories().Find({ guildId: { in: scopes }, parent }),
            this.Images().Find({ guildId: { in: scopes } }),
        ]);

        return found
            .map((category) => ({
                guildId: category.guildId,
                name: category.name,
                parent: category.parent,
                scope: (category.guildId === DEFAULT_SCOPE ? "default" : "custom") as "default" | "custom",
                images: images.filter(
                    (image) =>
                        image.guildId === category.guildId &&
                        (category.parent === null
                            ? image.category === category.name
                            : image.category === category.parent && image.subcategory === category.name)
                ).length,
            }))
            .filter((category) => !requireImages || category.images > 0)
            .sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
    }

    private async SyncDefaults(): Promise<void> {
        const found = await this.ScanDefaults();
        const images = this.Images();

        if (found.length > 0) {
            await images.InsertMissing(
                found.map((image) => ({
                    guildId: DEFAULT_SCOPE,
                    category: image.category,
                    subcategory: image.subcategory,
                    file: image.file,
                    createdAt: new Date(),
                }))
            );

            for (const image of found) {
                await this.EnsureCategory(DEFAULT_SCOPE, image.category, image.subcategory);
            }
        }

        const keys = new Set(found.map((image) => `${image.category}/${image.subcategory ?? ""}/${image.file}`));

        const stale = (await images.Find({ guildId: DEFAULT_SCOPE }))
            .filter((image) => !keys.has(`${image.category}/${image.subcategory ?? ""}/${image.file}`))
            .map((image) => image.id);

        if (stale.length > 0) {
            await images.Delete({ id: { in: stale } });
            await this.Categories().Delete({ guildId: DEFAULT_SCOPE, name: { notIn: [...keys] } });
        }

        logger.info(`🖼️  Galerie synchronisiert (${found.length} Default-Bild(er), ${stale.length} verwaist entfernt)`);
    }

    private async ScanDefaults(): Promise<Array<Pick<IGalleryImage, "category" | "subcategory" | "file">>> {
        const root = path.join(GALLERY_ROOT, DEFAULT_SCOPE);
        const found: Array<Pick<IGalleryImage, "category" | "subcategory" | "file">> = [];

        const categories = await readdir(root, { withFileTypes: true }).catch(() => []);

        for (const category of categories) {
            if (!category.isDirectory()) continue;

            const entries = await readdir(path.join(root, category.name), { withFileTypes: true }).catch(() => []);

            for (const entry of entries) {
                if (entry.isFile()) {
                    if (IsImageFile(entry.name)) {
                        found.push({ category: category.name, subcategory: null, file: entry.name });
                    }

                    continue;
                }

                const files = await readdir(path.join(root, category.name, entry.name)).catch(() => []);

                for (const file of files.filter(IsImageFile)) {
                    found.push({ category: category.name, subcategory: entry.name, file });
                }
            }
        }

        return found;
    }
}
