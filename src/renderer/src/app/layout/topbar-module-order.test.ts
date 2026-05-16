// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest'
import type { AppShellMode } from '@/stores/app-mode'
import {
  DEFAULT_TOPBAR_MODULE_ORDER,
  readTopbarModuleOrder,
  persistTopbarModuleOrder,
  reconcileTopbarModuleOrder
} from './topbar-module-order'

describe('topbar-module-order', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('reconcileTopbarModuleOrder behält Reihenfolge und hängt fehlende Modi an', () => {
    const prev: AppShellMode[] = ['mail', 'home']
    const next = reconcileTopbarModuleOrder(prev, DEFAULT_TOPBAR_MODULE_ORDER)
    expect(next[0]).toBe('mail')
    expect(next[1]).toBe('home')
    expect(new Set(next)).toEqual(new Set(DEFAULT_TOPBAR_MODULE_ORDER))
    expect(next.length).toBe(DEFAULT_TOPBAR_MODULE_ORDER.length)
  })

  it('readTopbarModuleOrder / persistTopbarModuleOrder runden korrekt ab', () => {
    persistTopbarModuleOrder(['chat', 'notes'])
    const read = readTopbarModuleOrder()
    expect(read[0]).toBe('chat')
    expect(read[1]).toBe('notes')
    expect(new Set(read)).toEqual(new Set(DEFAULT_TOPBAR_MODULE_ORDER))
  })
})
