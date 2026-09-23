import { describe, expect, it } from 'vitest'
import { contrast } from '../lib/color'
import { paletteOf, THEMES, toVars, type Theme } from './themes'

// Every hour of a leap year's worth of dynamic palettes collapses to a handful; sample them all.
const samples = (t: Theme) =>
  typeof t.palette === 'function'
    ? Array.from({ length: 24 * 12 }, (_, i) => paletteOf(t, new Date(2028, i % 12, 1 + (i % 28), Math.floor(i / 12))))
    : [paletteOf(t)]

describe('themes', () => {
  it('have unique ids', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
  })

  for (const theme of THEMES)
    it(`${theme.name} keeps text legible`, () => {
      for (const p of samples(theme)) {
        const v = toVars(p)
        for (const ground of [v['--background'], v['--surface']]) {
          expect(contrast(v['--foreground'], ground), `foreground on ${ground}`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(v['--foreground-bright'], ground), `bright on ${ground}`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(v['--muted'], ground), `muted on ${ground}`).toBeGreaterThanOrEqual(ground === v['--background'] ? 4.5 : 4)
        }
        expect(contrast(v['--accent'], v['--background']), 'accent on background').toBeGreaterThanOrEqual(3)
        expect(contrast(v['--on-action'], v['--action']), 'label on action').toBeGreaterThanOrEqual(4.5)
      }
    })
})
