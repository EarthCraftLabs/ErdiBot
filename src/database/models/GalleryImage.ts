import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import IGalleryImage from "../../interfaces/services/gallery/IGalleryImage";

const GalleryImage: ITableDefinition<IGalleryImage> = {
    name: "GalleryImage",
    table: "gallery_images",
    columns: {
        guildId: { type: ColumnType.STRING, length: 20 },
        category: { type: ColumnType.STRING, length: 32 },
        subcategory: { type: ColumnType.STRING, length: 32, nullable: true, blankAsNull: true },
        file: { type: ColumnType.STRING, length: 255 },
        createdAt: { type: ColumnType.DATETIME },
    },
    indexes: [
        { name: "uniq_image", columns: ["guildId", "category", "subcategory", "file"], unique: true },
        { name: "idx_image_scope", columns: ["guildId", "category"] },
    ],
};

export default GalleryImage;
