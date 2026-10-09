# MuDiKo Musik Hub – Projektkontext

Übergabe-Dokument für neue Chats/Agenten. Stand: 2026-10-04, Branch `feature/app-hub-poc` (letzter Commit `02c2ab5`).
Es beschreibt, was das Projekt ist, wie es aufgebaut ist, welche Entscheidungen getroffen wurden und was offen ist.
Detaillierte Betriebsdoku: [`docs/APP_HUB_POC.md`](APP_HUB_POC.md) und [`README.md`](../README.md).

## 1. Worum es geht

**MuDiKo** ist ein Musik-Hub für den Musikunterricht: eine Weboberfläche, die mehrere Musik-Apps unter einem Dach bündelt.

- **Hauptzweck:** Apps, die in **Google AI Studio** gebaut wurden, auf dem eigenen Server bereitstellen und im Hub als Kacheln anzeigen.
- **Workflow:** App in AI Studio bauen → aus AI Studio nach **GitHub syncen** (oder als ZIP exportieren) → im MuDiKo-Admin-Bereich Repo wählen → MuDiKo baut und startet die App als **eigenen Docker-Container** → Kachel erscheint im Hub, die App öffnet sich in einem iframe.
- **Unterstützt:** nur **React + Vite mit npm** (das, was AI Studio exportiert), zusätzlich einfache Node-Apps mit `start`-Skript.
- **Keine API-Keys:** Die deployten Apps brauchen keinen Gemini-Key. AI-Studio-Vorlagen listen zwar `@google/genai` als Abhängigkeit, nutzen sie aber oft gar nicht. Key-Injektion oder -Proxy sind bewusst **nicht** geplant.
- Zusätzlich gibt es den **KI-Assistenten** (älteres Kernprodukt): erzeugt aus Audio-/MIDI-Uploads Prompts für LLM-Feedback an Schüler. Er ist jetzt nur noch eine App im Hub („self hosted“).

Repo: `https://github.com/hparkifib/MuDiKo_KI_Assistant` (Default-Branch `main`; die gesamte Hub-Arbeit liegt auf `feature/app-hub-poc`, noch nicht nach `main` gemerged).
Produktion (geplant): `https://music.ifib.eu` hinter Caddy.

## 2. Aufbau

```
MuDiKo_KI_Assistant/
├── Hub/                          ← Musik Hub = Infrastruktur
│   ├── Backend/                    Flask: App Registry, Admin-Login, Deployments, GitHub (kein librosa/tensorflow)
│   └── Frontend/                   React 19 + Vite (rolldown-vite): Startseite, Apps, Admin – UND vorerst die Seiten des KI-Assistenten
├── Apps/
│   └── ki-assistant/Backend/     ← KI-Assistent: Flask-Plugins, Sessions, Audio-Analyse (librosa, basic-pitch, tensorflow)
├── docker-compose.dev.yml        ← lokale Entwicklung
├── docker-compose.yml            ← Produktion (mit Caddy)
├── Caddyfile                     ← HTTPS + Aufteilung der /api-Routen
└── docs/APP_HUB_POC.md           ← ausführliche Hub-Doku (Englisch)
```

### Container (Dev)

| Service / Container | Aufgabe | Host-Port |
|---|---|---|
| `hub-frontend` / `mudiko-hub-frontend-dev` | Vite-Dev-Server, eine gemeinsame Oberfläche | 3000 |
| `hub-backend` / `mudiko-hub-backend-dev` | Hub-API, steuert Docker über `/var/run/docker.sock` | 5001 |
| `ki-assistant-backend` / `mudiko-ki-assistant-backend-dev` | API des KI-Assistenten | 5000 |
| `mudiko-app-<slug>-<id>` | je eine deployte AI-Studio-App (nginx, intern 8080) | dynamisch, z. B. 57513 |

Alle hängen im Netzwerk `mudiko-dev-network` (Prod: `mudiko-network`). Die Registry liegt im Volume `mudiko-dev-app-registry-data` (`/workspace/data/apps.json`).

### Routing der API

Es gibt **ein** Frontend; `/api` wird nach Pfad auf die zwei Backends verteilt:

- `/api/admin/*`, `/api/apps*`, `/api/app-hub/*`, `/api/github/*` → **Hub-Backend**
- alle übrigen `/api/*` (`/api/tools`, `/api/session`, `/api/audio`, `/api/plugins`, `/api/health`) → **KI-Assistent**

Dev: Proxy-Regeln in `Hub/Frontend/vite.config.js` (Reihenfolge zählt, Hub-Regex zuerst). Prod: verschachtelte `handle`-Blöcke in der `Caddyfile`.

## 3. Hub-Backend (`Hub/Backend/app`)

| Datei | Aufgabe |
|---|---|
| `core/app_factory.py` | baut die Flask-App, verdrahtet Services, startet Recovery und Auto-Deploy-Polling |
| `core/app_hub_routes.py` | alle HTTP-Routen (Blueprint) inkl. Login, CSRF-Prüfung |
| `core/config.py` | Konfiguration aus Umgebungsvariablen |
| `main.py` | Einstieg; fängt SIGTERM/SIGINT/SIGUSR1 ab und stoppt dabei alle verwalteten App-Container |
| `shared/services/deployment_job_service.py` | Deployment-Jobs (ZIP, GitHub, Rollback), Auto-Deploy, Dashboard-Daten |
| `shared/services/docker_deployment_service.py` | Image-Build, Container-Start, Health-Check, Label-geprüftes Stoppen/Löschen |
| `shared/services/project_analyzer.py` | sicheres ZIP-Entpacken, Erkennung React+Vite / Node, lehnt alles andere ab |
| `shared/services/app_registry_service.py` | JSON-Registry (`apps.json`), Historie, Thumbnails, Tags |
| `shared/services/github_app_service.py` | GitHub App: Installationen, Repos, Branches, Archive (Installations-Tokens) |
| `shared/services/github_login_service.py` | „Mit GitHub anmelden“ (OAuth-Web-Flow), liefert nur `{login, id}` |
| `shared/services/admin_auth_service.py` | Whitelist, Sessions im Speicher, CSRF, einmaliger OAuth-`state` |

**Deployment-Pipeline:** ZIP oder GitHub-Archiv → sicher entpacken (Zip-Slip, Symlinks, Größenlimits) → analysieren → eigenes Dockerfile-Template (Node 20 baut `npm run build`, `nginx-unprivileged` liefert `dist/` auf 8080 aus; `npm ci/install --legacy-peer-deps`) → Kandidat-Container starten (read-only, `cap_drop ALL`, 512 MB, 1 CPU, keine Secrets, kein Docker-Socket) → HTTP-Health-Check über das interne Netz → erst dann in die Registry. Bei Updates bleibt die alte Version aktiv, bis die neue gesund ist.
Job-Schritte (`steps[].key`): `upload, extract, analyze, compatibility, build, start, health, register, finished`.

**Registry-Eintrag** (Auszug): `id, name, slug, description, type ("internal" | "external"), hosting ("self" | "ai-studio"), url, internalRoute, status, tags, thumbnailUrl` plus Admin-Felder (Container/Image-IDs, Repository, Branch, Commit, `autoDeploy`, `deploymentHistory` ≤ 50). Admin-Felder werden ohne Login aus `/api/apps` herausgefiltert.
`hosting` unterscheidet selbst gehostete Apps (KI-Assistent, eigene Compose-Services) von AI-Studio-Apps aus der Pipeline. Es wird in der UI noch nicht angezeigt.

**Weitere Funktionen:** Auto-Deploy (Polling alle 30 s, optional Webhook `/api/github/webhook` mit HMAC), Abbrechen laufender Builds, Rollback auf gespeicherte Images (max. 10 pro App), Wiederherstellen aller App-Container beim Start.

## 4. Admin-Login (GitHub + Whitelist)

Es gibt **kein Passwort** mehr.

1. Frontend navigiert zu `GET /api/admin/auth/github/login` → Backend setzt einen einmaligen `state` (Cookie `mudiko_github_login_state`, HttpOnly, SameSite=Lax, Path `/api/admin/auth/github`) und leitet zu GitHub weiter (ohne Scope).
2. GitHub leitet zurück auf `<APP_HUB_PUBLIC_URL>/api/admin/auth/github/callback` → Backend prüft `state`, tauscht den Code gegen die Identität, vergleicht den Login mit `APP_HUB_ADMIN_GITHUB_USERS` (Groß-/Kleinschreibung egal).
3. Treffer → Session-Cookie `mudiko_admin_session` (HttpOnly, **SameSite=Strict**, Path `/api`), Redirect auf `/admin`. Sonst Redirect auf `/admin/login?error=not_allowed|expired|denied|failed|not_configured`.
4. Alle ändernden Admin-Requests brauchen zusätzlich den Header `X-CSRF-Token` (Wert aus `GET /api/admin/session` → `csrfToken`).

Sessions und Jobs liegen **nur im Speicher** – nach einem Neustart des Hub-Backends ist man abgemeldet.

**Zwei verschiedene GitHub-Apps (wichtig):**

- **GitHub App `mudiko-app-hub-david`** (privat, Besitzer `DavidChengIfib`): für Repos, Branches, Archive und Deployments. Rechte: Contents read, Metadata read.
- **GitHub OAuth App** (Account `DavidChengIfib`, Callback `http://localhost:3000/api/admin/auth/github/callback`): nur für den Login. Grund: Eine *private* GitHub App darf nur ihr Besitzer autorisieren, andere Whitelist-Admins wurden bei GitHub abgewiesen. Die GitHub App öffentlich zu machen wurde verworfen (dann könnte jeder sie installieren und seine Repos tauchen im Admin auf).

Whitelist aktuell: `DavidChengIfib`, `DavidCheng1` (in der lokalen `.env`).

## 5. API des Hubs (Kurzreferenz)

Öffentlich: `POST /api/app-hub/submissions` (ZIP in die **Warteliste**, ohne Anmeldung, Limit 10 pro 10 Minuten, optional `submitterName`), `GET /api/app-hub/remix` und `GET /api/app-hub/remix/<slug>/download` (Remix: nur Apps, für die ein Admin Remix eingeschaltet hat), `GET /api/apps`, `GET /api/apps/<slug>/thumbnail`, `GET /api/app-hub/status`, `GET /api/admin/session`, Login-Routen, `POST /api/github/webhook` (HMAC-signiert).

Admin (Session-Cookie; alle POST/PATCH/DELETE zusätzlich `X-CSRF-Token`):

| Methode & Pfad | Zweck |
|---|---|
| `POST /api/admin/logout` | abmelden |
| `GET /api/admin/dashboard` | Status aller Apps (Docker, Health, Version) |
| `POST /api/app-hub/deployments` | ZIP-Deployment, multipart: `name`, `description`, `tags` (JSON-String), `projectZip`, optional `thumbnail` → 202 `{deploymentJobId}` |
| `GET /api/admin/submissions` · `/<id>` · `/<id>/download` | Warteliste, Detail mit automatischer Prüfung, Original-ZIP |
| `POST /api/admin/submissions/<id>/deploy` · `DELETE /api/admin/submissions/<id>` | Deployen (JSON `{"confirmed": true}` nötig) · Abweisen/Entfernen |
| `GET` · `PATCH /api/admin/apps/<slug>/remix` | Remix pro App anzeigen / ein- und ausschalten (`{"enabled": true}`; 404 ohne Quellcode, 409 wenn wegen Schlüssel gesperrt) |
| `GET /api/app-hub/deployments/<jobId>` | Job-Status pollen (Frontend: alle ~1,5 s) |
| `POST /api/admin/deployments/<jobId>/cancel` | Build abbrechen |
| `GET /api/admin/github/status` · `/repositories` · `/repositories/<owner>/<repo>/branches` | GitHub-Verbindung und Repo-Auswahl |
| `POST /api/admin/github/connect` · `/installation` | GitHub App installieren/verknüpfen |
| `POST /api/admin/github/import` | neues Deployment aus Repo, JSON: `name, description, repository, branch, autoDeploy, tags` |
| `GET /api/admin/apps/<slug>` | Detail inkl. Historie |
| `PATCH /api/admin/apps/<slug>/github` · `/auto-deploy` | Repo-Mapping, Auto-Deploy an/aus |
| `POST /api/admin/apps/<slug>/check-updates` · `/deploy-latest` · `/start` · `/stop` · `/rollback` | Betrieb |
| `PATCH /api/apps/<slug>` | Name, Beschreibung, Tags |
| `DELETE /api/apps/<slug>/deployment` | Container, Images und Kachel löschen |

CORS ist auf `CORS_ORIGINS` beschränkt (Default `http://localhost:5173,http://localhost:3000`).

## 6. Frontend (`Hub/Frontend/src`)

- Kein React Router: `App.jsx` wertet `window.location.pathname` selbst aus.
- Routen: `/` (Startseite), `/apps` (Kacheln, Suche, Tag-Filter), `/apps/<slug>` (App im sandboxed iframe), `/apps/ki-assistant` (Seiten des KI-Assistenten nativ, kein iframe), `/admin/login`, `/admin` (Dashboard), `/admin/apps/<slug>`, `/admin/github/import`, `/apps/admin/import` (ZIP).
- Hub-Seiten: `pages/apps/*.jsx`; API-Helfer mit Tests: `apps/*.js` (`node --test`).
- Styling: Inline-Styles und `styles/commonStyles.js`, CSS-Variablen in `index.css` (dunkles Design, `--mudiko-cyan`, `--mudiko-gradient`).

## 7. KI-Assistent

- Backend `Apps/ki-assistant/Backend` ist inhaltlich der Stand von `main` vor dem Hub (bewusst unverändert).
- Plugins: `audio_feedback`, `midi_comparison`, `mp3_to_midi_feedback`, `easy_feedback` – aktiv ist nur **`easy_feedback`** („KI Feedback Leichtgemacht“), die anderen haben `enabled: false` (so auch auf `main`).
- Seine Frontend-Seiten liegen noch in `Hub/Frontend/src/pages/{common,audio-feedback,easy-feedback,…}`. Ein späteres Herauslösen (eigener Container, „großes Fenster“ im Hub) ist angedacht, braucht aber eine eigene Adresse und wurde zurückgestellt, damit sich das Frontend nicht sichtbar ändert.

## 8. Konfiguration (`.env` im Repo-Root, gitignored – Werte nie committen)

Hub: `APP_HUB_ADMIN_GITHUB_USERS`, `APP_HUB_PUBLIC_URL`, `GITHUB_LOGIN_CLIENT_ID`, `GITHUB_LOGIN_CLIENT_SECRET`, `APP_HUB_ADMIN_SESSION_TTL_SECONDS`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_AUTO_DEPLOY_POLL_SECONDS`, `GITHUB_TOKEN` (Legacy-Fallback), `MAX_APP_ZIP_UPLOAD_BYTES`, `MAX_APP_EXTRACTED_BYTES`, `APP_RUNTIME_HOST`, `APP_HEALTH_TIMEOUT_SECONDS`, `APP_ROLLBACK_IMAGE_LIMIT`.
Allgemein/KI-Assistent: `SECRET_KEY`, `CORS_ORIGINS`, `SESSION_TTL_SECONDS`, `GC_INTERVAL_SECONDS`, `MAX_CONTENT_LENGTH`.
Vorlage mit Erklärungen: `.env.example`. Veraltet und ignoriert: `APP_HUB_ADMIN_PASSWORD`, `APP_HUB_ADMIN_TOKEN`.

## 9. Arbeiten am Projekt

```powershell
docker compose -f docker-compose.dev.yml up -d --build                     # starten / neu bauen
docker compose -f docker-compose.dev.yml up -d --force-recreate hub-backend # nach .env-Änderungen
docker compose -f docker-compose.dev.yml logs -f hub-backend
docker ps --filter "label=mudiko.managed=true"                             # deployte Apps
```

Tests:
- Hub-Backend (läuft lokal, nur `flask flask-cors docker PyJWT[crypto]` nötig): `cd Hub/Backend; python -m unittest discover -s tests -t .` → 87 Tests
- Frontend: `cd Hub/Frontend; npm test` → 24 Tests
- KI-Assistent-Backend nur im Container (braucht librosa/tensorflow).

**Stolperfallen auf diesem Windows-Rechner:**
- Lokales `npm run build` scheitert (rolldown-Native-Binding für Windows fehlt) → im Container bauen: `docker exec mudiko-hub-frontend-dev npx vite build --outDir /tmp/x`.
- Docker Desktop leitet Datei-Events nicht in Container weiter → Vite nutzt deshalb `watch.usePolling`.
- Ordner, die als Bind-Mount in laufenden Containern hängen, nicht verschieben, ohne die Container danach neu zu erstellen (sonst „keine Tools verfügbar“, fehlende Bilder).
- Git Bash wandelt Pfade in `docker exec … /pfad` um → `MSYS_NO_PATHCONV=1` setzen. Konsole ist cp932 → bei Python-Ausgaben `PYTHONIOENCODING=utf-8`.

## 10. Arbeitsweise und Vorlieben des Nutzers

- Kommunikation auf **Deutsch**; der Nutzer ist kein Infrastruktur-Experte → Optionen mit klarer Empfehlung, wenig Fachjargon.
- **Möglichst wenig Risiko:** bestehende Logik nicht umbauen, Frontend soll für Nutzer gleich aussehen, Änderungen schrittweise.
- Größere Schritte als **eigene Commits**; vor Commits/Push fragen. Bisherige Commit-Nachrichten: Englisch, Conventional-Commits-Stil (`feat:`, `fix:`, `refactor:`).
- Secrets nie in Logs/Ausgaben anzeigen; `.env` nur gezielt per Schlüssel ändern.

## 11. Offene Punkte

- Branch `feature/app-hub-poc` ist gepusht, aber **nicht nach `main` gemerged** (kein PR).
- Produktion noch nicht eingerichtet: zweite OAuth App mit `https://music.ifib.eu/api/admin/auth/github/callback`, `APP_HUB_PUBLIC_URL=https://music.ifib.eu`, Callback-URL in der GitHub App.
- Deployte Apps laufen auf **dynamischen Host-Ports** (`http://localhost:<port>`), die sich bei jedem Neustart/Deploy ändern → für Produktion fehlt stabiles Routing (Subdomain oder Pfad pro App).
- AI-Studio-Exporte enthalten oft `bun.lock` statt `package-lock.json` → Build mit `npm install`, Abhängigkeiten werden bei jedem Deploy neu aufgelöst (nicht exakt reproduzierbar).
- Doku-Widerspruch: `docs/APP_HUB_POC.md` sagt im Abschnitt „Admin deployment dashboard“ noch „Rollback remains disabled“, Rollback ist aber implementiert.
- Testfixture `pitch-piano---tonhöhen-erkennung.zip` liegt eingecheckt im Repo-Root.

## 12. Hinweise für eine Browser-Extension (neues Projekt)

Die Extension wird in einem **separaten Projekt** gebaut. Falls sie mit dem Hub sprechen soll (z. B. aus AI Studio heraus deployen), sind das die Berührungspunkte – noch **nicht geprüft oder vorbereitet**:

- Alle Admin-Aktionen hängen am Cookie `mudiko_admin_session` (SameSite=Strict, Path `/api`) plus `X-CSRF-Token`. Ob und wie eine Extension diese Session mitnutzen kann (Host-Permissions, Cookies aus dem Extension-Kontext), muss geklärt werden; evtl. braucht es einen eigenen, tokenbasierten Zugang.
- CORS erlaubt derzeit nur die MuDiKo-Origins; eine `chrome-extension://<id>`-Origin müsste gezielt ergänzt werden.
- Passende Endpunkte: `POST /api/app-hub/deployments` (ZIP), `POST /api/admin/github/import` (Repo), Job-Status per `GET /api/app-hub/deployments/<jobId>`, App-Liste per `GET /api/apps`.
- **Stand 2026-10-08:** Die Extension sendet ZIPs **ohne Anmeldung** an `POST /api/app-hub/submissions`. Sie landen in der Warteliste (`/admin/submissions`, Daten unter `/workspace/data/submissions`) und werden erst nach Freigabe durch einen Admin mit zweiter Bestätigung deployt. Details: `docs/APP_HUB_POC.md`, Abschnitt „Waiting list for submitted ZIPs“.
- **Extension 0.2 (Stand 2026-10-09):** Seitenleiste mit den Bereichen Hochladen, AI Studio (Generator für System Instruction und Prompts, Bausteine, Remix) und Einstellungen. Remix-Quellcode speichert der Hub nach einem Deployment aus der Warteliste (`/workspace/data/remix`, ohne `.env`, mit Schlüssel-Scan). Ein Admin schaltet Remix **pro App** in den App-Details ein (Standard: aus); nur eingeschaltete Apps erscheinen in der Extension zum Download. Details: `docs/APP_HUB_POC.md`, Abschnitt „Remix“.
- Deployt werden ausschließlich React+Vite/npm-Projekte; die Prüfung macht der Hub (`project_analyzer.py`), nicht der Client.
