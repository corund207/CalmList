import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProviderConfig } from './providers'

export interface Session {
  token: string
  user: { id: string; email: string; name: string }
}

interface Prefs {
  /** A theme id from themes.ts, or "system" to follow the OS with the light/dark pair below. */
  theme: string
  themeLight: string
  themeDark: string
  /** Replaces the theme's accent and action colour when set. */
  accent: string | null
  /** Animated backdrops can be switched off without leaving the theme. */
  motion: boolean
  dailyGoal: number
  sidebar: boolean
  /** Where data syncs to; "local" keeps everything in this browser. */
  provider: ProviderConfig
  session: Session | null
  set(patch: Partial<Omit<Prefs, 'set'>>): void
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: 'system',
      themeLight: 'calm-light',
      themeDark: 'calm-dark',
      accent: null,
      motion: true,
      dailyGoal: 5,
      sidebar: typeof window === 'undefined' || window.innerWidth > 760,
      provider: { kind: 'local' },
      session: null,
      set: (patch) => set(patch),
    }),
    {
      name: 'calmlist:prefs',
      version: 1,
      // v0 kept the CalmList server address as `apiUrl`.
      migrate: (old, version) => {
        const s = old as Record<string, unknown>
        if (version === 0) {
          s.provider = s.session ? { kind: 'calmlist', url: (s.apiUrl as string) ?? '' } : { kind: 'local' }
          delete s.apiUrl
        }
        return s as unknown as Prefs
      },
    },
  ),
)
