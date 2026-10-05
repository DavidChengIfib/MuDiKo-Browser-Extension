# MuDiKo Browser-Extension (Prototyp)

Erster Prototyp für Edge und Chrome: Ein Projekt, das in **Google AI Studio** als ZIP heruntergeladen wird, landet ohne Umweg im **Deployment-Bereich des MuDiKo Musik Hubs**.

```
AI Studio → „Download ZIP“ → Extension übernimmt die ZIP automatisch
→ Seitenleiste: Name und Beschreibung sind schon ausgefüllt, Tags wählen → „An MuDiKo senden“
→ Fortschritt (Entpacken, Prüfen, Bauen, Starten) → Kachel erscheint im Hub
```

Der Hub wird dafür **nicht verändert**. Die Extension nutzt dieselben Schnittstellen wie die Seite „Neue App hinzufügen“ im Admin-Bereich.

## Installieren

Die Extension ist eine normale Chrome-Extension (Manifest V3, ab Chrome 116). Edge nutzt dieselbe Technik, deshalb läuft sie dort unverändert.

1. Hub lokal starten (im Hub-Repo): `docker compose -f docker-compose.dev.yml up -d`
2. Chrome: `chrome://extensions` öffnen (Edge: `edge://extensions`).
3. **Entwicklermodus** einschalten.
4. **Entpackte Erweiterung laden** und den Ordner `extension/` auswählen (nicht den Projektordner).
5. Das MuDiKo-Symbol in der Symbolleiste anheften. Ein Klick darauf öffnet die Seitenleiste.

Nach jeder Code-Änderung auf der Erweiterungsseite auf „Neu laden“ klicken. **Danach bereits offene AI-Studio-Tabs neu laden**, sonst ist dort die ZIP-Erkennung nicht aktiv.

Standard-Adresse des Hubs ist `http://localhost:3000`. Über „Ändern“ in der Seitenleiste lässt sich eine andere Adresse eintragen, z. B. `https://music.ifib.eu`.

## Was getestet werden soll

### Test 1: Funktioniert der Hub-Login aus der Extension heraus?

1. In der Seitenleiste auf **Im Hub anmelden** klicken und mit einem freigeschalteten GitHub-Konto anmelden.
2. Zurück in der Seitenleiste muss nach kurzer Zeit **„Angemeldet als @…“** stehen (grüner Punkt).

- Klappt das, kann die Extension die bestehende Admin-Anmeldung mitnutzen. Am Hub ist nichts zu ändern.
- Steht dort „Nicht im Hub angemeldet“ mit dem Hinweis, dass ein Login-Cookie vorhanden ist, schickt der Browser das Cookie nicht mit. Dann braucht der Hub eine kleine Anpassung.

### Test 2: Wird der AI-Studio-Download automatisch übernommen?

1. Ein Projekt in AI Studio öffnen und über AI Studio als ZIP herunterladen.
2. Unten rechts auf der AI-Studio-Seite erscheint **„MuDiKo: ZIP übernommen“**, und am MuDiKo-Symbol erscheint eine **1**.
3. In der Seitenleiste ist die ZIP eingetragen, Name und Beschreibung sind ausgefüllt.
4. Tags wählen, **An MuDiKo senden**, den Fortschritt abwarten und dann **App öffnen**.

Klappt die automatische Übernahme nicht, die heruntergeladene ZIP einfach in das Feld „ZIP hier ablegen“ ziehen. Das funktioniert immer.

### Diagnose

Unten in der Seitenleiste unter **„Diagnose für den Test“** steht jeder Schritt: Login-Prüfung, erkannte Downloads, Übernahme, Upload. Wenn etwas nicht klappt: **Kopieren** und den Text weitergeben. Gespeichert wird dort nur Dateiname, Herkunft (Adresse ohne Pfad) und Ergebnis, keine Inhalte. Die Liste wird beim Schließen des Browsers gelöscht.

## Wie die automatische Übernahme funktioniert

AI Studio baut die Export-ZIP im Browser und lädt sie über einen `blob:`-Link herunter. Eine Extension darf heruntergeladene Dateien nicht von der Festplatte lesen, deshalb:

1. `capture-main.js` läuft in der AI-Studio-Seite und merkt sich jede ZIP, die die Seite erzeugt.
2. `background.js` sieht, dass ein ZIP-Download von AI Studio fertig ist, und holt sich genau diese ZIP über `capture-bridge.js` aus dem Tab.
3. Die Seitenleiste (`sidepanel.js`) lädt die ZIP und liest Name und Beschreibung aus der `metadata.json`, die jede AI-Studio-ZIP enthält.

Hochgeladen wird erst, wenn man auf „An MuDiKo senden“ klickt.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `extension/manifest.json` | Berechtigungen, Seitenleiste, Skripte für AI Studio |
| `extension/background.js` | erkennt AI-Studio-Downloads, hält die ZIP bereit, führt das Diagnose-Protokoll |
| `extension/capture-main.js`, `capture-bridge.js` | merken sich die ZIP in der AI-Studio-Seite, zeigen den Hinweis unten rechts |
| `extension/sidepanel.*` | Seitenleiste: Hub-Verbindung, Formular, Upload, Fortschritt |
| `extension/lib/hub-client.js` | Hub-API: Anmeldung, Status, App-Liste, Deployment starten und abfragen |
| `extension/lib/zip-reader.js` | liest `metadata.json` aus der ZIP (ohne Fremdbibliothek) |
| `extension/lib/downloads.js` | erkennt, ob ein Download eine AI-Studio-ZIP ist |

Berechtigungen: `sidePanel`, `storage`, `downloads` (Downloads erkennen), `cookies` (nur für die Login-Diagnose). Zugriff auf `localhost`, `music.ifib.eu` und AI Studio. Andere Hub-Adressen werden beim Speichern einzeln erfragt.

## Entwicklung

Kein Build-Schritt: Die Dateien in `extension/` werden direkt geladen.

```powershell
npm test   # 17 Tests: ZIP lesen, Hub-API, Download-Erkennung (Node 22)
```

Die Test-ZIPs in `tests/fixtures/` erzeugt `python tests/fixtures/make_fixtures.py`.

## Grenzen des Prototyps

- Hochladen dürfen nur die Admins auf der Whitelist des Hubs (wie im Admin-Bereich).
- Ein App-Bild (Thumbnail) kann noch nicht mitgeschickt werden. Das geht weiterhin im Hub.
- Wird die Seitenleiste während des Builds geschlossen, läuft das Deployment im Hub weiter. Der Fortschritt ist dann nur im Admin-Dashboard zu sehen.
- Die automatische Übernahme hängt davon ab, dass AI Studio die ZIP weiterhin im Browser erzeugt. Ändert Google das, bleibt das Hineinziehen der ZIP.
