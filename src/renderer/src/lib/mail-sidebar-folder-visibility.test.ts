import { describe, expect, it } from 'vitest'
import type { MailFolder } from '@shared/types'
import {
  filterFoldersForMailSidebar,
  mailFolderSidebarVisibilityKey
} from '@/lib/mail-sidebar-folder-visibility-storage'

function f(p: Partial<MailFolder> & Pick<MailFolder, 'id' | 'remoteId' | 'name' | 'accountId'>): MailFolder {
  return {
    parentRemoteId: null,
    path: null,
    wellKnown: null,
    isFavorite: false,
    unreadCount: 0,
    totalCount: 0,
    ...p
  }
}

describe('filterFoldersForMailSidebar', () => {
  it('entfernt ausgeblendeten Ordner und dessen Kinder', () => {
    const accountId = 'ms:test'
    const folders: MailFolder[] = [
      f({ id: 1, accountId, remoteId: 'inbox', name: 'Inbox', wellKnown: 'inbox' }),
      f({ id: 2, accountId, remoteId: 'trash', name: 'Trash', wellKnown: 'deleteditems' }),
      f({
        id: 3,
        accountId,
        remoteId: 'sub',
        name: 'Sub',
        parentRemoteId: 'trash',
        wellKnown: null
      })
    ]
    const hidden = new Set([mailFolderSidebarVisibilityKey(accountId, 'trash')])
    const out = filterFoldersForMailSidebar(accountId, folders, hidden)
    expect(out.map((x) => x.remoteId).sort()).toEqual(['inbox'])
  })

  it('laesst Geschwister unversteckter Eltern sichtbar', () => {
    const accountId = 'ms:x'
    const folders: MailFolder[] = [
      f({ id: 1, accountId, remoteId: 'a', name: 'A' }),
      f({ id: 2, accountId, remoteId: 'b', name: 'B', parentRemoteId: 'a' })
    ]
    const hidden = new Set<string>()
    expect(filterFoldersForMailSidebar(accountId, folders, hidden)).toHaveLength(2)
  })
})
