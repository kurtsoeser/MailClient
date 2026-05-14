import { getDb } from './index'
import type { MailTemplate } from '@shared/types'

interface TemplateRow {
  id: number
  name: string
  body_html: string
  body_text: string | null
  variables_json: string | null
  shortcut: string | null
  sort_order: number
}

function rowToTemplate(r: TemplateRow): MailTemplate {
  return {
    id: r.id,
    name: r.name,
    bodyHtml: r.body_html,
    bodyText: r.body_text,
    variablesJson: r.variables_json,
    shortcut: r.shortcut,
    sortOrder: r.sort_order
  }
}

export function listMailTemplates(): MailTemplate[] {
  const db = getDb()
  const rows = db
    .prepare<[], TemplateRow>(
      `SELECT id, name, body_html, body_text, variables_json, shortcut, sort_order
       FROM templates
       ORDER BY sort_order ASC, id ASC`
    )
    .all()
  return rows.map(rowToTemplate)
}
