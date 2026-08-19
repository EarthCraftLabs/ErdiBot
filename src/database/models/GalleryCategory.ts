import ColumnType from "../../enums/ColumnType";
import ITableDefinition from "../../interfaces/database/ITableDefinition";
import IGalleryCategory from "../../interfaces/services/gallery/IGalleryCategory";

const GalleryCategory: ITableDefinition<IGalleryCategory> = {
    name: "GalleryCategory",
    table: "gallery_categories",
    columns: {
        guildId: { type: ColumnType.STRING, length: 20 },
        name: { type: ColumnType.STRING, length: 32 },
        parent: { type: ColumnType.STRING, length: 32, nullable: true, blankAsNull: true },
        createdAt: { type: ColumnType.DATETIME },
    },
    indexes: [
        { name: "uniq_category", columns: ["guildId", "parent", "name"], unique: true },
    ],
};

export default GalleryCategory;
