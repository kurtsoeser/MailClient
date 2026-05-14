import { app } from 'electron'
import Database, { type Database as DbType } from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATIONS } from './schema'

let dbInstance: DbType | null = null

export function getDb(): DbType {
  if (dbInstance) return dbInstance

  const userDataDir = app.getPath('userData')
  const dbDir = join(userDataDir, 'data')
  mkdirSync(dbDir, { recursive: true })
  const dbPath = join(dbDir, 'mail.db')

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  runMigrations(db)
  dbInstance = db
  return db
}

function runMigrations(db: DbType): void {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0
  const sorted = [...MIGRATIONS].sort((a, b) => a.version - b.version)
  const todo = sorted.filter((m) => m.version > current)
  if (todo.length === 0) return

  console.log(`[db] migrating from version ${current} to ${sorted[sorted.length - 1]!.version}`)
  const tx = db.transaction(() => {
    for (const migration of todo) {
      console.log(`[db]   applying v${migration.version}: ${migration.description}`)
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    }
  })
  tx()
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
