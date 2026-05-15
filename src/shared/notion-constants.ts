/**
 * OAuth Redirect-URI — muss exakt mit dem übereinstimmen, was Notion nach dem Speichern anzeigt.
 * Im Developer-Portal nur Host+Pfad eintragen (ohne https://), Notion setzt https:// davor:
 * @see NOTION_OAUTH_REDIRECT_URI_PORTAL_ENTRY
 */
export const NOTION_OAUTH_REDIRECT_URI = 'https://127.0.0.1:47837/notion/oauth/callback'

/** Nur diesen Text im Notion-Portal unter „Umleitungs-URIs“ eintragen — kein mailclient://, kein http:// */
export const NOTION_OAUTH_REDIRECT_URI_PORTAL_ENTRY =
  '127.0.0.1:47837/notion/oauth/callback'

/** Frühere Variante; Abfangen im OAuth-Fenster bleibt kompatibel */
export const NOTION_OAUTH_REDIRECT_URI_LEGACY_HTTP =
  'http://127.0.0.1:47837/notion/oauth/callback'
