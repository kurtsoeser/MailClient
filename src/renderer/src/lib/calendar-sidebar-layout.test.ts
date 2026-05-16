import { describe, expect, it } from 'vitest'
import {
  addGlobalSection,
  calSidebarKey,
  defaultSidebarLayout,
  removeGlobalSection,
  renameGlobalSection,
  setGlobalSectionIcon
} from '@/lib/calendar-sidebar-layout'

describe('global calendar sections', () => {
  it('renameGlobalSection aktualisiert den Namen', () => {
    let layout = addGlobalSection(defaultSidebarLayout(), 'Privat')
    const id = layout.globalSections[0]!.id
    layout = renameGlobalSection(layout, id, 'PRIVAT')
    expect(layout.globalSections[0]?.name).toBe('PRIVAT')
  })

  it('removeGlobalSection entfernt Section und Zuordnungen', () => {
    let layout = addGlobalSection(defaultSidebarLayout(), 'Musik')
    const id = layout.globalSections[0]!.id
    const key = calSidebarKey('acc-1', 'cal-1')
    layout = {
      ...layout,
      sectionCalKeys: { [id]: [key] }
    }
    layout = removeGlobalSection(layout, id)
    expect(layout.globalSections).toHaveLength(0)
    expect(layout.sectionCalKeys[id]).toBeUndefined()
  })

  it('setGlobalSectionIcon speichert und entfernt Icon', () => {
    let layout = addGlobalSection(defaultSidebarLayout(), 'PH')
    const id = layout.globalSections[0]!.id
    layout = setGlobalSectionIcon(layout, id, 'briefcase')
    expect(layout.globalSections[0]?.icon).toBe('briefcase')
    layout = setGlobalSectionIcon(layout, id, undefined)
    expect(layout.globalSections[0]?.icon).toBeUndefined()
  })
})
