# Chronell — Homepage auf GitHub Pages veröffentlichen

Die Marketing-Website liegt in diesem Ordner (`docs/`) als statische HTML-Seite.

## Live-URL (nach Aktivierung)

**https://kurtsoeser.github.io/Chronell/**

## Einrichtung (einmalig)

1. Repository auf GitHub öffnen: [kurtsoeser/Chronell](https://github.com/kurtsoeser/Chronell)
2. **Settings** → **Pages**
3. Unter **Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** `main` (oder dein Default-Branch)
   - **Folder:** `/docs`
4. **Save** klicken
5. Nach 1–3 Minuten ist die Seite erreichbar (grüner Hinweis mit URL)

## Voraussetzungen

- Repository muss für **kostenlose GitHub Pages** **öffentlich** sein (oder GitHub Pro für private Repos)
- Die Datei `docs/index.html` muss im Branch existieren, den du für Pages gewählt hast

## Warteliste (CTA)

Die Buttons „Auf die Warteliste“ / „Join waitlist“ öffnen ein vorausgefülltes GitHub-Issue:

https://github.com/kurtsoeser/Chronell/issues/new?template=chronell-beta-waitlist.yml

**Optional besser:** Unter **Settings → General → Features** die **Discussions** aktivieren, Kategorie „Beta“ anlegen und in `docs/js/site.js` die Variable `WAITLIST_URL` auf die Discussions-URL ändern.

## Lokale Vorschau

```powershell
cd docs
npx --yes serve .
```

Dann im Browser `http://localhost:3000` öffnen.

## Screenshots einpflegen

Lege PNG-Dateien in `docs/assets/screenshots/` ab, z. B.:

- `mail-triage.png`
- `calendar.png`
- `work.png`
- `dashboard.png`

Passe danach `docs/index.html` an: `<img>` statt Platzhalter-Gradient in `.screenshot-body`.

## Custom Domain (optional)

Unter **Pages → Custom domain** z. B. `chronell.app` eintragen und bei deinem DNS-Provider einen **CNAME** auf `kurtsoeser.github.io` setzen.

## Social Preview

Unter **Settings → General → Social preview** ein Bild hochladen (z. B. Export von `assets/og-image.svg` als PNG 1280×640).
