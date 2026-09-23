import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { DB } from './db.ts'

const SESSION_DAYS = 90

export interface User {
  id: string
  email: string
  name: string
}

export const hashPassword = (password: string) => {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`
}

export const verifyPassword = (password: string, stored: string) => {
  const [salt, hash] = stored.split(':')
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export const createUser = (db: DB, email: string, name: string, password: string): User => {
  const user = { id: randomUUID(), email: email.trim().toLowerCase(), name: name.trim() }
  db.prepare('INSERT INTO users (id, email, name, password, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, user.email, user.name, hashPassword(password), Date.now())
  return user
}

export const findUserByEmail = (db: DB, email: string) =>
  db.prepare('SELECT id, email, name, password FROM users WHERE email = ?').get(email.trim().toLowerCase()) as (User & { password: string }) | undefined

/** Issues an opaque bearer token; only its hash is stored. */
export const createSession = (db: DB, userId: string) => {
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, Date.now() + SESSION_DAYS * 86_400_000)
  return token
}

export const userForToken = (db: DB, token: string) =>
  db.prepare(`SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), Date.now()) as User | undefined

export const deleteSession = (db: DB, token: string) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))

export const pruneSessions = (db: DB) => db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
