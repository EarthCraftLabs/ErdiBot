import ChronicleLogger from "../handler/ChronicleLogger";
import LogLevel from "../enums/LogLevel";

const logger = new ChronicleLogger({
    namespace: "bot",
    level: process.env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG,
    reportVersionsOf: ["discord.js"],
    version: "1.0.0",
    developer: "MecryTv",
    engine: "Node.js + Discord.js",
    language: "TypeScript",
});

export default logger;
export { ChronicleLogger, LogLevel };