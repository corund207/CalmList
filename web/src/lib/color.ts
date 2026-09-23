/** Small colour helpers for building and checking theme palettes. Hex in, hex/rgba out. */

export type RGB = [number, number, number]

export const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6)
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const rgbToHex = ([r, g, b]: RGB) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`

export const rgba = (hex: string, alpha: number) => `rgba(${hexToRgb(hex).join(', ')}, ${alpha})`

/** Linear blend: t = 0 gives a, t = 1 gives b. */
export const mix = (a: string, b: string, t: number) => {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB)
}

const channel = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two opaque colours. */
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Whichever of white or near-black reads better on the given fill. */
export const inkOn = (fill: string) => (contrast('#ffffff', fill) >= contrast('#111111', fill) ? '#ffffff' : '#111111')
