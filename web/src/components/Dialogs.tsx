import { useUI } from '../store/ui'
import { QuickAdd } from './QuickAdd'

/** Renders whichever global dialog is open. */
export function Dialogs() {
  const dialog = useUI((s) => s.dialog)
  if (!dialog) return null
  switch (dialog.type) {
    case 'quickAdd':
      return <QuickAdd defaults={dialog.defaults} />
    default:
      return null
  }
}
