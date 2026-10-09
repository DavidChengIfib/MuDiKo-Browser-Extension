# MuDiKo für AI Studio (Browser-Extension, Prototyp)

Chrome- und Edge-Extension für Lehrkräfte, die mit **Google AI Studio** Musik-Lern-Apps bauen. Sie öffnet sich als Seitenleiste mit drei Bereichen:

| Bereich | Was er kann |
|---|---|
| **Hochladen** | Ein AI-Studio-Projekt (ZIP) ohne Anmeldung zur Prüfung an den **MuDiKo Musik Hub** senden. Die ZIP aus „Download“ in AI Studio wird automatisch übernommen. |
| **AI Studio** | **Generator:** Formular (Thema, Zielgruppe, Lernziele, Grenzen, Differenzierung, Wünsche) → **System Instruction** und **erster Prompt**, dazu fertige Folge-Prompts. **Bausteine:** Lernpfad-Grundgerüst, Quiz, Zuordnen per Drag & Drop, Klaviatur als Kontext für die KI. **Remix:** Lernpfade aus dem Hub aussuchen und als ZIP herunterladen (alle Apps, für die ein Admin Remix eingeschaltet hat). |
| **Einstellungen** | Hub-Adresse und Diagnose-Protokoll für Tests. |

Texte aus Generator und Bausteinen lassen sich **direkt in AI Studio einfügen**: die System Instruction unter Einstellungen → *System Instructions* → *Custom Instructions*, Prompts und Bausteine in das Chat-Feld.

## Installieren

Normale Chrome-Extension (Manifest V3, ab Chrome 116). Edge nutzt dieselbe Technik.

1. Hub lokal starten (im Hub-Repo): `docker compose -f docker-compose.dev.yml up -d`
2. Chrome: `chrome://extensions` öffnen (Edge: `edge://extensions`).
3. **Entwicklermodus** einschalten.
4. **Entpackte Erweiterung laden** und den Ordner `extension/` auswählen (nicht den Projektordner).
5. Das MuDiKo-Symbol anheften. Ein Klick darauf öffnet die Seitenleiste.

Nach jeder Code-Änderung auf der Erweiterungsseite auf „Neu laden“ klicken und **offene AI-Studio-Tabs neu laden**, sonst fehlen dort ZIP-Erkennung und Einfügen.

## So testest du

### Hochladen
1. In AI Studio ein Projekt über „Download“ als ZIP herunterladen. Unten rechts erscheint **„MuDiKo: ZIP übernommen“**.
2. In der Seitenleiste unter **Hochladen** sind Name und Beschreibung schon ausgefüllt. Tags wählen, optional **Dein Name** eintragen, **Zur Prüfung senden**.
3. Im Hub unter **Warteliste** (`/admin/submissions`) prüft ein Admin das Projekt und deployt es.

Klappt die automatische Übernahme nicht, die ZIP in das Feld „ZIP hier ablegen“ ziehen.

### Generator und Einfügen in AI Studio
1. **AI Studio → Generator**: Thema eintragen, Fragen beantworten, **System Instruction & Prompt erstellen**. Das Formular wird gespeichert.
2. AI-Studio-Projekt im aktiven Tab öffnen und bei der System Instruction auf **In AI Studio einfügen** klicken.
3. In AI Studio Einstellungen → *System Instructions* → *Custom Instructions* öffnen und **in das Textfeld klicken**. Die Extension füllt das Feld (sie wartet bis zu 3 Minuten). Erkennt sie es von selbst, reicht schon das Öffnen. Ist sie sich bei einem angeklickten Feld unsicher, fragt sie „hier einfügen?“. Steht schon Text im Feld, fragt sie: ersetzen, anhängen oder abbrechen.
4. Beim Prompt **In AI Studio einfügen** klicken, dann ins Chat-Feld klicken. Abschicken machst du selbst.

Der Text liegt in jedem Fall auch in der Zwischenablage (Strg+V). Weil Google den Aufbau der AI-Studio-Seite nicht dokumentiert, sucht die Extension die Felder über ihre Beschriftung. Findet sie ein Feld nicht, steht unter **Einstellungen → Diagnose**, welche Textfelder sie gesehen hat. Diesen Text bitte weitergeben.

### Bausteine und Remix
- **Bausteine**: **Vorschau** öffnet den Baustein zum Ausprobieren, **In AI Studio einfügen** gibt ihn als Kontext in den Chat.
- **Remix**: Liste aller Apps, für die ein Admin im Hub unter App-Details → **Remix einschalten** geklickt hat, mit Suche und **ZIP herunterladen**. AI Studio kann Projekte über **+ → Import from GitHub** übernehmen. Einen ZIP-Import beschreibt Google nicht, daher führt der Weg über ein eigenes GitHub-Repository oder eine IDE.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `extension/manifest.json` | Berechtigungen, Seitenleiste, Skripte für AI Studio, isolierte Vorschau-Seite |
| `extension/sidepanel.html`, `sidepanel.css`, `sidepanel.js` | Seitenleiste mit Navigation links |
| `extension/panel/upload.js` | Bereich Hochladen |
| `extension/panel/studio.js` | Bereich AI Studio: Generator, Bausteine, Remix |
| `extension/panel/settings.js` | Bereich Einstellungen: Hub-Adresse, Diagnose |
| `extension/panel/hub.js`, `insert.js`, `util.js` | Hub-Verbindung, Einfügen in AI Studio, Hilfsfunktionen |
| `extension/lib/prompt-builder.js` | baut System Instruction, Prompt und Folge-Prompts (ohne KI, nach festen Regeln) |
| `extension/lib/templates.js` | Baustein-Bibliothek (HTML/CSS/JS im MuDiKo-Design) |
| `extension/preview.html`, `preview.js` | isolierte Vorschau der Bausteine (Sandbox, ohne Extension-Rechte) |
| `extension/background.js` | erkennt AI-Studio-Downloads, Diagnose-Protokoll |
| `extension/capture-main.js`, `capture-bridge.js` | übernehmen die ZIP aus der AI-Studio-Seite |
| `extension/studio-helper.js`, `content-toast.js` | Einfügen in AI Studio, Hinweise unten rechts |
| `extension/lib/hub-client.js`, `zip-reader.js`, `downloads.js` | Hub-API, `metadata.json` lesen, Downloads erkennen |

Berechtigungen: `sidePanel`, `storage`, `downloads`. Zugriff auf `localhost`, `music.ifib.eu` und AI Studio. Andere Hub-Adressen werden beim Speichern einzeln erfragt.

## Entwicklung

Kein Build-Schritt: Die Dateien in `extension/` werden direkt geladen.

```powershell
npm test   # Node 22: ZIP lesen, Hub-API, Download-Erkennung, Generator, Bausteine
```

Die Test-ZIPs in `tests/fixtures/` erzeugt `python tests/fixtures/make_fixtures.py`.

## Grenzen des Prototyps

- Der Generator arbeitet mit festen Textbausteinen, nicht mit einer KI. Das ist kostenlos und braucht keinen API-Schlüssel.
- Einreichen geht ohne Anmeldung. Der Hub nimmt ohne Anmeldung höchstens 10 Projekte pro 10 Minuten an.
- Remix gibt es nur für Apps, die über die Warteliste deployt wurden (nur dort speichert der Hub den Quellcode), und erst, wenn ein Admin ihn für die App einschaltet. Apps mit gefundenen Schlüsseln im Code lassen sich nicht einschalten.
- Ändert Google AI Studio seine Seite, kann das automatische Einfügen oder die ZIP-Übernahme ausfallen. Kopieren und Hineinziehen funktionieren immer.
