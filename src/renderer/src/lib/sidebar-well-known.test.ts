import { describe, expect, it } from 'vitest'
import type { FolderNode } from '@/lib/folder-tree'
import type { MailFolder } from '@shared/types'
import {
  sidebarInitialCollapsedRemoteIds,
  sidebarIsProtectedWellKnownFolder,
  sidebarWellKnownFolderDisplayName
} from '@/lib/sidebar-well-known'

function folder(partial: Partial<MailFolder> & Pick<MailFolder, 'id' | 'remoteId' | 'name'>): MailFolder {
  return {
    accountId: 'acc',
    parentRemoteId: null,
    path: null,
    wellKnown: null,
    isFavorite: false,
    unreadCount: 0,
    totalCount: 0,
    ...partial
  }
}

function fn(
  f: MailFolder,
  depth: number,
  children: FolderNode[] = []
): FolderNode {
  return { folder: f, children, depth }
}

describe('sidebarWellKnownFolderDisplayName', () => {
  it('liefert deutsches Label fuer well-known', () => {
    expect(sidebarWellKnownFolderDisplayName('inbox', 'Inbox')).toBe('Posteingang')
  })

  it('nutzt Ordnernamen ohne well-known', () => {
    expect(sidebarWellKnownFolderDisplayName(undefined, 'Projekte')).toBe('Projekte')
  })
})

describe('sidebarIsProtectedWellKnownFolder', () => {
  it('markiert Kern-Ordner als geschuetzt', () => {
    expect(sidebarIsProtectedWellKnownFolder('inbox')).toBe(true)
    expect(sidebarIsProtectedWellKnownFolder('mailclient_wip')).toBe(true)
    expect(sidebarIsProtectedWellKnownFolder('mailclient_done')).toBe(true)
  })

  it('leer oder unbekannt nicht geschuetzt', () => {
    expect(sidebarIsProtectedWellKnownFolder(null)).toBe(false)
    expect(sidebarIsProtectedWellKnownFolder(undefined)).toBe(false)
    expect(sidebarIsProtectedWellKnownFolder('custom')).toBe(false)
  })
})

describe('sidebarInitialCollapsedRemoteIds', () => {
  it('klappt nur nicht-Wurzel-Ordner mit Kindern ein', () => {
    const root = folder({ id: 1, remoteId: 'r1', name: 'Root' })
    const sub = folder({ id: 2, remoteId: 'r2', name: 'Sub', parentRemoteId: 'r1' })
    const leaf = folder({ id: 3, remoteId: 'r3', name: 'Leaf', parentRemoteId: 'r2' })
    const tree: FolderNode[] = [
      fn(root, 0, [
        fn(sub, 1, [fn(leaf, 2)]),
        fn(folder({ id: 4, remoteId: 'r4', name: 'EmptySub', parentRemoteId: 'r1' }), 1, [])
      ])
    ]
    const collapsed = sidebarInitialCollapsedRemoteIds(tree)
    expect(collapsed.has('r2')).toBe(true)
    expect(collapsed.has('r4')).toBe(false)
    expect(collapsed.has('r1')).toBe(false)
  })
})
