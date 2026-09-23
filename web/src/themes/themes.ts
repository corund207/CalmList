import { inkOn, mix, rgba } from '../lib/color'

export type Scheme = 'dark' | 'light'
export type Group = 'dark' | 'light' | 'dynamic' | 'animated' | 'niche'
export type Backdrop =
  | 'aurora' | 'stars' | 'synthwave' | 'rain' | 'lava' | 'matrix' | 'fireflies' | 'snow'
  | 'clouds' | 'waves' | 'sakura' | 'gradient' | 'scanlines' | 'blueprint'
export type Font = 'mono' | 'serif' | 'rounded'

export interface Palette {
  scheme: Scheme
  bg: string
  surface: string
  fg: string
  muted: string
  accent: string
  surfaceSoft?: string
  surfaceDeep?: string
  fgSoft?: string
  fgBright?: string
  mutedDark?: string
  accentBright?: string
  action?: string
}

export interface Theme {
  id: string
  name: string
  group: Group
  blurb: string
  /** A fixed palette, or one computed from the clock for dynamic themes. */
  palette: Palette | ((now: Date) => Palette)
  backdrop?: Backdrop
  font?: Font
}

/* ─── Design-system anchors ──────────────────────────────────────────────── */

const CALM_DARK: Palette = {
  scheme: 'dark', bg: '#000000', surface: '#1d1d1f', surfaceSoft: '#161617', surfaceDeep: '#0a0a0a',
  fg: '#f5f5f7', fgSoft: '#d2d2d7', fgBright: '#ffffff', muted: '#86868b', mutedDark: '#6e6e73',
  accent: '#2997ff', accentBright: '#64b5ff', action: '#0071e3',
}

const CALM_LIGHT: Palette = {
  scheme: 'light', bg: '#ffffff', surface: '#f5f5f7', surfaceSoft: '#fbfbfd', surfaceDeep: '#e8e8ed',
  fg: '#1d1d1f', fgSoft: '#424245', fgBright: '#000000', muted: '#6e6e73', mutedDark: '#6e6e73',
  accent: '#0066cc', accentBright: '#0071e3', action: '#0071e3',
}

/* ─── Palettes used by dynamic themes ────────────────────────────────────── */

const DAWN: Palette = { scheme: 'light', bg: '#fff6ef', surface: '#fbe7da', fg: '#3a2419', muted: '#7a5a49', accent: '#c2410c' }
const GOLDEN: Palette = { scheme: 'light', bg: '#fff8e8', surface: '#f8ebc9', fg: '#3b2c0e', muted: '#735f33', accent: '#b25e00' }
const DUSK: Palette = { scheme: 'dark', bg: '#17112a', surface: '#231a3d', fg: '#f1eafd', muted: '#a597c4', accent: '#c197ff' }
const NIGHT: Palette = { scheme: 'dark', bg: '#060913', surface: '#10162a', fg: '#e6ebf7', muted: '#8a95b2', accent: '#7aa2ff' }
const NIGHT_SHIFT: Palette = { scheme: 'dark', bg: '#120d08', surface: '#1f1710', fg: '#f6e7d3', muted: '#ad9579', accent: '#ffa94d', action: '#e8590c' }

const SPRING: Palette = { scheme: 'light', bg: '#fff7f9', surface: '#fde8ee', fg: '#3d1f2a', muted: '#80566a', accent: '#c2255c' }
const SUMMER: Palette = { scheme: 'light', bg: '#f3faff', surface: '#e1f1fd', fg: '#0c2a43', muted: '#4f6a80', accent: '#0b7285' }
const AUTUMN: Palette = { scheme: 'dark', bg: '#1a120b', surface: '#2a1d12', fg: '#f7e8d8', muted: '#b39a80', accent: '#ff922b', action: '#c2410c' }
const WINTER: Palette = { scheme: 'dark', bg: '#0b1320', surface: '#152034', fg: '#eaf2fb', muted: '#94a7bf', accent: '#8fd3ff', action: '#1c7ed6' }

const DAILY: Palette[] = [
  { scheme: 'dark', bg: '#0f1418', surface: '#1a2229', fg: '#e8eef2', muted: '#8f9ea9', accent: '#4fd1c5', action: '#127a70' },
  { scheme: 'light', bg: '#fdfbf7', surface: '#f3eee4', fg: '#2a241c', muted: '#6d6352', accent: '#a0522d' },
  { scheme: 'dark', bg: '#15111c', surface: '#221b2d', fg: '#efe9f7', muted: '#a195b3', accent: '#f783ac', action: '#c2255c' },
  { scheme: 'light', bg: '#f6fbf7', surface: '#e6f2e9', fg: '#1b2e21', muted: '#566b5c', accent: '#237032' },
  { scheme: 'dark', bg: '#101217', surface: '#1b1e26', fg: '#eceef3', muted: '#9197a6', accent: '#ffd43b', action: '#a35400' },
  { scheme: 'light', bg: '#f7f7ff', surface: '#ebebfb', fg: '#1e1e3f', muted: '#5f5f86', accent: '#5f3dc4' },
  { scheme: 'dark', bg: '#0c1415', surface: '#162224', fg: '#e5f1f1', muted: '#8aa3a5', accent: '#66d9e8', action: '#0b7285' },
]

const phaseOfDay = (h: number) => (h < 6 ? NIGHT : h < 9 ? DAWN : h < 17 ? CALM_LIGHT : h < 19 ? GOLDEN : h < 21 ? DUSK : NIGHT)
const season = (m: number) => (m < 2 || m === 11 ? WINTER : m < 5 ? SPRING : m < 8 ? SUMMER : AUTUMN)
const dayOfYear = (d: Date) => Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000)

/* ─── The catalogue ──────────────────────────────────────────────────────── */

export const THEMES: Theme[] = [
  // Dark
  { id: 'calm-dark', name: 'Calm Dark', group: 'dark', blurb: 'Pure black, graphite, one blue.', palette: CALM_DARK },
  { id: 'midnight', name: 'Midnight', group: 'dark', blurb: 'Deep navy for late sessions.', palette: { scheme: 'dark', bg: '#0b1020', surface: '#151b30', fg: '#e6e9f5', muted: '#8a93b2', accent: '#7aa2ff', action: '#3b5bdb' } },
  { id: 'graphite', name: 'Graphite', group: 'dark', blurb: 'Warm greys with an amber spark.', palette: { scheme: 'dark', bg: '#1c1c1e', surface: '#2c2c2e', fg: '#f2f2f7', muted: '#9c9ca3', accent: '#ff9f0a', action: '#b35300' } },
  { id: 'oled', name: 'OLED Mono', group: 'dark', blurb: 'True black, white on black, nothing else.', palette: { scheme: 'dark', bg: '#000000', surface: '#101010', fg: '#ededed', muted: '#8f8f8f', accent: '#ffffff', action: '#ffffff' } },
  { id: 'forest-night', name: 'Forest Night', group: 'dark', blurb: 'Pine green and moss.', palette: { scheme: 'dark', bg: '#0e1a14', surface: '#16261d', fg: '#e3efe7', muted: '#8aa596', accent: '#5fd39a', action: '#237a4b' } },
  { id: 'plum', name: 'Plum', group: 'dark', blurb: 'Aubergine with a pink edge.', palette: { scheme: 'dark', bg: '#1a1020', surface: '#26182e', fg: '#f3e8f7', muted: '#a88fb3', accent: '#ff7ac6', action: '#c2255c' } },
  { id: 'ember', name: 'Ember', group: 'dark', blurb: 'Charcoal and a glowing coal.', palette: { scheme: 'dark', bg: '#1a0f0a', surface: '#27170f', fg: '#f7e9df', muted: '#b3937f', accent: '#ff7a45', action: '#c2410c' } },

  // Light
  { id: 'calm-light', name: 'Calm Light', group: 'light', blurb: 'Apple white and #f5f5f7.', palette: CALM_LIGHT },
  { id: 'paper', name: 'Paper', group: 'light', blurb: 'Warm stock and terracotta ink.', palette: { scheme: 'light', bg: '#fbf8f1', surface: '#f2ede1', fg: '#2b2620', muted: '#6b6256', accent: '#b3401e' } },
  { id: 'sky', name: 'Sky', group: 'light', blurb: 'A clear morning.', palette: { scheme: 'light', bg: '#f5f9ff', surface: '#e8f0fc', fg: '#0f1f3a', muted: '#566683', accent: '#1f6feb' } },
  { id: 'sage', name: 'Sage', group: 'light', blurb: 'Soft green, easy on the eyes.', palette: { scheme: 'light', bg: '#f6f8f4', surface: '#e9eee5', fg: '#1f2a1f', muted: '#5a6858', accent: '#2f7d4f' } },
  { id: 'sand', name: 'Sand', group: 'light', blurb: 'Linen and clay.', palette: { scheme: 'light', bg: '#fbf6ee', surface: '#f1e8da', fg: '#33291d', muted: '#6f6149', accent: '#b54f23' } },
  { id: 'lilac', name: 'Lilac', group: 'light', blurb: 'Pale violet with a deep purple.', palette: { scheme: 'light', bg: '#faf7fe', surface: '#efe9f9', fg: '#251b36', muted: '#675b7c', accent: '#7048e8' } },

  // Dynamic
  { id: 'daylight', name: 'Daylight', group: 'dynamic', blurb: 'Dawn, day, golden hour, dusk and night, on your clock.', palette: (now) => phaseOfDay(now.getHours()) },
  { id: 'night-shift', name: 'Night Shift', group: 'dynamic', blurb: 'Calm Light by day, warm amber dark after 8 pm.', palette: (now) => (now.getHours() >= 20 || now.getHours() < 7 ? NIGHT_SHIFT : CALM_LIGHT) },
  { id: 'seasons', name: 'Seasons', group: 'dynamic', blurb: 'Blossom, sea, harvest and frost through the year.', palette: (now) => season(now.getMonth()) },
  { id: 'daily', name: 'Daily Mix', group: 'dynamic', blurb: 'A new curated palette every morning.', palette: (now) => DAILY[dayOfYear(now) % DAILY.length] },

  // Animated
  { id: 'aurora', name: 'Aurora', group: 'animated', blurb: 'Northern lights drift behind your list.', backdrop: 'aurora', palette: { scheme: 'dark', bg: '#030712', surface: '#0f172a', fg: '#eef2ff', muted: '#98a3c7', accent: '#5eead4', action: '#0d9488' } },
  { id: 'starfield', name: 'Starfield', group: 'animated', blurb: 'Slow stars, faint twinkle.', backdrop: 'stars', palette: { scheme: 'dark', bg: '#02030a', surface: '#0e1020', fg: '#e8ecff', muted: '#8e96b8', accent: '#a78bfa', action: '#7048e8' } },
  { id: 'synthwave', name: 'Synthwave', group: 'animated', blurb: 'A neon sun over an endless grid.', backdrop: 'synthwave', palette: { scheme: 'dark', bg: '#12002b', surface: '#1e0540', fg: '#ffe9ff', muted: '#c49ad9', accent: '#ff4fd8', accentBright: '#36f9f6', action: '#b5179e' } },
  { id: 'rainy-window', name: 'Rainy Window', group: 'animated', blurb: 'Rain on glass while you work.', backdrop: 'rain', palette: { scheme: 'dark', bg: '#0a1220', surface: '#111c2e', fg: '#e3ecf7', muted: '#8fa1ba', accent: '#6cb6ff', action: '#1c7ed6' } },
  { id: 'lava-lamp', name: 'Lava Lamp', group: 'animated', blurb: 'Warm blobs rising and falling.', backdrop: 'lava', palette: { scheme: 'dark', bg: '#140806', surface: '#22100b', fg: '#ffece3', muted: '#c39a8b', accent: '#ff6a3d', action: '#c2410c' } },
  { id: 'matrix', name: 'Digital Rain', group: 'animated', blurb: 'Green glyphs falling in the dark.', backdrop: 'matrix', font: 'mono', palette: { scheme: 'dark', bg: '#000500', surface: '#061206', fg: '#b7ffb7', muted: '#5fbf6a', accent: '#00ff41', action: '#00c832' } },
  { id: 'fireflies', name: 'Fireflies', group: 'animated', blurb: 'A summer forest after dark.', backdrop: 'fireflies', palette: { scheme: 'dark', bg: '#07130d', surface: '#0f2118', fg: '#e6f5ea', muted: '#8fb09b', accent: '#d9f99d', action: '#5c940d' } },
  { id: 'snowfall', name: 'Snowfall', group: 'animated', blurb: 'Quiet flakes on a winter night.', backdrop: 'snow', palette: WINTER },
  { id: 'clouds', name: 'Clouds', group: 'animated', blurb: 'Soft clouds sailing across a pale sky.', backdrop: 'clouds', palette: { scheme: 'light', bg: '#e9f3ff', surface: '#f7fbff', fg: '#0f2540', muted: '#4e627c', accent: '#2563eb' } },
  { id: 'ocean', name: 'Ocean', group: 'animated', blurb: 'Gentle swell along the bottom edge.', backdrop: 'waves', palette: { scheme: 'light', bg: '#effbfb', surface: '#ddf3f3', fg: '#0b2e33', muted: '#4a676c', accent: '#0b7285' } },
  { id: 'sakura', name: 'Sakura', group: 'animated', blurb: 'Cherry blossom petals drifting down.', backdrop: 'sakura', palette: SPRING },
  { id: 'dreamy', name: 'Dreamy', group: 'animated', blurb: 'A pastel gradient that slowly breathes.', backdrop: 'gradient', palette: { scheme: 'light', bg: '#fdf7ff', surface: '#f4ebfb', fg: '#2a1b3d', muted: '#6a5a80', accent: '#9c36b5' } },

  // Niche
  { id: 'terminal', name: 'Terminal', group: 'niche', blurb: 'Green phosphor, monospace, scanlines.', backdrop: 'scanlines', font: 'mono', palette: { scheme: 'dark', bg: '#050a05', surface: '#0b140b', fg: '#7dff9a', fgBright: '#c4ffd0', muted: '#46b862', accent: '#39ff14', action: '#39ff14' } },
  { id: 'amber-crt', name: 'Amber CRT', group: 'niche', blurb: 'A 1983 amber monitor.', backdrop: 'scanlines', font: 'mono', palette: { scheme: 'dark', bg: '#0d0700', surface: '#1a0f00', fg: '#ffb000', fgBright: '#ffd166', muted: '#c08600', accent: '#ffcc4d', action: '#ffb000' } },
  { id: 'gameboy', name: 'Pocket', group: 'niche', blurb: 'Four shades of green, 1989.', font: 'mono', palette: { scheme: 'light', bg: '#9bbc0f', surface: '#b3cf3b', fg: '#0f380f', fgBright: '#051a05', fgSoft: '#0f380f', muted: '#1e4a1e', accent: '#0f380f', action: '#0f380f' } },
  { id: 'blueprint', name: 'Blueprint', group: 'niche', blurb: 'White lines on drafting blue.', backdrop: 'blueprint', font: 'mono', palette: { scheme: 'dark', bg: '#0b3d91', surface: '#0f4aa8', fg: '#ffffff', muted: '#c3d7f7', accent: '#ffd84d', action: '#ffd84d' } },
  { id: 'nord', name: 'Nord', group: 'niche', blurb: 'An arctic, north-bluish palette.', palette: { scheme: 'dark', bg: '#2e3440', surface: '#3b4252', fg: '#eceff4', muted: '#aab3c3', accent: '#88c0d0', action: '#5e81ac' } },
  { id: 'dracula', name: 'Dracula', group: 'niche', blurb: 'The classic purple night.', palette: { scheme: 'dark', bg: '#282a36', surface: '#343746', fg: '#f8f8f2', muted: '#a8acc8', accent: '#bd93f9', action: '#bd93f9' } },
  { id: 'gruvbox', name: 'Gruvbox', group: 'niche', blurb: 'Retro groove, warm and earthy.', palette: { scheme: 'dark', bg: '#282828', surface: '#3c3836', fg: '#ebdbb2', muted: '#b0a28c', accent: '#fabd2f', action: '#d79921' } },
  { id: 'solarized-dark', name: 'Solarized Dark', group: 'niche', blurb: 'Precision colours, dark base.', palette: { scheme: 'dark', bg: '#002b36', surface: '#073642', fg: '#a3b1b1', fgBright: '#fdf6e3', muted: '#8a9c9c', accent: '#2aa1e6', action: '#268bd2' } },
  { id: 'solarized-light', name: 'Solarized Light', group: 'niche', blurb: 'Precision colours, light base.', palette: { scheme: 'light', bg: '#fdf6e3', surface: '#eee8d5', fg: '#3a535b', fgBright: '#073642', muted: '#566d74', accent: '#1f6fa8', action: '#268bd2' } },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', group: 'niche', blurb: 'Soothing pastel, dark roast.', palette: { scheme: 'dark', bg: '#1e1e2e', surface: '#313244', fg: '#cdd6f4', muted: '#a6adc8', accent: '#cba6f7', action: '#cba6f7' } },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', group: 'niche', blurb: 'Soothing pastel, light roast.', palette: { scheme: 'light', bg: '#eff1f5', surface: '#e6e9ef', fg: '#4c4f69', muted: '#5f6279', accent: '#8839ef' } },
  { id: 'rose-pine', name: 'Rosé Pine', group: 'niche', blurb: 'All natural pine, faux fur and soho vibes.', palette: { scheme: 'dark', bg: '#191724', surface: '#1f1d2e', fg: '#e0def4', muted: '#908caa', accent: '#ebbcba', action: '#ebbcba' } },
  { id: 'tokyo-night', name: 'Tokyo Night', group: 'niche', blurb: 'Downtown lights at midnight.', palette: { scheme: 'dark', bg: '#1a1b26', surface: '#24283b', fg: '#c0caf5', muted: '#9aa5ce', accent: '#7aa2f7', action: '#7aa2f7' } },
  { id: 'vaporwave', name: 'Vaporwave', group: 'niche', blurb: 'Pastel neon, mall at closing time.', palette: { scheme: 'dark', bg: '#1b0f33', surface: '#2a1650', fg: '#fbe9ff', muted: '#c3a6e0', accent: '#ff71ce', accentBright: '#01cdfe', action: '#ff71ce' } },
  { id: 'coffee', name: 'Coffee', group: 'niche', blurb: 'Espresso, crema and a little caramel.', palette: { scheme: 'dark', bg: '#1f1611', surface: '#2c2019', fg: '#f1e4d8', muted: '#b09a88', accent: '#d4a373', action: '#d4a373' } },
  { id: 'e-ink', name: 'E-Ink', group: 'niche', blurb: 'Greyscale and serif, like a reader.', font: 'serif', palette: { scheme: 'light', bg: '#f4f4f0', surface: '#e8e8e3', fg: '#111111', muted: '#555555', accent: '#111111', action: '#111111' } },
  { id: 'newsprint', name: 'Newsprint', group: 'niche', blurb: 'Broadsheet serif with a red rule.', font: 'serif', palette: { scheme: 'light', bg: '#f7f5ef', surface: '#ece8dd', fg: '#1a1a1a', muted: '#5b5850', accent: '#a61b1b' } },
  { id: 'bubblegum', name: 'Bubblegum', group: 'niche', blurb: 'Rounded type, candy colours.', font: 'rounded', palette: { scheme: 'light', bg: '#fff5fb', surface: '#ffe3f3', fg: '#3b1030', muted: '#7a4a6a', accent: '#d6336c' } },
  { id: 'high-contrast', name: 'High Contrast', group: 'niche', blurb: 'Maximum legibility: black, white, yellow.', palette: { scheme: 'dark', bg: '#000000', surface: '#111111', fg: '#ffffff', fgSoft: '#ffffff', muted: '#e0e0e0', mutedDark: '#e0e0e0', accent: '#ffea00', action: '#ffea00' } },
]

export const GROUPS: [Group, string][] = [['dark', 'Dark'], ['light', 'Light'], ['dynamic', 'Dynamic'], ['animated', 'Animated'], ['niche', 'Niche']]

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0]

export const paletteOf = (theme: Theme, now = new Date()) => (typeof theme.palette === 'function' ? theme.palette(now) : theme.palette)

const FONTS: Record<Font, string> = {
  mono: 'var(--font-mono)',
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif',
}

/** Expands a palette into every CSS custom property the app reads. */
export const toVars = (p: Palette, accentOverride?: string | null, font?: Font, glass?: boolean): Record<string, string> => {
  const dark = p.scheme === 'dark'
  const accent = accentOverride ?? p.accent
  const action = accentOverride ?? p.action ?? p.accent
  const surfaceSoft = p.surfaceSoft ?? mix(p.bg, p.surface, 0.5)
  return {
    '--background': p.bg,
    '--surface': p.surface,
    '--surface-soft': surfaceSoft,
    '--surface-deep': p.surfaceDeep ?? (dark ? mix(p.bg, '#000000', 0.5) : mix(p.surface, p.fg, 0.06)),
    '--foreground': p.fg,
    '--foreground-soft': p.fgSoft ?? mix(p.fg, p.bg, 0.16),
    '--foreground-bright': p.fgBright ?? (dark ? mix(p.fg, '#ffffff', 0.6) : mix(p.fg, '#000000', 0.6)),
    '--muted': p.muted,
    '--muted-dark': p.mutedDark ?? p.muted,
    '--accent': accent,
    '--accent-bright': accentOverride ?? p.accentBright ?? (dark ? mix(accent, '#ffffff', 0.3) : accent),
    '--action': action,
    '--on-action': inkOn(action),
    '--line': rgba(p.fg, dark ? 0.17 : 0.12),
    '--line-strong': rgba(p.fg, dark ? 0.27 : 0.2),
    '--line-control': rgba(p.fg, dark ? 0.42 : 0.45),
    '--hover-wash': rgba(p.fg, dark ? 0.06 : 0.05),
    '--row-wash': rgba(p.fg, dark ? 0.035 : 0.03),
    '--header-scrim': rgba(p.bg, glass ? 0.62 : 0.88),
    '--placeholder': surfaceSoft,
    '--sidebar-bg': glass ? rgba(surfaceSoft, 0.55) : surfaceSoft,
    '--glass-blur': glass ? 'saturate(160%) blur(22px)' : 'none',
    '--font-sans': font ? FONTS[font] : '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
  }
}
