import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'system' | 'dark' | 'light'

export interface Session {
  token: string
  user: { id: string; email: string; name: string }
}

interface Prefs {
  theme: Theme
  dailyGoal: number
  sidebar: boolean
  apiUrl: string
  session: Session | null
  set(patch: Partial<Omit<Prefs, 'set'>>): void
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: 'system',
      dailyGoal: 5,
      sidebar: typeof window === 'undefined' || window.innerWidth > 760,
      apiUrl: import.meta.env.VITE_API_URL ?? '',
      session: null,
      set: (patch) => set(patch),
    }),
    { name: 'calmlist:prefs' },
  ),
)

export const resolveTheme = (theme: Theme) =>
  theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme
