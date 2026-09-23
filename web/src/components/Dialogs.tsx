import { useUI } from '../store/ui'
import { ConfirmDialog, FilterDialog, LabelDialog, ProjectDialog } from './EntityDialogs'
import { QuickAdd } from './QuickAdd'
import { SearchDialog, ShortcutsDialog } from './Search'

/** Renders whichever global dialog is open. */
export function Dialogs() {
  const dialog = useUI((s) => s.dialog)
  if (!dialog) return null
  switch (dialog.type) {
    case 'quickAdd':
      return <QuickAdd defaults={dialog.defaults} />
    case 'project':
      return <ProjectDialog id={dialog.id} />
    case 'label':
      return <LabelDialog id={dialog.id} />
    case 'filter':
      return <FilterDialog id={dialog.id} />
    case 'search':
      return <SearchDialog />
    case 'shortcuts':
      return <ShortcutsDialog />
    case 'confirm':
      return <ConfirmDialog {...dialog} />
    default:
      return null
  }
}
