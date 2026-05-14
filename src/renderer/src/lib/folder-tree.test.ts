import type { MailFolder } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { buildFolderTree, flattenTree, type FolderNode } from './folder-tree'

function folder(p: Partial<MailFolder> & Pick<MailFolder, 'id' | 'remoteId' | 'name'>): MailFolder {
  return {
    accountId: 'a',
    parentRemoteId: null,
    path: null,
    wellKnown: null,
    unreadCount: 0,
    totalCount: 0,
    isFavorite: false,
    ...p
  }
}

describe('buildFolderTree', () => {
  it('baut Hierarchie und sortiert Systemordner', () => {
    const inbox = folder({
      id: 1,
      remoteId: 'inbox',
      name: 'Posteingang',
      wellKnown: 'inbox'
    })
    const sent = folder({
      id: 2,
      remoteId: 'sent',
      name: 'Gesendet',
      wellKnown: 'sentitems'
    })
    const child = folder({
      id: 3,
      remoteId: 'c1',
      name: 'Alpha',
      parentRemoteId: 'inbox'
    })
    const childB = folder({
      id: 4,
      remoteId: 'c2',
      name: 'Beta',
      parentRemoteId: 'inbox'
    })
    const roots = buildFolderTree([inbox, sent, child, childB])
    expect(roots.map((r) => r.folder.remoteId)).toEqual(['inbox', 'sent'])
    const inboxNode = roots.find((r) => r.folder.remoteId === 'inbox')!
    expect(inboxNode.children.map((c) => c.folder.name)).toEqual(['Alpha', 'Beta'])
    expect(inboxNode.children[0]!.depth).toBe(1)
  })
})

describe('flattenTree', () => {
  it('respektiert eingeklappte Knoten', () => {
    const a: FolderNode = {
      folder: folder({ id: 1, remoteId: 'r1', name: 'A' }),
      children: [
        {
          folder: folder({ id: 2, remoteId: 'r2', name: 'B', parentRemoteId: 'r1' }),
          children: [],
          depth: 1
        }
      ],
      depth: 0
    }
    const all = flattenTree([a], new Set())
    expect(all.map((n) => n.folder.remoteId)).toEqual(['r1', 'r2'])
    const collapsed = flattenTree([a], new Set(['r1']))
    expect(collapsed.map((n) => n.folder.remoteId)).toEqual(['r1'])
  })
})
