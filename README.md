# MailClient

**Schlanker, lokaler Mail- und Arbeitsplatz-Client für Windows 11** — gebaut für Menschen, die mit **mehreren Konten** (Microsoft 365 und Gmail) arbeiten und E-Mail nicht nur lesen, sondern in **klare nächste Schritte** verwandeln wollen: ToDos, Snooze, Wiedervorlage, QuickSteps, Workflow-Board und Regeln — alles mit **lokaler SQLite-Datenhaltung** und **Volltextsuche** auf deinem Rechner.

> **Status:** Funktionsfähige Desktop-App (Electron). Multi-Account-Synchronisation über **Microsoft Graph** und **Google (Gmail / Kalender / Kontakte / Tasks)**. Siehe auch Abschnitt [Status & Roadmap](#status--roadmap).

---

## Inhaltsverzeichnis

- [Warum MailClient?](#warum-mailclient)
- [Was die App kann — Überblick](#was-die-app-kann--überblick)
- [Die Module im Detail](#die-module-im-detail)
- [Mail-Workflow: Besonderheiten](#mail-workflow-besonderheiten)
- [Kalender, Aufgaben, Personen, Notizen](#kalender-aufgaben-personen-notizen)
- [Regeln & Automatisierung](#regeln--automatisierung)
- [Chat & eingebettete Dienste](#chat--eingebettete-dienste)
- [Datenschutz, Sicherheit, lokale Daten](#datenschutz-sicherheit-lokale-daten)
- [Warum eine Alternative zu Outlook, Web & Co.?](#warum-eine-alternative-zu-outlook-web--co)
- [Tech-Stack](#tech-stack)
- [Voraussetzungen](#voraussetzungen)
- [Setup & Entwicklung](#setup--entwicklung)
- [Build (Windows-Installer)](#build-windows-installer)
- [OAuth für Endnutzer und Unternehmen](#oauth-für-endnutzer-und-unternehmen)
- [Tests](#tests)
- [Projektstruktur](#projektstruktur)
- [Konzept & Roadmap](#konzept--roadmap)
- [Lizenz](#lizenz)

---

## Warum MailClient?

Klassische Mail-Clients zeigen Listen. **MailClient** ist auf einen **Handlungs-Workflow** ausgelegt: Posteingang entlasten, Prioritäten setzen, Mails mit Fälligkeiten und ToDos verknüpfen, wiederkehrende Aktionen als **QuickSteps** speichern und optional ein **Kanban-ähnliches Workflow-Board** nutzen — in einem **einheitlichen Fenster** neben **Kalender**, **Aufgaben**, **Kontakten**, **Notizen** und einem **Chat-/Teams-Bereich**.

Typische Zielgruppe:

- **Power-User** mit Microsoft 365 und/oder Gmail  
- **Mehrere Postfächer** (beruflich/privat) in einer Oberfläche  
- Wunsch nach **schneller lokaler Suche** und **offline-orientierter** Datenhaltung (Cache + DB), ohne auf moderne UI zu verzichten  

---

## Was die App kann — Überblick

| Bereich | Kurzbeschreibung |
|--------|-------------------|
| **Konten** | Mehrere Konten; Anbieter **Microsoft 365** (Graph) und **Google** (Gmail & zugehörige APIs). Ersteinrichtungs-Assistent, Konto-Einstellungen inkl. optionaler **eigener OAuth-App**. |
| **Mail** | Ordner, Threads, Lesepane, **virtualisierte** Listen (große Postfächer), Suche (inkl. **FTS5**), Entwürfe, **Rich-Text-Compose** (TipTap), Anhänge, Kategorien (Outlook), Snooze, „Waiting for“, Mail-ToDos, Archivieren, Verschieben, **Rückgängig**-Pfad über Nachrichtenaktionen. |
| **Workflow** | **Workflow-Board** mit Spalten (Posteingang, überfällige/offene ToDos nach Fälligkeit, Heute/Morgen/Woche/Später, Erledigt) und Verknüpfung mit **QuickSteps**; Drag-and-Drop; pro Konto konfigurierbare **Workflow-Mail-Ordner** (z. B. „In Bearbeitung“ / „Erledigt“). |
| **Kalender** | Kalenderansichten für **Microsoft**- und **Google**-Kalender; Terminbearbeitung in der UI; Anbindung an Mail-ToDos / Kalender-Kontext (siehe Schema & UI). |
| **Aufgaben** | **Microsoft To Do** (Graph **todo**-Tasklisten) und **Google Tasks** — zentraler Aufgaben-Modus. |
| **Personen** | Kontakte synchronisieren und lokal cachen; Detailansicht; Fotos über Graph/Google wo verfügbar. |
| **Notizen** | Notizen zu **Mails**, zu **Kalenderterminen** und **freistehende** Notizen (Markdown-/Editor-Komponenten). |
| **Regeln** | **Visuelle Regel-Engine**: Bedingungen (Absender, Betreff, Body, Anhänge, List-Id, Ordner, …) und Aktionen (verschieben, Tags, gelesen/markiert, ToDo, Snooze, weiterleiten, …); Trigger u. a. **bei Eingang** und **manuell**. |
| **Chat** | Chat-Oberfläche mit **Microsoft Teams**-Integration (u. a. eingebettete Webviews / Graph-Anbindung je nach Kontext). |
| **Home-Dashboard** | Startseite mit **Kacheln** (Wetter, Uhr, Mini-Kalender, nächster Termin, Compose-Kachel, benutzerdefinierte Kacheln, …), **Drag-and-Drop**-Layout, Konfiguration. |
| **Sonstiges** | **Theming** (Hell/Dunkel/System), **Akzentfarben**, **DE/EN**-Oberfläche (i18n), **Globale Tastenkürzel**, **Einstellungs-Backup**, **Geplanter Versand** (Warteschlange im Main-Prozess), **List-Unsubscribe**-Felder im Datenmodell, **VIP-Absender**, **Meta-Ordner** (such-/filterbasierte Sammelansichten über Konten hinweg). |

---

## Die Module im Detail

Die App ist in **Modi** gegliedert (obere Leiste; Reihenfolge der Tabs ist anpassbar):

1. **Home** — persönliches Dashboard statt „leerer Start“.  
2. **Mail** — klassischer Arbeitsbereich mit Sidebar (Konten, Ordner, Favoriten), Filter/Tabs und Lesepane.  
3. **Workflow** — Board-Ansicht zur Triaging- und ToDo-Steuerung.  
4. **Kalender** — Multi-Kalender, Woche/Monat/Agenda-orientierte Bedienung (je nach Implementierungsstand der Shell).  
5. **Aufgaben** — zentrale Task-Liste über verbundene Konten.  
6. **Personen** — Kontaktliste und Detailpanel.  
7. **Notizen** — gebündelte Notizen-Verwaltung.  
8. **Regeln** — Editor und Ausführungs-Logik für Mail-Regeln.  
9. **Chat** — Teams-/Chat-Fokus.

Diese Modularität soll **Kontextwechsel** (Mail ↔ Kalender ↔ Tasks) ohne Wechsel des Programms erleichtern.

---

## Mail-Workflow: Besonderheiten

### ToDos, die an Mails hängen

Mails können in **ToDos** überführt werden — inkl. **Fälligkeits-Buckets** (heute, morgen, diese Woche, später, erledigt). Das Datenbankschema unterstützt außerdem **optionale Kalender-Zeiträume** pro ToDo (Start/Ende), sodass Aufgaben und Terminplanung zusammendenken können.

### Snooze & „Waiting for“

- **Snooze:** Mails zeitlich **ausblenden** und zu einem **Wiedervorlage-Zeitpunkt** zurückholen.  
- **Waiting for:** Erinnerung / Frist „auf Antwort warten“ — sinnvoll für Follow-ups ohne die Mail zu verlieren.

### QuickSteps

**QuickSteps** sind **konfigurierbare Aktionsketten** (z. B. „Gelesen & Archiv“, „ToDo Heute“) mit optionalen Tastenkürzeln und Sortierung. Sie lassen sich mit dem Workflow-Board koppeln, um **Ein-Klick-Triage** zu ermöglichen.

### Meta-Ordner

**Meta-Ordner** sind **virtuelle Ordner**: app-weite Such- und Filterkriterien über **alle Konten** — nützlich für projektbezogene oder rollenbasierte Sichten ohne duplizierte Ordner in jedem Konto.

### Regeln, Tags, VIP

- **Tags** auf Nachrichtenebene (lokal verwaltet, Regeln können sie setzen).  
- **VIP-Absender** pro Konto (hervorgehobene oder priorisierte Sicht — je nach UI-Anbindung).  
- **Mail-Regeln** mit Ausführungs-Historie (welche Regel auf welche Nachricht).

### Schreiben & Entwürfe

- **Composer** mit Rich-Text (**TipTap**), Anhängen, Entwurfs-Speicherung.  
- **Vorlagen** mit Variablen (z. B. Platzhalter für Anrede — siehe Template-Logik).  
- **Geplanter Versand:** Nachrichten können für einen späteren Zeitpunkt **eingeplant** werden (Queue im Main-Prozess).

### Performance

Lange Listen werden mit **react-virtuoso** virtualisiert, damit große Ordner flüssig bleiben.

---

## Kalender, Aufgaben, Personen, Notizen

- **Kalender:** Synchronisation über **Microsoft Graph** und **Google Calendar**; Darstellung und Dialoge für Termine in der Renderer-Shell.  
- **Aufgaben:** Kombination aus **Graph-Tasks** und **Google Tasks** im dedizierten Modus.  
- **Personen:** Lokaler **SQLite-Cache** der Kontakte inkl. Sync-Zustand — schnelles Blättern und Suche lokal.  
- **Notizen:** Drei Arten — **zu einer Mail**, **zu einem Kalendertermin** (inkl. Anbieter- und Remote-IDs) und **freistehend**. So bleiben Kontext-Notizen beim Wechseln zwischen Mail und Kalender auffindbar.

---

## Regeln & Automatisierung

Die Regel-Definitionen sind als **JSON** strukturiert (Bedingungsbäume mit UND/ODER, Felder wie Von, An, Betreff, Body, Anhänge, List-Id, Konto, Ordner, Wichtigkeit, Gelesen-Status). **Aktionen** umfassen unter anderem:

- in Ordner **verschieben**  
- **Tag** setzen  
- als gelesen/markiert markieren  
- **ToDo** anlegen  
- **Snooze** (mit Presets)  
- **Weiterleiten**, **Auto-Antwort** (Konzept), **Löschen**, **Stopp** der weiteren Regeln  

Trigger: mindestens **bei Eingang** und **manuell** — sinnvoll für servernahe Logik plus manuelles Nachziehen.

---

## Chat & eingebettete Dienste

Im **Chat-Modul** steht **Microsoft Teams** im Fokus (Chats/Channels über die verfügbaren Graph-/Webview-Pfade). Das ist bewusst **komplementär** zur Mail: schneller Sprung zwischen „Nachricht schreiben“ und „Team-Kanal“, ohne den Browser zu wechseln.

---

## Datenschutz, Sicherheit, lokale Daten

- **Lokale Datenbank (SQLite):** Mails und Metadaten werden **auf dem Gerät** gespeichert; Suche läuft über **FTS5**-Indexe auf dem lokalen Index.  
- **OAuth:** Anmeldung über die offiziellen Microsoft-/Google-Flows; sensible Build-Konfiguration über Umgebungsvariablen (siehe [.env.example](.env.example)).  
- **Electron-Sicherheit:** `contextIsolation`, Preload-IPC-Brücke — keine direkte `nodeIntegration` im Renderer nach gängigem Muster.  
- **Geheimnisse:** `.env` ist **nicht** im Repository; nur `.env.example` als Vorlage.

Für **Unternehmens-Deployments** gelten die üblichen Admin-Fälle (Tenant-Consent bei Microsoft, Google OAuth-Verifizierung bei Workspace) — siehe [OAuth für Endnutzer und Unternehmen](#oauth-für-endnutzer-und-unternehmen).

---

## Warum eine Alternative zu Outlook, Web & Co.?

| Aspekt | MailClient | Typischer Web-Client / Suite |
|--------|------------|------------------------------|
| **Fokus** | Workflow: ToDo, Snooze, Board, QuickSteps, Regeln in **einer** Desktop-Oberfläche | Oft stark listen- oder modul-zentriert (viele Browser-Tabs) |
| **Lokale Suche & Cache** | SQLite + FTS, Daten bleiben **gerätenah** | Abhängig vom Anbieter; oft serverzentrierte Suche |
| **Multi-Account M365 + Google** | **Kombinierbar** in einer App | Nutzer wechseln häufig zwischen Outlook-Web, Gmail, Kalender separat |
| **Ressourcen** | Schlanker **Electron**-Stack, virtualisierte Listen | Vollständige Office-Web- oder schwere Desktop-Suites |
| **Anpassbarkeit** | Open Source **am Code** (Repo); Regeln, QuickSteps, Meta-Ordner | Durch Produktstrategie des Anbieters begrenzt |

**Ehrlich gesagt:** MailClient ist kein Ersatz für **jedes** Enterprise-Feature von Outlook (z. B. tiefe Exchange-Admin-Szenarien, alle Policy-Edge-Cases). Stärken liegen bei **Workflow**, **lokaler Datenhaltung**, **Multi-Provider** und einer **modernen UI** für Einzelpersonen und kleine Teams, die Gmail und M365 **parallel** nutzen.

---

## Tech-Stack

- **Electron 33** (Main + Preload + Renderer)  
- **React 18** + **TypeScript**  
- **electron-vite** (Vite)  
- **TailwindCSS** + shadcn/ui-inspirierte Patterns + **Radix** + **lucide-react**  
- **Zustand** für UI-State  
- **react-virtuoso** für Mail-/Listen-Performance  
- **better-sqlite3** (Main) für lokale Persistenz  
- **@azure/msal-node**, **Microsoft Graph**, Google APIs (Gmail, Calendar, People, Tasks, …)  
- **electron-builder** (NSIS-Installer für Windows x64)  
- **Vitest** für Unit-Tests ausgewählter Logik  
- **i18next** — **Deutsch** und **Englisch**

---

## Voraussetzungen

- **Node.js ≥ 20** (getestet mit 22)  
- **Windows 11** (primäres Zielsystem für Build und UI)

---

## Setup & Entwicklung

```powershell
npm install
npm run dev
```

Startet Vite (Renderer) und Electron mit Hot-Module-Reload.

---

## Build (Windows-Installer)

Erzeugt ein Windows-Setup unter `release/<version>/`:

```powershell
npm run build:win
```

Hinweis aus `electron-builder.yml`: ohne Codesigning (`signAndEditExecutable: false`) für einfachere lokale Builds; für breite Verteilung später **Authenticode**-Signatur empfohlen.

---

## OAuth für Endnutzer und Unternehmen

Für **öffentliche Verteilung** trägt der **Herausgeber** die Azure-App-Registrierung und das Google-Cloud-Projekt **einmal** ein — Endnutzer sehen den **Ersteinrichtungs-Assistenten** und die **Browser-Anmeldung** (Scopes). Technische Client-IDs können per **Build-Umgebung** (`MAILCLIENT_*`) oder optional per **HTTPS-JSON** (`MAILCLIENT_REMOTE_OAUTH_CONFIG_URL`) bereitgestellt werden. Vorlage: [.env.example](.env.example).

- **Microsoft 365:** Wenn der Mandant **Nutzerzustimmung** verbietet, muss ein **Tenant-Admin** einmalig Admin-Zustimmung erteilen:

  `https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=<APPLICATION_CLIENT_ID>&redirect_uri=<URL_ENCODED_REDIRECT_URI>`

  Die Redirect-URI muss exakt zur Azure-App passen (Loopback-Flow wie in der App konfiguriert).

- **Google Workspace:** Admins können nicht verifizierte OAuth-Clients einschränken. Für Gmail-/Kalender-Scopes ist bei **öffentlicher Nutzung** oft die **Google OAuth-Verifizierung** nötig; bis dahin nur Testnutzer in der Google Cloud Console.

Eigene Azure-/Google-Registrierungen bleiben unter **Einstellungen → Allgemein → «Eigene OAuth-App»** möglich (lokale Überschreibung der Build-Defaults).

Mehr dazu: [docs/google-oauth-oeffentlich.md](./docs/google-oauth-oeffentlich.md).

---

## Tests

```powershell
npm run test
npm run test:watch
```

Unit-Tests (Vitest; u. a. `sanitize`-Tests mit jsdom) für Hilfslogik unter `src/renderer/src/lib/`.

---

## Projektstruktur

```
src/
  main/           Electron Main (DB, Sync, Graph/Gmail, IPC)
    ipc/          IPC-Registrierung nach Bereich (Mail, Kalender, Auth, …)
    lib/          Kleine Main-Helfer (z. B. kooperatives Scheduling)
  preload/        Sichere IPC-Brücke (contextIsolation)
  renderer/       React-UI (Modi: Home, Mail, Workflow, Kalender, …)
    src/
      app/        Layout, Kalender, Workflow, Regeln, Chat, Home
      components/ Wiederverwendbare UI-Komponenten
      stores/     Zustand-Stores
      lib/        Utilities, Shortcuts, …
      styles/     Globales CSS (Theme-Tokens)
  shared/         Geteilte Typen und IPC-Konstanten (Main, Preload, Renderer)
```

---

## Konzept & Roadmap

Ausführliches Produktkonzept: [.cursor/plans/mailclient_konzept_skizze_2f302c68.plan.md](./.cursor/plans/mailclient_konzept_skizze_2f302c68.plan.md) (Vision, Sicherheit, Performance; teils Zukunftsmusik, z. B. Utility-Process für Sync).

Kurzfassung der Plan-Phasen im Dokument:

- **MVP 1 – Power Inbox:** Multi-Account-Sync, lokale Suche, Senden  
- **MVP 2 – Action Inbox:** QuickSteps, ToDo, Snooze, Waiting-for, Templates  
- **MVP 3 – Workflow & Calendar:** UI-Modi, Kanban, Compose, Kalender, Teams  
- **Post-MVP:** Regel-Ausbau, **KI-Schicht** (im Datenmodell u. a. mit Feldern für Zusammenfassung/Labels vorbereitet — Produktnutzung folgt der Roadmap)

---

## Lizenz

`package.json` markiert das Projekt derzeit als **`UNLICENSED`** / **`private`**. Nutzung, Weitergabe und Beiträge richten sich nach den Rechten der Urheber:in — bei Interesse an Zusammenarbeit oder Lizenzierung am besten direkt Kontakt über das GitHub-Profil des Repos.

---

**Autor:** Kurt Soeser · **Produktname (Installer):** MailClient · **App-ID:** `at.kurtsoeser.mailclient`
