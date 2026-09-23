import { useUI } from '../store/ui'
import { ConfirmDialog, FilterDialog, LabelDialog, NewPasswordDialog, ProjectDialog } from './EntityDialogs'
import { QuickAdd } from './QuickAdd'
import { RambleDialog } from './Ramble'
import { SearchDialog, ShortcutsDialog } from './Search'
import { SettingsDialog } from './Settings'

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
    case 'ramble':
      return <RambleDialog />
    case 'search':
      return <SearchDialog />
    case 'shortcuts':
      return <ShortcutsDialog />
    case 'settings':
      return <SettingsDialog />
    case 'newPassword':
      return <NewPasswordDialog />
    case 'confirm':
      return <ConfirmDialog {...dialog} />
    default:
      return null
  }
}
