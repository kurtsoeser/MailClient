# Google OAuth: Einrichtung für öffentliche Nutzung

Diese Anleitung ist für den **MailClient** (Electron, lokaler Sync) gedacht, wenn **beliebige Google-Nutzer** sich anmelden sollen — nicht nur Testnutzer in der Google Cloud Console.

Technische Referenz im Code:

- Redirect-URI und Scopes: [`src/main/auth/google-scopes.ts`](../src/main/auth/google-scopes.ts)
- Build-Variablen: [`.env.example`](../.env.example), Abschnitt „OAuth“ im [README](../README.md)

---

## 0. Zuerst: einen guten App-Namen festlegen

Den Namen brauchst du **überall gleich** (Google OAuth-Zustimmungsbildschirm, Website, Installer, Support-Mail-Signatur). Änderungen später sind möglich, aber verwirren Nutzer und erschweren die Verifizierung.

**Checkliste**

| Kriterium | Hinweis |
|-----------|---------|
| **Eindeutig** | Kurz, merkbar, nicht verwechselbar mit „Gmail“, „Outlook“, „Google“ allein (Marken fremder Anbieter). |
| **Konsistent** | Derselbe Name in Cloud Console, auf der **Datenschutz-URL**, im **Screencast** und im Desktop-Fenstertitel. |
| **Domain** | Wenn du eine **eigene Domain** hast: später für Links (Datenschutz, Produktseite) und ggf. Google-Domain-Verifikation nützlich. |
| **Recherche** | Kurz prüfen, ob der Name in Stores/Register schon stark belegt ist (nicht rechtsberatend). |
| **Arbeitstitel** | Bis du entschieden hast: in der Console einen **Arbeitstitel** nutzen; vor der **öffentlichen Verifizierung** finalisieren. |

**Platzhalter in dieser Anleitung:** „**[DeinAppName]**“ — ersetze ihn mental überall, wo ein Produktname steht.

---

## 1. Google Cloud Projekt anlegen

1. [Google Cloud Console](https://console.cloud.google.com/) öffnen.
2. Projekt auswählen oder **Neues Projekt** erstellen.
3. Für OAuth und Abrechnung ggf. ein **Billing-Konto** verknüpfen (Google verlangt das oft für APIs; Details in der aktuellen Google-Dokumentation).

---

## 2. APIs aktivieren

**APIs & Dienste** → **Bibliothek**

- **Gmail API** → aktivieren  
- **Google Calendar API** → aktivieren  

Ohne diese Aktivierung schlagen API-Aufrufe fehl, auch wenn die Anmeldung klappt.

---

## 3. OAuth-Zustimmungsbildschirm („Consent Screen“)

**APIs & Dienste** → **OAuth-Zustimmungsbildschirm**

### Nutzertyp

- In der Regel: **Extern** (beliebige Google-Konten), sofern ihr kein reines internes Workspace-only-Produkt seid.

### App-Informationen

- **App-Name:** z. B. `[DeinAppName]` (endgültiger Markenname).
- **Nutzer-Support-E-Mail**, **Entwicklerkontakt-E-Mail:** ausfüllen.
- **App-Logo** (optional, oft empfehlenswert für Vertrauen und Verifizierung).

### App-Domain / Links (für Veröffentlichung und Verifizierung wichtig)

Typisch erforderlich bzw. erwartet:

- **Datenschutzerklärung (URL)** — öffentlich, HTTPS, inhaltlich passend zu Mail/Kalender-Sync und lokaler Speicherung.
- **Startseite der Anwendung (URL)** — z. B. Produkt- oder Download-Seite.

Ohne seriöse **Datenschutz-URL** kommt ihr bei sensiblen Scopes kaum durch die **Verifizierung**.

### Bereiche (Scopes)

Unter **Bereiche hinzufügen** mindestens das anfordern, was die App nutzt (siehe Code in `google-scopes.ts`), u. a.:

- `openid`
- Nutzer-E-Mail / Profil (in der Console oft als **userinfo.email**, **userinfo.profile** o. ä. gelistet)
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/calendar`

Nur Scopes beantragen, die ihr **wirklich** braucht — weniger Umfang kann die Prüfung erleichtern.

---

## 4. OAuth-Client: Typ „Desktop“

**APIs & Dienste** → **Anmeldedaten** → **Anmeldedaten erstellen** → **OAuth-Client-ID**

- **Anwendungstyp:** **Desktop-App** (wichtig: nicht „Webanwendung“ für diesen MailClient-Flow).
- Name z. B. `[DeinAppName] Desktop`.

### Weiterleitungs-URI (Redirect)

In der Console für den Desktop-Client die **autorisierte Weiterleitungs-URI** exakt so eintragen:

```text
http://127.0.0.1:47836/oauth2callback
```

- Host: **`127.0.0.1`** (nicht `localhost`), Port **`47836`**, Pfad **`/oauth2callback`** — fest im Repository definiert.

---

## 5. Client-ID (und optional Secret) in der App

### Variante A: Build / Entwicklung (empfohlen für Verteilung)

Projektroot: `.env` anlegen (Vorlage: `.env.example`):

```env
MAILCLIENT_GOOGLE_CLIENT_ID=<Client-ID>.apps.googleusercontent.com
MAILCLIENT_GOOGLE_CLIENT_SECRET=
```

- **Secret leer lassen**, wenn ihr den **PKCE-Desktopflow ohne Client-Secret** nutzt (von dieser Codebasis unterstützt).
- Wenn der Token-Endpunkt bei eurem Client-Typ **ein Secret verlangt**, Secret nur sicher hinterlegen (CI/Secrets, nicht ins öffentliche Repo).

### Variante B: Nur auf einem Rechner testen

**Einstellungen** → **Allgemein** → **«Eigene OAuth-App»** → Google Client-ID (und optional Secret) speichern.

---

## 6. Phase „Test“ vs. „Öffentlich für alle“

### Während der Entwicklung (Status „Test“)

- Unter dem Zustimmungsbildschirm: **Testnutzer** mit deren Google-Konten eintragen.
- Nur diese Konten können sich zuverlässig anmelden.

### Öffentlich für alle Nutzer

1. Zustimmungsbildschirm vollständig ausfüllen (inkl. **Datenschutz-URL**).
2. App auf **Produktion** / **Veröffentlicht** stellen (genauer Wortlaut in der Console).
3. Für **Gmail** und die gewählten Kalender-Zugriffe ist mit **sensiblen Scopes** fast immer eine **OAuth-App-Verifizierung** durch Google nötig — nicht optional, wenn beliebige Nutzer einsteigen sollen.

Offizielle Übersicht (Englisch, in der Console oft auf Deutsch verfügbar):

- [OAuth-App-Verifizierung (Google Cloud Help)](https://support.google.com/cloud/answer/9110914)

**Typische Nachweise / Materialien**

- Kurzer **Screencast**: Start der App → „Google verbinden“ → Browser-Zustimmung → sichtbar, dass Mail/Kalender genutzt werden (ohne unnötige personenbezogene Daten zeigen).
- **Begründung**, wozu jeder Scope dient und wo Daten verarbeitet werden (lokal auf dem Gerät).
- **Konsistenter App-Name** und passende **Website**.

**Zeitplan:** mit mehreren Wochen rechnen; Rückfragen von Google sind üblich.

---

## 7. Google Workspace (Firmen-Konten)

Auch eine **verifizierte** App kann von **Workspace-Admins** blockiert oder eingeschränkt werden. Das ist dann eine Kundenrichtlinie, kein Fehler in eurer Redirect-Konfiguration.

---

## 8. Häufige Fehler

| Symptom | Maßnahme |
|---------|----------|
| `redirect_uri_mismatch` | URI **buchstäblich** wie oben; kein `https`, kein anderer Host/Port. |
| Nur ihr könnt euch anmelden | App noch **Test** → Testnutzer ergänzen **oder** Veröffentlichung + Verifizierung abwarten. |
| `access_denied` / leere Fehlermeldung | Zustimmungsbildschirm unvollständig; falsche Nutzerart; Nutzer nicht in Testliste. |
| API-Fehler nach erfolgreichem Login | **Gmail API** und **Calendar API** wirklich aktiviert? |

---

## 9. Reihenfolge (Merksatz)

1. **[DeinAppName]** und Domain/Datenschutz vorbereiten.  
2. Projekt → APIs aktivieren.  
3. Zustimmungsbildschirm + Scopes.  
4. **Desktop**-OAuth-Client + Redirect `http://127.0.0.1:47836/oauth2callback`.  
5. Client-ID in `.env` / Build.  
6. Mit **Testnutzern** alles durchspielen.  
7. **Verifizierung** einreichen → nach Freigabe: echte **öffentliche** Nutzung.

Wenn du den finalen App-Namen hast, trage ihn zuerst überall gleich ein (Console, Website, Installer), **bevor** du den Verifizierungs-Screencast aufnimmst — sonst doppelte Arbeit.
