# Setup

Ein Command für alles Einrichtbare: `/setup` zeigt eine Übersicht aller Bereiche, ein Select-Menü öffnet einen davon **in derselben Nachricht**.

---

## Die Bausteine

| Datei | Aufgabe |
|---|---|
| `src/commands/admin/Setup.ts` | `/setup` — rendert die Übersicht |
| `src/builder/SetupPanel.ts` | Die Übersicht **und** die Modul-Registry |
| `src/events/setup/SetupHandler.ts` | Bedient Auswahl und Rückweg |
| `src/constants/Setup.ts` | Config-Schlüssel und die beiden customId-Präfixe |
| `src/interfaces/services/setup/ISetupModule.ts` | Was ein Modul können muss |
| `src/config/setup.json` | Welche Bereiche angeboten werden |

---

## Ablauf

```
/setup                     →  Übersicht mit Status pro Bereich
   └─ Select "Bereich"     →  Modul übernimmt dieselbe Nachricht
        └─ ⬅️ Setup         →  zurück zur Übersicht
```

`Administrator` vorausgesetzt, die Antwort ist ephemeral und läuft nach 30 Minuten ab — genau wie die Panel-Zustände der Module.

Der Hub selbst hat **keinen** Zustand. Beim Öffnen eines Bereichs legt dessen `Open()` den Panel-Zustand unter der Message-ID ab; ab da bedient der Handler des Moduls seine eigenen customIds auf derselben Nachricht. Der Hub kennt weder die Ansichten noch die Daten eines Moduls.

> **Ungespeichertes geht beim Zurückgehen verloren.** `Open()` liest immer frisch aus der Datenbank. Wer im Welcome-Panel etwas ändert und ohne **💾 Speichern** auf **⬅️ Setup** klickt, fängt von vorn an.

---

## Ein Modul anmelden

Ein Modul ist ein Objekt mit drei Feldern — `key`, `Status()` und `Open()`:

```ts
const ReactionRoles: ISetupModule = {
    key: "reactionroles",

    async Status(client, guildId) {
        const panels = await client.reactionRolesService.List(guildId);

        return panels.length === 0 ? "⚪ Noch kein Panel angelegt" : `🟢 ${panels.length} Panel(s)`;
    },

    async Open(client, guildId, messageId) {
        const state = NewPanelState(guildId);

        PanelStates.set(messageId, state);

        return RenderPanel(client, state);
    },
};

export const SETUP_MODULES: Record<string, ISetupModule> = {
    [Welcome.key]: Welcome,
    [ReactionRoles.key]: ReactionRoles,
};
```

Dazu kommt ein Eintrag in `src/config/setup.json` mit demselben `value` wie der `key`:

```json
{ "name": "Reaktionsrollen", "description": "Rollen, die sich Mitglieder selbst geben können", "value": "reactionroles", "emoji": "🎭" }
```

Beides muss zusammenpassen: Optionen ohne Modul werden aus der Übersicht gefiltert, Module ohne Option tauchen nicht auf. So lässt sich ein Bereich abschalten, ohne Code zu löschen.

Damit ein Modul zurückführen kann, gehört in seine Startansicht ein Knopf mit `BACK_TO_SETUP` aus `src/constants/Setup.ts`:

```ts
builder.buttons({ customId: BACK_TO_SETUP, label: "Setup", emoji: "⬅️", tone: "danger" });
```

`constants/Setup.ts` importiert bewusst nichts — sonst gäbe es einen Import-Kreis zwischen Registry und Panels.

---

## Status-Zeilen

Jeder Bereich zeigt unter seinem Namen eine Zeile aus `Status()`. Die laufen parallel und werden einzeln abgefangen:

```ts
SetupModule(option.value)!.Status(client, guildId).catch(() => "⚠️ Status nicht verfügbar")
```

Fällt die Datenbank aus, steht dort ein Hinweis — die Übersicht selbst bleibt bedienbar.

---

## Bereiche

| Bereich | Doku |
|---|---|
| 👋 Willkommen | [Welcome](Welcome.md) |
| 🎭 Reaktionsrollen | [ReactionRoles](ReactionRoles.md) |

Die Galerie hat bewusst einen eigenen Command (`/gallery`): sie verwaltet Dateien, sie richtet nichts ein.
