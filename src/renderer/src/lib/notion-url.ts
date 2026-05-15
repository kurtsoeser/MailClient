/** Web-URL der Notion-Seite → Deep-Link für die Desktop-App (`notion://www.notion.so/…`). */
export function toNotionAppUrl(webUrl: string): string {
  const trimmed = webUrl.trim()
  if (!trimmed) throw new Error('Keine Notion-URL.')
  if (/^notion:\/\//i.test(trimmed)) return trimmed
  if (/^https:\/\/(www\.)?notion\.so\//i.test(trimmed)) {
    return trimmed.replace(/^https:\/\//i, 'notion://')
  }
  throw new Error('Ungueltige Notion-Web-URL.')
}
