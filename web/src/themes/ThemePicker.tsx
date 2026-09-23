import { Check, Sparkles, Sun } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { usePrefs } from '../store/prefs'
import { resolveThemeId } from './apply'
import { GROUPS, paletteOf, THEMES, type Group, type Theme } from './themes'

const ACCENTS = ['#0071e3', '#7048e8', '#c2255c', '#c2410c', '#b35300', '#2b8a3e', '#0b7285', '#495057']

function Swatch({ theme }: { theme: Theme }) {
  const p = paletteOf(theme)
  const style = { '--sw-bg': p.bg, '--sw-surface': p.surface, '--sw-fg': p.fg, '--sw-muted': p.muted, '--sw-accent': p.accent } as CSSProperties
  return (
    <span className="swatch" style={style} data-kind={theme.backdrop} aria-hidden="true">
      <span className="sw-side" />
      <span className="sw-main">
        <span className="sw-title" />
        <span className="sw-row"><i /><b /></span>
        <span className="sw-row"><i /><b style={{ width: '48%' }} /></span>
        <span className="sw-row"><i data-accent /><b style={{ width: '62%' }} /></span>
      </span>
    </span>
  )
}

export function ThemePicker() {
  const { theme, themeLight, themeDark, accent, motion, set } = usePrefs()
  const [group, setGroup] = useState<Group | 'all'>('all')
  const system = theme === 'system'
  const current = resolveThemeId(theme, themeLight, themeDark)
  const shown = THEMES.filter((t) => group === 'all' || t.group === group)

  const pick = (t: Theme) => {
    if (!system) return set({ theme: t.id })
    // In system mode a theme fills the slot matching its own scheme; dynamic ones fill both.
    const scheme = paletteOf(t).scheme
    if (typeof t.palette === 'function') set({ themeLight: t.id, themeDark: t.id })
    else set(scheme === 'light' ? { themeLight: t.id } : { themeDark: t.id })
  }
  const selected = (t: Theme) => (system ? t.id === themeLight || t.id === themeDark : t.id === current)

  return (
    <div className="settings-pane">
      <div className="picker-head">
        <div className="segmented" role="radiogroup" aria-label="Theme mode">
          <button type="button" role="radio" aria-checked={!system} onClick={() => set({ theme: current })}>One theme</button>
          <button type="button" role="radio" aria-checked={system} onClick={() => set({ theme: 'system' })}><Sun size={14} /> Match system</button>
        </div>
        {system && (
          <p className="form-hint">
            Light: <strong>{THEMES.find((t) => t.id === themeLight)?.name}</strong> · Dark: <strong>{THEMES.find((t) => t.id === themeDark)?.name}</strong>. Pick a theme to fill its slot.
          </p>
        )}
      </div>

      <div className="chips" role="tablist" aria-label="Theme groups">
        {[['all', 'All'] as const, ...GROUPS].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={group === id} className="chip" data-active={group === id || undefined} onClick={() => setGroup(id)}>
            {label} <span className="micro">{id === 'all' ? THEMES.length : THEMES.filter((t) => t.group === id).length}</span>
          </button>
        ))}
      </div>

      <div className="theme-grid" role="radiogroup" aria-label="Themes">
        {shown.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={selected(t)} className="theme-card" onClick={() => pick(t)} title={t.blurb}>
            <Swatch theme={t} />
            <span className="theme-name">
              {t.name}
              {selected(t) && <Check size={14} />}
            </span>
            <span className="theme-blurb">{t.blurb}</span>
            {(t.backdrop || typeof t.palette === 'function') && (
              <span className="theme-badge micro">{typeof t.palette === 'function' ? 'Dynamic' : t.backdrop === 'scanlines' || t.backdrop === 'blueprint' ? 'Texture' : 'Animated'}</span>
            )}
          </button>
        ))}
      </div>

      <div className="form-field">
        <span className="micro">Accent</span>
        <div className="accents">
          <button type="button" className="accent-dot is-auto" aria-pressed={!accent} onClick={() => set({ accent: null })} title="Theme default">
            <Sparkles size={13} />
          </button>
          {ACCENTS.map((c) => (
            <button key={c} type="button" className="accent-dot" style={{ background: c }} aria-pressed={accent === c} aria-label={`Accent ${c}`} onClick={() => set({ accent: c })} />
          ))}
          <label className="accent-dot is-custom" title="Custom colour">
            <input type="color" value={accent ?? '#0071e3'} onChange={(e) => set({ accent: e.target.value })} aria-label="Custom accent colour" />
          </label>
        </div>
      </div>

      <label className="toggle">
        <input type="checkbox" checked={motion} onChange={(e) => set({ motion: e.target.checked })} />
        <span className="toggle-track" aria-hidden="true" />
        Animate theme backdrops (always off when your system asks for reduced motion)
      </label>
    </div>
  )
}
