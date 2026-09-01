# Bot-Status

Was unter dem Bot in der Mitgliederliste steht — *Hört EarthCraft | /help*, *Spielt Minecraft*, *Schaut 3 offene Tickets*. Eingerichtet wird alles über `/status`.

Der Status ist **global**: Discord kennt eine Presence pro Bot, nicht eine pro Server. Was hier eingetragen wird, sehen alle Server.

---

## Einrichten

```
/status
```

Das Panel zeigt die Rotation, alle Einträge und was gerade sichtbar ist. `Administrator` vorausgesetzt, die Antwort ist ephemeral.

| Knopf | |
|---|---|
| ➕ Status anlegen | Modal mit **Art** und **Text** in einem Schritt |
| 🔄 Intervall | Wie schnell gewechselt wird |
| 🔌 Rotation aus/an | Hält die Rotation an, ohne etwas zu löschen |
| ⏭️ Weiterschalten | Schaltet sofort weiter, ohne aufs Intervall zu warten |
| 🔣 Platzhalter | Die Liste der Bausteine |

---

## Die zwei festen Einträge

|  | |
|---|---|
| `Hört EarthCraft | /help` | wo die Befehle stehen |
| `Entwickelt von MecryTv` | wer den Bot gebaut hat |

Beide laufen **immer** mit und lassen sich weder löschen noch pausieren. Sie stehen bewusst **nicht in der Datenbank**, sondern in `src/constants/Status.ts` — was nicht gespeichert wird, kann auch nicht fehlen.

---

## Arten

| Art | Sieht aus wie |
|---|---|
| 🎮 Spielt | *Spielt Minecraft* |
| 🎧 Hört | *Hört EarthCraft \| /help* |
| 👀 Schaut | *Schaut 12 Mitgliedern zu* |
| 🏆 Tritt an | *Tritt an in einem Turnier* |
| 💬 Freitext | nur der Text, ohne Vorsatz |

**Freitext ist der Sonderfall:** Discord zeigt bei Bots nichts an, wenn der Text im `name` steht — er muss in `state`. Genau daran ist die alte, fest verdrahtete Rotation gescheitert: *Developed by MecryTv* war eingetragen und blieb trotzdem unsichtbar.

---

## Platzhalter

| Baustein | |
|---|---|
| `{servers}` | Anzahl der Server |
| `{members}` | Anzahl der Mitglieder |
| `{channels}` | Anzahl der Kanäle |
| `{tickets}` | Offene Tickets |
| `{ping}` | Gateway-Ping, z.B. `42ms` |
| `{uptime}` | Laufzeit, z.B. `3h 12m` |

Eingesetzt wird bei **jedem Wechsel**, nicht beim Speichern. Aufgelöst wird nur, was auch vorkommt: `{tickets}` kostet eine Datenbankabfrage, die bei einem Status ohne diesen Baustein niemand braucht. Ein unbekannter Baustein bleibt stehen, statt den Text zu zerlegen.

Ein Status darf **128 Zeichen** lang sein — eingesetzte Zahlen zählen mit, der fertige Text wird notfalls gekürzt.

---

## Rotation

Gewechselt wird **zufällig**, aber nie zweimal derselbe Eintrag hintereinander — sonst sieht es aus, als stünde die Rotation still.

Das Intervall liegt zwischen **15 und 3600 Sekunden**, Standard 30. Unter 15 geht nicht: Discord lässt nur fünf Presence-Updates pro 20 Sekunden zu, und der Bot tut nebenbei noch anderes.

Der Timer läuft im `StatusService`, nicht als `Runnable`. Grund: das Intervall ist zur Laufzeit änderbar, und ein Runnable trägt seinen Takt fest im Konstruktor.

---

## Die Bausteine

| Datei | Aufgabe |
|---|---|
| `src/commands/admin/Status.ts` | `/status` |
| `src/builder/StatusPanel.ts` | Zeichnet das Panel, hält dessen Zustand |
| `src/events/status/StatusHandler.ts` | Bedient Knöpfe, Menüs und Modals |
| `src/services/StatusService.ts` | Rotation, Platzhalter, Datenbank |
| `src/constants/Status.ts` | Feste Einträge, Arten, Grenzen, Normalisierung |
| `src/database/models/BotStatus.ts` | Die Einträge |
| `src/database/models/BotStatusSettings.ts` | Intervall und An/Aus |

---

## Tabellen

| Tabelle | |
|---|---|
| `bot_status` | Ein Eintrag pro Zeile — ohne `guildId`, weil der Status global gilt |
| `bot_status_settings` | Genau eine Zeile (`scope = "global"`) für Intervall und An/Aus |

Beide legt `SchemaSync` beim Start selbst an.

---

## Test

```bash
npx tsx src/tests/Status.test.ts
```

Der wichtigste Fall: **ein Freitext-Status muss seinen Text in `state` tragen**, nicht in `name`. Dazu Normalisierung kaputter Zeilen, die Grenzen des Intervalls, alle Platzhalter samt Datenbankausfall bei `{tickets}` und dass die festen Einträge im Panel weder einen Lösch- noch einen Pausieren-Knopf bekommen.
