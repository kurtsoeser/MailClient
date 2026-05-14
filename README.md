# MailClient

Schlanker, lokaler Mail-Workflow-Client für Windows 11 für Microsoft-365-Power-User mit mehreren Konten und Gmail. Verwandelt Mails in klare nächste Aktionen, statt sie nur zu verwalten.

> **Status:** Funktionsfähige App mit Multi-Account-Sync (Microsoft Graph + Gmail), lokaler SQLite-Datenhaltung, Kalender (Microsoft + Google), Workflow-Board, Regeln, Chat-Modul (u. a. Teams, eingebettete Webviews) und erweiterter Mail-Oberfläche (ToDo, Snooze, Waiting-for, QuickSteps, virtuelle Liste). IPC-Handler im Main-Prozess sind in `src/main/ipc/` nach Themen aufgeteilt.

## Tech-Stack

- Electron 33 (Main + Preload + Renderer)
- React 18 + TypeScript
- Vite via `electron-vite`
- TailwindCSS + shadcn/ui Patterns + Radix Primitives + lucide-react Icons
- Zustand für State
- Listen-Virtualisierung mit **react-virtuoso** (Mail- und Triagelisten)
- electron-builder für den Windows-Installer (NSIS)

## Voraussetzungen

- Node.js >= 20 (getestet mit 22)
- Windows 11

## Setup

```powershell
npm install
```

## Entwicklung

Startet Vite (Renderer) und Electron mit Hot-Module-Reload:

```powershell
npm run dev
```

## Build

Erzeugt ein Windows-Setup unter `release/<version>/`:

```powershell
npm run build:win
```

## OAuth für Endnutzer und Unternehmen

Für **öffentliche Verteilung** trägt der **Herausgeber** die Azure-App-Registrierung und das Google-Cloud-Projekt **einmal** ein — Endnutzer sehen nur den **Ersteinrichtungs-Assistenten** und die **Browser-Anmeldung** (Zustimmung zu den Scopes). Technische Client-IDs können per **Build-Umgebung** (`MAILCLIENT_*`) oder optional per **HTTPS-JSON** (`MAILCLIENT_REMOTE_OAUTH_CONFIG_URL`) bereitgestellt werden. Vorlage: [.env.example](.env.example).

- **Microsoft 365:** Wenn euer Mandant **Nutzerzustimmung** für Apps verbietet, muss ein **Tenant-Admin** einmalig Admin-Zustimmung erteilen. Platzhalter (eure Application-ID und eine registrierte Redirect-URI der App einsetzen):

  `https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=<APPLICATION_CLIENT_ID>&redirect_uri=<URL_ENCODED_REDIRECT_URI>`

  Redirect-URI muss exakt zu eurer Azure-App-Registrierung passen (wie im Code für den Loopback-Flow verwendet).

- **Google Workspace:** Administratoren können den Zugriff auf nicht verifizierte OAuth-Clients einschränken. Für Gmail-/Kalender-Scopes ist bei **öffentlicher Nutzung** meist die **Google OAuth-Verifizierung** nötig; bis dahin nur Testnutzer in der Google Cloud Console.

Eigene Azure-/Google-Registrierungen bleiben unter **Einstellungen → Allgemein → «Eigene OAuth-App»** möglich (lokale Überschreibung der Build-Defaults).

Schritt-für-Schritt (inkl. App-Name, Verifizierung, Redirect): [docs/google-oauth-oeffentlich.md](./docs/google-oauth-oeffentlich.md).

## Tests

Unit-Tests (Vitest; `sanitize`-Tests mit jsdom) für reine Hilfslogik in `src/renderer/src/lib/`:

```powershell
npm run test
```

Beobachtungsmodus:

```powershell
npm run test:watch
```

## Projektstruktur

```
src/
  main/           Electron Main (DB, Sync, Graph/Gmail, IPC)
    ipc/          IPC-Registrierung nach Bereich (Mail, Kalender, Auth, …)
    lib/          Kleine Main-Helfer (z. B. kooperatives Scheduling)
  preload/        Sichere IPC-Brücke (contextIsolation)
  renderer/       React-UI (Modi: Home, Mail, Workflow, Kalender, Regeln, Chat)
    src/
      app/        Layout, Kalender, Workflow, Regeln, Chat, Home
      components/ Wiederverwendbare UI-Komponenten
      stores/     Zustand-Stores
      lib/        Utilities, Shortcuts, …
      styles/     Globales CSS (Theme-Tokens)
  shared/         Geteilte Typen und IPC-Konstanten (Main, Preload, Renderer)
```

## Konzept & Roadmap

Ausführliches Produktkonzept und Zielbild: [.cursor/plans/mailclient_konzept_skizze_2f302c68.plan.md](./.cursor/plans/mailclient_konzept_skizze_2f302c68.plan.md) (Vision, Sicherheit, Performance; teils noch Zukunftsmusik, z. B. Utility-Process für Sync).

Kurzfassung der Plan-Phasen im Dokument:

- **MVP 1 – Power Inbox:** Multi-Account-Sync, lokale Suche, Senden
- **MVP 2 – Action Inbox:** QuickSteps, ToDo, Snooze, Waiting-for, Templates
- **MVP 3 – Workflow & Calendar:** UI-Modi, Kanban, Compose, Kalender, Teams
- **Post-MVP:** Rule-Engine, AI-Layer
