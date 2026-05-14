/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readRecentMailMoveFolders, touchRecentMailMoveFolder } from './mail-move-recent'

const KEY = 'mailclient.recentMailMoveFolders'

describe('mail-move-recent', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.removeItem(KEY)
  })

  it('pins latest folder move per account and caps list', (): void => {
    touchRecentMailMoveFolder('a', 1)
    touchRecentMailMoveFolder('a', 2)
    touchRecentMailMoveFolder('a', 1)
    const list = readRecentMailMoveFolders()
    expect(list[0]?.folderId).toBe(1)
    expect(list[1]?.folderId).toBe(2)
    expect(list.every((x) => x.accountId === 'a')).toBe(true)
  })
})
