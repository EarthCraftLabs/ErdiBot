// Die Werte landen als logType in der Datenbank. "errorLog" wird zusätzlich vom
// Guardian gesucht - dieser String darf sich nicht ändern.
enum LogType {
    CONNECTION = "connectionLog",
    MESSAGE = "messageLog",
    VOICE = "voiceLog",
    ROLE = "roleLog",
    CHANNEL = "channelLog",
    PROFILE = "profileLog",
    MODERATION = "moderationLog",
    AUDIT = "auditLog",
    TICKET = "ticketLog",
    ERROR = "errorLog",
}

export default LogType;
