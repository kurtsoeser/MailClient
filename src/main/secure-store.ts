import { app, safeStorage } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * Verschluesselter Persistenz-Speicher fuer sensible Daten (Token-Caches,
 * Refresh-Tokens, Account-Liste). Nutzt Electrons safeStorage, das unter
 * Windows DPAPI (dieselbe Mechanik wie der Windows Credential Manager)
 * verwendet.
 */

function storePath(name: string): string {
  return join(app.getPath('userData'), 'secure', `${name}.bin`)
}

function plainPath(name: string): string {
  return join(app.getPath('userData'), 'secure', `${name}.json`)
}

function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export async function readSecure(name: string): Promise<string | null> {
  if (encryptionAvailable()) {
    const path = storePath(name)
    if (!existsSync(path)) return null
    try {
      const blob = await readFile(path)
      return safeStorage.decryptString(blob)
    } catch {
      return null
    }
  }

  const path = plainPath(name)
  if (!existsSync(path)) return null
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export async function writeSecure(name: string, value: string): Promise<void> {
  const useEncryption = encryptionAvailable()
  const path = useEncryption ? storePath(name) : plainPath(name)
  await mkdir(dirname(path), { recursive: true })

  if (useEncryption) {
    const encrypted = safeStorage.encryptString(value)
    await writeFile(path, encrypted)
  } else {
    console.warn(
      '[secure-store] safeStorage encryption NOT available. Writing plaintext (not for production).'
    )
    await writeFile(path, value, 'utf8')
  }
}

export async function readJsonSecure<T>(name: string, fallback: T): Promise<T> {
  const raw = await readSecure(name)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJsonSecure<T>(name: string, value: T): Promise<void> {
  await writeSecure(name, JSON.stringify(value))
}
