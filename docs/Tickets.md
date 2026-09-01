# Ticket-System

Support-Tickets in Discord: ein Panel zum Öffnen, ein Kanal oder Forum-Beitrag pro Anliegen, fünfzehn Team-Aktionen darin und ein Transcript beim Schliessen. Eingerichtet wird alles über `/setup` → **🎫 Tickets**.

Zugriff über den Client: `this.client.ticketService`.

---

## Einrichten

```
/setup
```

Im Menü **🎫 Tickets** wählen. Mit **⬅️ Setup** geht es von jeder Ansicht wieder zur Auswahl zurück.

Die Übersicht zeigt, was noch fehlt. Nötig sind vier Dinge:

1. **Kanäle** — Forum oder Kategorie, Panel-Kanal
2. **Rollen** — wer Tickets bearbeiten darf
3. **Kategorien** — wofür Tickets geöffnet werden können
4. **Panel senden** — die öffentliche Nachricht

Erst wenn alles steht, lässt sich das System aktivieren. Solange etwas fehlt, sagt das Panel es direkt.

### Wohin die Transcripts gehen

Nicht hierher: der Zielkanal ist der **Ticket-Log** aus `/setup` → **🗒️ Logging**. Er wurde dort schon einmal abgefragt, ein zweites Feld daneben wäre nur eine zweite Stelle zum Vergessen. Ist kein Ticket-Log gesetzt, bekommt nur der Ersteller sein Transcript per Direktnachricht — das Ticket-Setup weist darauf hin.

### Kanal-Auswahl

Beim Panel-Kanal kommt erst die Frage **Text-Kanal oder Thread?**, danach eine gefilterte Liste. Gemischt wären beide Arten eine lange Liste, in der man nicht sieht, was was ist. Forum, Kategorie und Warteraum haben diese Wahl nicht — dort gibt es nur einen möglichen Typ.

---

## Zwei Modi

| | Forum | Kategorie |
|---|---|---|
| Ticket ist | ein Forum-Beitrag | ein eigener Textkanal |
| Priorität | setzt einen Forum-Tag | steht nur in der Nachricht |
| Beim Schliessen | gelöscht | gelöscht |
| Rechte pro Ticket | erbt die des Forums | eigene Overwrites |
| Claim sperrt das Team aus | nein | ja |

**Forum** ist die modernere Variante: Tags sortieren nach Dringlichkeit, ein Beitrag belegt keinen Platz in der Kanalliste. **Kategorie** funktioniert auf Servern ohne Forum-Kanal und erlaubt echte Rechte pro Ticket. Geschlossen wird in beiden Fällen gelöscht — der Verlauf steht im Transcript, ein zweiter Ort für dieselben Daten bringt nichts.

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
2. **Nachricht an den Ersteller** per Direktnachricht, mit Karte und Link
3. **Eintrag im Ticket-Log** (aus dem Logging-Setup) — Karte und Link, dazu die internen Team-Notizen

Danach wird der Kanal beziehungsweise der Forum-Beitrag nach acht Sekunden gelöscht — lange genug, dass alle Beteiligten die Abschlussnachricht noch lesen.

**Scheitert das Transcript, bleibt das Ticket offen.** Ein Ticket zu schliessen, dessen Verlauf verloren ist, wäre der schlechtere Ausgang.

### Die Abschlusskarte

Die Nachricht ist ein **gezeichnetes Bild**, kein Text: `src/builder/TranscriptCard.ts` rendert sie mit `@napi-rs/canvas` — zwei Spalten, farbige Icon-Flächen, Badges für Kategorie und Priorität. Die Akzentfarbe ist die der Priorität, bei *Kritisch* also rot.

Zwei Dinge folgen daraus:

- **Ein Bild löst keine Erwähnung auf.** Statt `<@id>` steht der Anzeigename da, den der Handler vorher über `users.fetch` holt — daneben die Discord-ID, weil Anzeigenamen sich ändern und IDs nicht. Wird es eng, weicht der Name, nie die ID.
- **Der Link ist ein echter Knopf** unter dem Bild, kein gemalter. Auf der Karte steht stattdessen die Transcript-ID.
- **Die HTML-Datei hängt nirgends an**, weder im Kanal noch in der Direktnachricht — Discord würde sie als Code-Vorschau ausrollen. Der Knopf führt zum Transcript auf dem Webserver.

Die Schriften kommen aus `src/assets/fonts` (Inter, JetBrains Mono für die Transcript-ID), die Icons aus **Noto Color Emoji** des Systems. Fehlt die Emoji-Schrift auf dem Host, bleiben die Icon-Flächen leer — der Rest der Karte steht trotzdem.

| Feld | |
|---|---|
| Nummer, Kategorie, Priorität | wie im Ticket |
| Ersteller, Bearbeiter, Geschlossen von | wer beteiligt war |
| Geöffnet, Geschlossen, **Laufzeit** | wie lange es offen war |
| **Nachrichten**, **Beteiligte** | wie viel Betrieb war |
| Grund, Transcript-ID | nebeneinander unter den Spalten |

Der **Grund ist Pflicht** — für das Team wie für den Ersteller. Discord erzwingt nur ein nicht-leeres Feld, deshalb weist der Handler auch reine Leerzeichen ab; das Ticket bleibt dann offen. Lange Gründe brechen auf bis zu drei Zeilen um, der Rest endet mit Auslassungspunkten.
| **Reaktionszeit** | wie lange bis zur Übernahme |
| Merkmale | eingefroren, anonym, Notizen, Termin |

Reaktionszeit und Laufzeit sind die Zahlen, nach denen ein Support-Team am ehesten gefragt wird — deshalb stehen sie direkt in der Nachricht statt nur im Transcript.

**Interne Team-Notizen stehen ausschliesslich im Ticket-Log**, nie in der Nachricht an den Ersteller. Der Test nagelt genau das fest.

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

Zur Wahl stehen nur Rollen, die vorher unter **🛠️ Rollen** als Support-Rolle eingetragen wurden. Eine fremde Rolle zuständig zu machen, die im Ticket nichts sehen darf, wäre ein Ping ins Leere. Wird eine Rolle später aus dem Support-Team entfernt, bleibt sie zuständig — die Kategorie weist darauf hin.

Die Team-Aktionen darf jeder benutzen, der eine der eingetragenen Support-Rollen hat oder Administrator ist, unabhängig von der Kategorie.

### Emoji einer Kategorie

Zwei Wege: **Text ändern** nimmt jedes Standard-Emoji als Text entgegen, das Menü darunter listet die **Emojis dieses Servers**. Discord hat für Komponenten keinen Emoji-Picker, deshalb ein Select — mehr als 25 passen nicht hinein, ab da wird geblättert.

---

## Panel-Bilder

Das öffentliche Panel trägt zwei Bilder, beide optional:

| | Wo | Wirkung |
|---|---|---|
| **Bild** | unter dem Text | volle Breite, als Galerie |
| **Thumbnail** | neben dem Text | klein, rechts — der Text wird dafür zur Section |

Beide kommen entweder als Adresse über **Bilder & Farbe** oder aus der Galerie über **Bild aus Galerie** / **Thumbnail aus Galerie** — derselbe Bestand, den auch `/gallery` und das Welcome-Panel benutzen. Ein leeres Feld im Modal entfernt das Bild.

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
| `src/builder/TranscriptMessage.ts` | Abschlussnachricht für Ticket-Log und Ersteller |
| `src/builder/TranscriptCard.ts` | Zeichnet die Abschlusskarte als PNG |
| `src/events/ticket/TicketHandler.ts` | Panel-Auswahl und die fünfzehn Aktionen |
| `src/events/ticket/TicketSetupHandler.ts` | Das Setup bedienen |
| `src/events/ticket/TicketAnonymous.ts` | Nachrichten im anonymen Modus umschreiben |
| `src/commands/admin/Setup.ts` | `/setup` |
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
