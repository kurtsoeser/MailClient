import type { MailFolder } from '@shared/types'

export interface FolderNode {
  folder: MailFolder
  children: FolderNode[]
  depth: number
}

const WELL_KNOWN_ORDER: Record<string, number> = {
  inbox: 0,
  sentitems: 1,
  drafts: 2,
  archive: 3,
  junkemail: 8,
  deleteditems: 9
}

function compareNodes(a: FolderNode, b: FolderNode): number {
  const aw = a.folder.wellKnown ? (WELL_KNOWN_ORDER[a.folder.wellKnown] ?? 5) : 5
  const bw = b.folder.wellKnown ? (WELL_KNOWN_ORDER[b.folder.wellKnown] ?? 5) : 5
  if (aw !== bw) return aw - bw
  return a.folder.name.localeCompare(b.folder.name, 'de', { sensitivity: 'base' })
}

export function buildFolderTree(folders: MailFolder[]): FolderNode[] {
  const byRemoteId = new Map<string, FolderNode>()

  for (const folder of folders) {
    byRemoteId.set(folder.remoteId, { folder, children: [], depth: 0 })
  }

  const roots: FolderNode[] = []
  for (const node of byRemoteId.values()) {
    const parentId = node.folder.parentRemoteId
    const parent = parentId ? byRemoteId.get(parentId) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function assignDepth(node: FolderNode, depth: number): void {
    node.depth = depth
    node.children.sort(compareNodes)
    for (const c of node.children) assignDepth(c, depth + 1)
  }

  roots.sort(compareNodes)
  for (const r of roots) assignDepth(r, 0)

  return roots
}

export function flattenTree(
  nodes: FolderNode[],
  collapsedRemoteIds: Set<string>
): FolderNode[] {
  const out: FolderNode[] = []
  const walk = (list: FolderNode[]): void => {
    for (const node of list) {
      out.push(node)
      if (!collapsedRemoteIds.has(node.folder.remoteId) && node.children.length > 0) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return out
}
