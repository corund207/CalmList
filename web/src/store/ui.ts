import { create } from 'zustand'
import type { TaskInput } from './actions'
import type { Change } from './backend'
import { commit } from './store'

export interface Toast {
  id: number
  message: string
  undo?: Change[]
}

type Dialog =
  | { type: 'quickAdd'; defaults?: Partial<TaskInput> }
  | { type: 'search' }
  | { type: 'shortcuts' }
  | { type: 'settings' }
  | { type: 'project'; id?: string }
  | { type: 'label'; id?: string }
  | { type: 'filter'; id?: string }
  | null

interface UI {
  dialog: Dialog
  toasts: Toast[]
  open(dialog: Dialog): void
  close(): void
  toast(message: string, undo?: Change[]): void
  dismiss(id: number): void
}

let seq = 0

export const useUI = create<UI>()((set, get) => ({
  dialog: null,
  toasts: [],
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
  toast(message, undo) {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, undo }] }))
    setTimeout(() => get().dismiss(id), 5000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const undo = (toast: Toast) => {
  if (toast.undo) commit(toast.undo)
  useUI.getState().dismiss(toast.id)
}
