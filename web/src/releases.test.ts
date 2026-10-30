import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RELEASES, releasesSince, VERSION } from './releases'

const semver = (v: string) => v.split('.').map(Number)
const newer = (a: string, b: string) => {
  const [x, y] = [semver(a), semver(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

describe('releases', () => {
  it('match the version in package.json', () => {
    for (const file of ['../package.json', '../../package.json']) {
      expect(JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')).version).toBe(VERSION)
    }
  })

  it('are numbered major.minor.patch, newest first, each with notes', () => {
    for (const r of RELEASES) {
      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.notes.length).toBeGreaterThan(0)
    }
    for (let i = 1; i < RELEASES.length; i++) expect(newer(RELEASES[i - 1].version, RELEASES[i].version)).toBe(true)
  })

  it('show what changed since the version a device last saw', () => {
    expect(releasesSince(VERSION)).toEqual([])
    expect(releasesSince(RELEASES[2].version).map((r) => r.version)).toEqual([RELEASES[0].version, RELEASES[1].version])
    expect(releasesSince('0.0.1')).toEqual([RELEASES[0]])
  })
})
