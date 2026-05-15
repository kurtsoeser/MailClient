import { readJsonSecure, writeJsonSecure } from '../secure-store'

const STORE_KEY = 'notion-destinations'

export interface NotionSavedDestination {
  id: string
  title: string
  icon: string | null
  kind: 'page' | 'database'
  addedAt: string
  lastUsedAt?: string
}

export interface NotionDestinationsConfig {
  favorites: NotionSavedDestination[]
  defaultMailPageId: string | null
  defaultCalendarPageId: string | null
  lastUsedPageId: string | null
  newPageParentId: string | null
}

const EMPTY: NotionDestinationsConfig = {
  favorites: [],
  defaultMailPageId: null,
  defaultCalendarPageId: null,
  lastUsedPageId: null,
  newPageParentId: null
}

export async function readNotionDestinations(): Promise<NotionDestinationsConfig> {
  const raw = await readJsonSecure<NotionDestinationsConfig | null>(STORE_KEY, null)
  if (!raw || typeof raw !== 'object') return { ...EMPTY }
  return {
    favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
    defaultMailPageId: raw.defaultMailPageId ?? null,
    defaultCalendarPageId: raw.defaultCalendarPageId ?? null,
    lastUsedPageId: raw.lastUsedPageId ?? null,
    newPageParentId: raw.newPageParentId ?? null
  }
}

export async function writeNotionDestinations(config: NotionDestinationsConfig): Promise<void> {
  await writeJsonSecure(STORE_KEY, config)
}

export async function touchNotionDestinationUsed(pageId: string): Promise<void> {
  const cfg = await readNotionDestinations()
  const now = new Date().toISOString()
  const favorites = cfg.favorites.map((f) =>
    f.id === pageId ? { ...f, lastUsedAt: now } : f
  )
  await writeNotionDestinations({ ...cfg, favorites, lastUsedPageId: pageId })
}
