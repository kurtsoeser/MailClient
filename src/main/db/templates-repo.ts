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

interface TemplateFullRow extends TemplateRow {
  created_at: string
  updated_at: string
}

export function listAllTemplatesForBackup(): Array<{
  id: number
  name: string
  bodyHtml: string
  bodyText: string | null
  variablesJson: string | null
  shortcut: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}> {
  const db = getDb()
  const rows = db
    .prepare<[], TemplateFullRow>(
      `SELECT id, name, body_html, body_text, variables_json, shortcut, sort_order, created_at, updated_at
       FROM templates
       ORDER BY sort_order ASC, id ASC`
    )
    .all()
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    bodyHtml: r.body_html,
    bodyText: r.body_text,
    variablesJson: r.variables_json,
    shortcut: r.shortcut,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

export function replaceAllTemplatesFromBackup(
  rows: Array<{
    id: number
    name: string
    bodyHtml: string
    bodyText: string | null
    variablesJson: string | null
    shortcut: string | null
    sortOrder: number
    createdAt: string
    updatedAt: string
  }>
): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM templates').run()
    const ins = db.prepare(
      `INSERT INTO templates (id, name, body_html, body_text, variables_json, shortcut, sort_order, created_at, updated_at)
       VALUES (@id, @name, @body_html, @body_text, @variables_json, @shortcut, @sort_order, @created_at, @updated_at)`
    )
    for (const r of rows) {
      ins.run({
        id: r.id,
        name: r.name,
        body_html: r.bodyHtml,
        body_text: r.bodyText,
        variables_json: r.variablesJson,
        shortcut: r.shortcut,
        sort_order: r.sortOrder,
        created_at: r.createdAt,
        updated_at: r.updatedAt
      })
    }
  })
  tx()
}
