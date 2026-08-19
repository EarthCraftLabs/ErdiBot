export default interface IGalleryCategory {
    guildId: string;
    name: string;
    parent: string | null;
    createdAt: Date;
}
