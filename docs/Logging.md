# Logging

Schreibt mit, was auf dem Server passiert — in Discord-Kanäle, nicht in eine Datei. Eingerichtet wird alles über `/logging`.

Zugriff über den Client: `this.client.loggingService`.

Nicht zu verwechseln mit den **DevLogs** ([DevLogs.md](DevLogs.md)) — die zeigen die Logdateien des Bots. Hier geht es um Server-Ereignisse.

---

## Einrichten

```
/logging
```

1. Kategorie aus der Liste wählen
2. **Text-Kanal oder Thread?**
3. Kanal wählen — fertig, ab sofort wird protokolliert

Jede Kategorie ist einzeln einstellbar. Wer nur Nachrichten-Logs will, richtet nur die eine ein; alles andere bleibt aus.

### Warum erst die Kanal-Art

Ein Kanal-Auswahlmenü, das Text-Kanäle und Threads gleichzeitig anbietet, wird lang und unübersichtlich — beide heißen oft ähnlich, und man sieht nicht, was was ist. Deshalb kommt erst die Frage nach der Art, dann eine gefilterte Liste mit **nur** Text-Kanälen oder **nur** Threads.

| Auswahl | Was angeboten wird |
|---|---|
| 💬 Text-Kanal | Text- und Ankündigungs-Kanäle |
| 🧵 Thread | Öffentliche, private und Ankündigungs-Threads — auch Forum-Beiträge |

---

## Kategorien

| | Kategorie | Was dort landet |
|---|---|---|
| 🔌 | Verbindungs-Logs | Beitritte und Austritte, mit Kontoalter und Warnung bei frischen Konten |
| 📝 | Nachrichten-Logs | Gelöscht, bearbeitet, massenhaft gelöscht — mit Vorher/Nachher |
| 🔊 | Sprachkanal-Logs | Betreten, verlassen, gewechselt, Server-Stumm- und Taubschaltung |
| 🏷️ | Rollen-Logs | Erstellt, umbenannt, umgefärbt, Rechte geändert, gelöscht |
| ⚙️ | Kanal-Logs | Erstellt, umbenannt, verschoben, Thema, Slowmode, Bitrate, gelöscht |
| 👤 | Profil-Logs | Nickname, Benutzername, Avatar, zugewiesene Rollen |
| 🛡️ | Moderations-Logs | Bann, Entbannung, Kick, Timeout — mit Ausführendem und Grund |
| 📋 | Audit-Logs | Server-Einstellungen, Emojis, Einladungen, Webhooks |
| 🎫 | Ticket-Logs | Geöffnet, geschlossen, Nutzer gesperrt — siehe [Tickets.md](Tickets.md) |
| ⚠️ | Fehler-Logs | Der Guardian meldet hier abgefangene Fehler |

---

## Wer war es?

Discord-Events sagen, **was** passiert ist, aber nicht **wer** es war. Diese Information steht nur im Audit-Log, und dort auch erst kurz nach dem Ereignis.

Der Service fragt es deshalb für jedes relevante Ereignis nach und ordnet den Eintrag über Ziel-ID und Zeitfenster (8 Sekunden) zu. Fehlt dem Bot das Recht **Audit-Log einsehen**, wird gar nicht erst angefragt — der Log-Eintrag kommt dann trotzdem, nur ohne Namen.

Ein Kick ist der deutlichste Fall: Discord kennt **kein** Kick-Event. Ein Kick sieht aus wie ein normaler Austritt und ist ausschließlich am Audit-Log-Eintrag zu erkennen. Findet sich einer, landet der Eintrag im **Moderations-Log**, sonst im **Verbindungs-Log**.

---

## Threads als Log-Ziel

Ein archivierter Thread nimmt über die API **keine** Nachrichten an. Der Discord-Client entarchiviert beim Tippen automatisch, ein Bot muss das selbst tun. Ohne diesen Schritt gehen Logs still verloren, sobald ein Thread nach seiner `autoArchiveDuration` einschläft — ohne Fehlermeldung, ohne Hinweis.

Deshalb zwei Vorkehrungen:

1. **Beim Senden** weckt der Service einen archivierten Thread auf, bevor er schreibt.
2. **Täglich um 04:00** weckt der Runnable `LogThreadHeartbeat` alle Log-Threads. Das Entarchivieren allein setzt die Frist zurück — es wird bewusst **keine** Nachricht geschickt, die wäre nur sichtbarer Müll im Log-Kanal.

Ein **gesperrter** Thread lässt sich nicht wecken. Der Status meldet ihn als nicht schreibbereit.

---

## Status

Der Knopf **Status** im Panel prüft jede eingerichtete Kategorie:

- Existiert der Kanal noch?
- Ist es ein Text-Kanal oder ein Thread, und ist der archiviert?
- Darf der Bot dort schreiben? (`ViewChannel` plus `SendMessages` beziehungsweise `SendMessagesInThreads`)

**Alle testen** schickt in jede eingerichtete Kategorie eine Beispiel-Nachricht. Das ist der ehrlichste Test — er geht denselben Weg wie ein echter Log-Eintrag.

---

## Was nicht geloggt wird

Bewusst ausgelassen, weil es die Logs sonst unbrauchbar macht:

- **Bot-Nachrichten** bei Löschungen und Bearbeitungen
- **Reine Link-Vorschauen:** Discord feuert `messageUpdate` auch, wenn nur eine Vorschau nachgeladen wird. Ohne die Prüfung auf tatsächlich geänderten Text bestünde das Log daraus
- **Selbst-Stummschaltung** im Sprachkanal — Alltag, keine Moderationshandlung. Die *Server*-Stummschaltung wird protokolliert
- **Reine Sortierungsänderungen** an Rollen und Kanälen
- **Erwähnungen pingen nie.** Jeder Eintrag geht mit `allowedMentions: { parse: [] }` raus. Eine gelöschte `@everyone`-Nachricht weckt sonst beim Protokollieren den halben Server

Eine Ignorier-Liste für einzelne Kanäle, Rollen oder Nutzer gibt es (noch) nicht — sie lässt sich nachrüsten, ohne etwas Bestehendes anzufassen.

---

## Nachrichten im Cache

Der Bot läuft mit `Partials.Message` und Co. Ohne diese feuert `messageDelete` **nur** für Nachrichten, die noch im Speicher liegen — alles Ältere verschwindet spurlos, ohne dass es ein Event gäbe.

Mit Partials kommt der Eintrag in jedem Fall. Bei einer nicht mehr gecachten Nachricht fehlen dann Autor und Inhalt; der Eintrag sagt das offen (`_nicht verfügbar (nicht im Cache oder nur Anhang)_`), statt so zu tun, als wäre nichts gewesen. Dass etwas gelöscht wurde, wo und wann, ist bereits die halbe Information.

---

## Selbst etwas loggen

```ts
await this.client.loggingService.Send(guildId, {
    type: LogType.MODERATION,
    title: "Verwarnung erteilt",
    description: `${Line("👤", "Mitglied", Mention(member.id, member.user.tag))}\n${Line("📋", "Grund", reason)}`,
    thumbnailUrl: member.user.displayAvatarURL({ size: 256 }),
});
```

`Send` gibt `true` oder `false` zurück und wirft nie. Ein nicht eingerichteter Log-Kanal ist kein Fehler — der Aufrufer darf das Ergebnis ignorieren.

Die Bausteine aus `constants/Logging.ts` sorgen dafür, dass alle Einträge gleich aussehen:

| Helfer | Ergebnis |
|---|---|
| `Line("👤", "Autor", "wer")` | `👤 **Autor:** wer` |
| `Mention(id, tag)` | `<@id> (\`tag\`)` |
| `Channel(id)` | `<#id> (\`id\`)` |
| `Change("Name", alt, neu)` | `✏️ **Name:** \`alt\` → \`neu\`` — oder `null`, wenn gleich |
| `List(items)` | Kommaliste, ab 15 Einträgen gedeckelt |
| `Cut(text, max)` | Gekürzt mit `…` |

`Change` gibt bei Gleichheit `null` zurück. Deshalb sammeln die Handler ihre Zeilen und filtern `null` heraus — unveränderte Felder tauchen gar nicht erst auf.

---

## Guardian

Der Guardian benutzt denselben Kanal wie die Kategorie **Fehler-Logs** (`logType: "errorLog"`) und geht seit dieser Änderung über `loggingService.Writable()`. Ist sein Kanal ein archivierter Thread, wird der geweckt — vorher wären genau die Meldungen still verschwunden, die man am dringendsten sehen will.

Der String `errorLog` ist in `Guardian.GetServiceIDs` fest verdrahtet und wird vom Test festgenagelt.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/services/LoggingService.ts` | Kanal auflösen, Threads wecken, senden, Audit-Log abfragen |
| `src/builder/LoggingPanel.ts` | Das Setup-Panel |
| `src/builder/LogMessage.ts` | Der Container eines Eintrags |
| `src/events/logging/LoggingHandler.ts` | Buttons und Selects des Panels |
| `src/events/logs/*.ts` | 23 Event-Handler, einer pro Discord-Ereignis |
| `src/commands/admin/Logging.ts` | `/logging` |
| `src/runnables/LogThreadHeartbeat.ts` | Weckt Log-Threads täglich um 04:00 |
| `src/constants/Logging.ts` | Kategorien und Formatierungs-Bausteine |
| `src/enums/LogType.ts` | Die zehn Typen |
| `src/database/models/DiscordLogChannel.ts` | Die Tabelle (bestand bereits) |

---

## Test

```bash
npx tsx src/tests/Logging.test.ts
```

Prüft ohne Netz und ohne Datenbank: die zehn Kategorien, dass Text- und Thread-Auswahl sich **nicht** überschneiden, alle Formatierungs-Bausteine, dass ein Eintrag niemanden anpingt und kein `content` trägt, und 13 Panel-Zustände inklusive der leeren Einrichtung.

Festgenagelt wird außerdem `LogType.ERROR === "errorLog"` — der Guardian sucht genau diesen String.
