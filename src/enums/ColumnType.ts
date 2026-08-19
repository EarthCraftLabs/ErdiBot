enum ColumnType {
    CHAR = "char",
    STRING = "string",
    TINYTEXT = "tinytext",
    TEXT = "text",
    MEDIUMTEXT = "mediumtext",
    LONGTEXT = "longtext",
    UUID = "uuid",

    TINYINT = "tinyint",
    SMALLINT = "smallint",
    MEDIUMINT = "mediumint",
    INTEGER = "integer",
    BIGINT = "bigint",

    FLOAT = "float",
    DOUBLE = "double",
    DECIMAL = "decimal",

    BOOLEAN = "boolean",

    DATE = "date",
    DATETIME = "datetime",
    TIMESTAMP = "timestamp",
    TIME = "time",
    YEAR = "year",

    BINARY = "binary",
    VARBINARY = "varbinary",
    BLOB = "blob",
    MEDIUMBLOB = "mediumblob",
    LONGBLOB = "longblob",

    JSON = "json",
    ENUM = "enum",
    SET = "set",
}

export default ColumnType;
