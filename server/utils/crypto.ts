import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import { getDataDir } from '../db'

/**
 * Provider API keys are encrypted at rest with AES-256-GCM.
 * The master key is generated once into the data directory and never
 * leaves the server. The browser only ever sees a masked hint.
 */

const keyCache = new Map<string, string>()

function getOrCreateKeyFile(name: string): string {
  const cached = keyCache.get(name)
  if (cached) return cached

  const path = join(getDataDir(), `${name}.key`)
  if (!existsSync(path)) {
    writeFileSync(path, randomBytes(32).toString('hex'))
  }
  const key = readFileSync(path, 'utf8').trim()
  keyCache.set(name, key)
  return key
}

export function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function encryptSecret(plain: string): string {
  const key = Buffer.from(getOrCreateKeyFile('erebus-secret'), 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decryptSecret(payload: string | null): string | null {
  if (!payload) return null
  try {
    const [version, ivB64, tagB64, ctB64] = payload.split(':')
    if (version !== 'v1' || !ivB64 || !tagB64 || !ctB64) return null
    const key = Buffer.from(getOrCreateKeyFile('erebus-secret'), 'hex')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
