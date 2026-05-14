/** @vitest-environment jsdom */

import type { MailFolder } from '@shared/types'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  lastMailNavIsRestorable,
  readLastMailNav,
  writeLastMailNav,
  type LastMailNavV1
} from './mail-nav-persist'

const STORAGE_KEY = 'mailclient.lastMailNav.v1'

function folder(id: number): MailFolder {
  return {
    id,
    accountId: 'ms:test',
    remoteId: `r${id}`,
    parentRemoteId: null,
    path: null,
    name: 'F',
    wellKnown: id === 99 ? 'deleteditems' : 'inbox',
    isFavorite: false,
    unreadCount: 0,
    totalCount: 0
  }
}

describe('readLastMailNav / writeLastMailNav', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('liefert null bei leerem Storage', () => {
    expect(readLastMailNav()).toBeNull()
  })

  it('roundtrip fuer gueltigen Eintrag', () => {
    const entry: LastMailNavV1 = {
      v: 1,
      listKind: 'unified_inbox',
      todoDueKind: null,
      folderAccountId: null,
      folderId: null,
      metaFolderId: null,
      selectedMessageId: 42
    }
    writeLastMailNav(entry)
    expect(readLastMailNav()).toEqual(entry)
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('unified_inbox')
  })

  it('verwirft ungueltige listKind', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, listKind: 'bogus' }))
    expect(readLastMailNav()).toBeNull()
  })
})

describe('lastMailNavIsRestorable', () => {
  const foldersByAccount: Record<string, MailFolder[]> = {
    'ms:a': [folder(1), folder(2)]
  }
  const known = new Set(['ms:a'])
  const knownMeta = new Set<number>()

  it('folder: true wenn Ordner existiert', () => {
    const nav: LastMailNavV1 = {
      v: 1,
      listKind: 'folder',
      todoDueKind: null,
      folderAccountId: 'ms:a',
      folderId: 2,
      metaFolderId: null,
      selectedMessageId: null
    }
    expect(lastMailNavIsRestorable(nav, foldersByAccount, known, knownMeta)).toBe(true)
  })

  it('folder: false wenn Konto unbekannt', () => {
    const nav: LastMailNavV1 = {
      v: 1,
      listKind: 'folder',
      todoDueKind: null,
      folderAccountId: 'ms:x',
      folderId: 1,
      metaFolderId: null,
      selectedMessageId: null
    }
    expect(lastMailNavIsRestorable(nav, foldersByAccount, known, knownMeta)).toBe(false)
  })

  it('todo: einheitliche Ansicht (todoDueKind === null) und einzelner Bucket sind beide wiederherstellbar', () => {
    expect(
      lastMailNavIsRestorable(
        {
          v: 1,
          listKind: 'todo',
          todoDueKind: null,
          folderAccountId: null,
          folderId: null,
          metaFolderId: null,
          selectedMessageId: null
        },
        foldersByAccount,
        known,
        knownMeta
      )
    ).toBe(true)
    expect(
      lastMailNavIsRestorable(
        {
          v: 1,
          listKind: 'todo',
          todoDueKind: 'today',
          folderAccountId: null,
          folderId: null,
          metaFolderId: null,
          selectedMessageId: null
        },
        foldersByAccount,
        known,
        knownMeta
      )
    ).toBe(true)
  })

  it('meta_folder: nur wenn ID existiert', () => {
    const nav: LastMailNavV1 = {
      v: 1,
      listKind: 'meta_folder',
      todoDueKind: null,
      folderAccountId: null,
      folderId: null,
      metaFolderId: 7,
      selectedMessageId: null
    }
    expect(lastMailNavIsRestorable(nav, foldersByAccount, known, new Set())).toBe(false)
    expect(lastMailNavIsRestorable(nav, foldersByAccount, known, new Set([7]))).toBe(true)
  })
})
