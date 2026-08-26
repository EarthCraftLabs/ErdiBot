# Ticket-System

Support-Tickets in Discord: ein Panel zum Öffnen, ein Kanal oder Forum-Beitrag pro Anliegen, fünfzehn Team-Aktionen darin und ein Transcript beim Schliessen. Eingerichtet wird alles über `/tickets`.

Zugriff über den Client: `this.client.ticketService`.

---

## Einrichten

```
/tickets
```

Die Übersicht zeigt, was noch fehlt. Nötig sind vier Dinge:

1. **Kanäle** — Forum oder Kategorie, Panel-Kanal, Transcript-Kanal
2. **Rollen** — wer Tickets bearbeiten darf
3. **Kategorien** — wofür Tickets geöffnet werden können
4. **Panel senden** — die öffentliche Nachricht

Erst wenn alles steht, lässt sich das System aktivieren. Solange etwas fehlt, sagt das Panel es direkt.

### Kanal-Auswahl

Beim Panel- und Transcript-Kanal kommt erst die Frage **Text-Kanal oder Thread?**, danach eine gefilterte Liste. Gemischt wären beide Arten eine lange Liste, in der man nicht sieht, was was ist. Forum, Kategorie und Warteraum haben diese Wahl nicht — dort gibt es nur einen möglichen Typ.

---

## Zwei Modi

| | Forum | Kategorie |
|---|---|---|
| Ticket ist | ein Forum-Beitrag | ein eigener Textkanal |
| Priorität | setzt einen Forum-Tag | steht nur in der Nachricht |
| Beim Schliessen | archiviert und gesperrt | gelöscht |
| Rechte pro Ticket | erbt die des Forums | eigene Overwrites |
| Claim sperrt das Team aus | nein | ja |

**Forum** ist die modernere Variante: der Verlauf bleibt durchsuchbar, Tags sortieren nach Dringlichkeit, nichts geht verloren. **Kategorie** funktioniert auf Servern ohne Forum-Kanal und erlaubt echte Rechte pro Ticket — dafür ist der Kanal nach dem Schliessen weg.

Der Modus lässt sich jederzeit umstellen. Bereits offene Tickets behalten ihren eigenen Modus, gespeichert am Ticket selbst.

---

## Die fünfzehn Team-Aktionen

Erreichbar über das Menü an der Hauptnachricht im Ticket. Sichtbar ist es für alle, benutzbar nur für das Support-Team und Administratoren.

| | Aktion | Was passiert |
|---|---|---|
| ✅ | Beanspruchen | Übernimmt das Ticket. Im Kategorie-Modus darf danach nur noch der Bearbeiter schreiben, das Team liest weiter mit |
| ↩️ | Zurückgeben | Gibt es wieder frei. Nur der Bearbeiter selbst oder ein Administrator |
| 🔁 | Verschieben | Andere Kategorie, übernimmt deren Priorität und Forum-Tag |
| ⚡ | Priorität | Ändert Dringlichkeit und Forum-Tag |
| 🛡️ | Anonymer Modus | Team schreibt unter dem Alias „Support-Team" statt unter dem eigenen Namen |
| 🖼️ | Medien-Tresor | Alle hochgeladenen Bilder als Galerie mit Quelle |
| ⏱️ | Slowmode | Nachrichtensperre gegen Spam, 0 bis 21600 Sekunden |
| 📖 | Zusammenfassung | Stand, Zahlen, letzte Nachricht, letzte Notizen |
| 📝 | Team-Notiz | Interne Notizen ansehen, anlegen, löschen |
| ➕➖ | Benutzer | Weitere Person ins Ticket holen oder entfernen |
| 🥶 | Einfrieren | Sperrt den Ersteller temporär vom Schreiben |
| 🚫 | Sperren | Blacklist für das Ticket-System, mit optionaler Dauer |
| 📅 | Termin | Gespräch planen, Erinnerung kommt automatisch |
| ❌ | Schliessen | Transcript, Nachricht an Ersteller und Archiv, dann zu |

---

## Beim Schliessen

Drei Dinge passieren, in dieser Reihenfolge:

1. **Transcript** — der komplette Verlauf wird als HTML gesichert, mit eingebetteten Bildern
2. **Nachricht an den Ersteller** per Direktnachricht, mit Datei und Link
3. **Eintrag im Transcript-Kanal**, zusätzlich mit den internen Team-Notizen

Danach wird der Beitrag archiviert beziehungsweise der Kanal nach acht Sekunden gelöscht — lange genug, dass alle Beteiligten die Abschlussnachricht noch lesen.

**Scheitert das Transcript, bleibt das Ticket offen.** Ein Ticket zu schliessen, dessen Verlauf verloren ist, wäre der schlechtere Ausgang.

### Was in der Nachricht steht

| Feld | |
|---|---|
| Nummer, Kategorie, Priorität | wie im Ticket |
| Ersteller, Bearbeiter, Geschlossen von | wer beteiligt war |
| Geöffnet, Geschlossen, **Laufzeit** | wie lange es offen war |
| **Nachrichten**, **Beteiligte** | wie viel Betrieb war |
| **Reaktionszeit** | wie lange bis zur Übernahme |
| Merkmale | eingefroren, anonym, Notizen, Termin |

Reaktionszeit und Laufzeit sind die Zahlen, nach denen ein Support-Team am ehesten gefragt wird — deshalb stehen sie direkt in der Nachricht statt nur im Transcript.

**Interne Team-Notizen stehen ausschliesslich im Transcript-Kanal**, nie in der Nachricht an den Ersteller. Der Test nagelt genau das fest.

---

## Transcripts

Erzeugt mit `discord-transcripts-v2`, abgelegt unter `public/transcripts/<id>.html` und ausgeliefert vom eigenen Webserver unter `SERVER_PUBLIC_URL/transcripts/<id>`.

Die ID besteht aus vier Blöcken à vier Zeichen (`Ab3X-9kLm-Qw2p-Zt7R`) — kurz genug zum Vorlesen, gross genug, dass niemand fremde Transcripts durch Raten findet.

**Sicherheit der Route:**

- Nur das exakte ID-Format kommt durch. Ein `../` scheitert schon am Muster, bevor irgendein Pfad gebaut wird
- Die ID muss zusätzlich in der Datenbank stehen
- `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` und `Referrer-Policy: no-referrer` — Gesprächsinhalte gehören in keinen Zwischenspeicher und in keinen Suchindex

Wer den Link hat, sieht das Transcript. Für mehr bräuchte es eine Anmeldung; das Verzeichnis steht in der `.gitignore`.

---

## Prioritäten

| | | Bei Erstellung |
|---|---|---|
| 🟢 | Niedrig | — |
| 🟡 | Mittel | — |
| 🟠 | Hoch | Direktnachricht ans zuständige Team |
| 🔴 | Kritisch | Direktnachricht ans zuständige Team |

Die Direktnachricht geht nur an die Rollen, die für **diese Kategorie** zuständig sind — ein Ping im Kanal wird nachts gern übersehen.

Im Forum-Modus setzt die Priorität zusätzlich einen Tag. Der Bot sucht dafür einen Tag, dessen Name der Stufe entspricht (`Hoch` oder `high`). Gibt es keinen, bleibt das Ticket ohne Tag — angelegt wird keiner.

---

## Zuständigkeit

Jede Kategorie hat entweder eine eigene Rolle oder steht auf **alle Support-Rollen**. Das entscheidet, wer gepingt wird, wer die Direktnachricht bekommt und — im Kategorie-Modus — wer den Kanal überhaupt sieht.

Die Team-Aktionen darf jeder benutzen, der eine der eingetragenen Support-Rollen hat oder Administrator ist, unabhängig von der Kategorie.

---

## Ticket-Nummern

Der Zähler steht in der Konfiguration und wird **atomar** hochgezählt:

```sql
UPDATE ticket_config SET ticket_counter = LAST_INSERT_ID(ticket_counter + 1) WHERE guild_id = ?
```

Erhöhen und Auslesen sind damit ein einziger Schritt. Ein Zähler, den zwei gleichzeitige Tickets lesen und dann schreiben, würde dieselbe Nummer zweimal vergeben.

---

## Anonymer Modus

Ist er an, werden Nachrichten des Teams gelöscht und über einen Webhook unter dem Alias „Support-Team" neu gesendet. Der Ersteller schreibt weiterhin unter seinem Namen — er soll erkennbar bleiben.

Der Webhook hängt am Kanal, im Forum-Modus am übergeordneten Forum: Threads können keine eigenen Webhooks haben, dort läuft es über `thread_id`.

---

## Wartung

Der Runnable `TicketMaintenance` läuft alle 15 Minuten und erledigt zwei Dinge:

- **Termin-Erinnerungen** verschicken, sobald der Zeitpunkt erreicht ist. Ein archivierter Forum-Beitrag wird dafür geweckt
- **Abgelaufene Sperren** entfernen. Beim Ticket-Öffnen wird ohnehin geprüft, ob eine Sperre noch gilt — das hier hält nur die Tabelle klein

---

## Tabellen

| Tabelle | Inhalt |
|---|---|
| `ticket_config` | Eine Zeile pro Server: Kanäle, Rollen, Kategorien, Panel, Zähler |
| `tickets` | Eine Zeile pro Ticket, Schlüssel ist die Kanal-ID |
| `ticket_blacklist` | Gesperrte Nutzer, optional mit Ablauf |
| `ticket_transcripts` | Wo welches Transcript liegt, plus Kennzahlen |

Kategorien, Support-Rollen, Notizen und der Termin liegen als JSON in ihrer Zeile. Alles, was von dort kommt, läuft durch `NormalizeConfig` beziehungsweise `NormalizeTicket` — eine kaputte oder veraltete Zeile darf das Panel nicht sprengen.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/services/TicketService.ts` | Anlegen, Rechte, Transcript, Schliessen |
| `src/builder/TicketSetupPanel.ts` | Das Setup |
| `src/builder/TicketMessage.ts` | Hauptnachricht im Ticket und das öffentliche Panel |
| `src/builder/TranscriptMessage.ts` | Abschlussnachricht für Archiv und Ersteller |
| `src/events/ticket/TicketHandler.ts` | Panel-Auswahl und die fünfzehn Aktionen |
| `src/events/ticket/TicketSetupHandler.ts` | Das Setup bedienen |
| `src/events/ticket/TicketAnonymous.ts` | Nachrichten im anonymen Modus umschreiben |
| `src/commands/admin/Tickets.ts` | `/tickets` |
| `src/routes/Transcripts.ts` | Transcript im Browser |
| `src/runnables/TicketMaintenance.ts` | Erinnerungen und Aufräumen |
| `src/constants/Ticket.ts` | Standards, Normalisierung, Prioritäten |
| `src/config/ticket.json` | Die fünfzehn Aktionen |

---

## Test

```bash
npx tsx src/tests/Ticket.test.ts
```

Prüft ohne Netz und ohne Datenbank: dass kaputte Datenbankzeilen repariert statt geworfen werden, die vier Prioritäten, dass alle fünfzehn Aktionen eindeutig sind, dass Text- und Thread-Auswahl getrennt bleiben, dass ein Pfad keine Transcript-ID sein kann, die Laufzeit- und Reaktionszeit-Berechnung und 22 Panel-Zustände.

Der wichtigste Fall: **interne Team-Notizen dürfen nie in der Nachricht an den Ersteller landen.**
