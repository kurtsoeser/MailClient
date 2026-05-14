import { Table } from '@tiptap/extension-table/table'
import { TableCell } from '@tiptap/extension-table/cell'
import { TableHeader } from '@tiptap/extension-table/header'

export type MailTableDesign = 'bordered' | 'minimal' | 'shadow'

function parseCellBg(el: HTMLElement): string | null {
  const fromStyle = (el.style.backgroundColor || '').trim()
  if (
    fromStyle &&
    fromStyle !== 'transparent' &&
    fromStyle !== 'rgba(0, 0, 0, 0)' &&
    fromStyle !== 'rgba(0,0,0,0)'
  ) {
    return fromStyle
  }
  const bg = el.getAttribute('bgcolor')
  return bg && bg.trim() ? bg.trim() : null
}

function parseTableDesign(el: HTMLElement): MailTableDesign {
  if (el.classList.contains('mail-tbl-shadow')) return 'shadow'
  if (el.classList.contains('mail-tbl-minimal')) return 'minimal'
  return 'bordered'
}

function parseTableAlign(el: HTMLElement): 'left' | 'center' | 'right' {
  const a = (el.getAttribute('align') || '').trim().toLowerCase()
  if (a === 'center' || a === 'middle') return 'center'
  if (a === 'right') return 'right'
  const st = (el.style.marginLeft || '').trim()
  if (st === 'auto' && (el.style.marginRight || '').trim() === 'auto') return 'center'
  return 'left'
}

export const MailTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) => parseCellBg(element as HTMLElement),
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {}
          return { bgcolor: attributes.backgroundColor }
        }
      }
    }
  }
})

export const MailTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) => parseCellBg(element as HTMLElement),
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {}
          return { bgcolor: attributes.backgroundColor }
        }
      }
    }
  }
})

export const MailTable = Table.extend({
  addAttributes() {
    return {
      design: {
        default: 'bordered' as MailTableDesign,
        parseHTML: (element) => parseTableDesign(element as HTMLElement),
        renderHTML: (attributes) => {
          const d = (attributes.design ?? 'bordered') as MailTableDesign
          return { class: `mail-compose-table mail-tbl-${d}` }
        }
      },
      tableAlign: {
        default: 'left' as const,
        parseHTML: (element) => parseTableAlign(element as HTMLElement),
        renderHTML: (attributes) => {
          const a = attributes.tableAlign as 'left' | 'center' | 'right'
          if (!a || a === 'left') return {}
          return { align: a }
        }
      }
    }
  }
})
