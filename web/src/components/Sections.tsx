import { ChevronRight, Ellipsis, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Section } from '../lib/types'
import { addSection, deleteSection, updateSection } from '../store/actions'
import { useUI } from '../store/ui'
import { Popover, usePopover } from './Popover'

function NameInput({ initial = '', submit, onSubmit, onCancel }: { initial?: string; submit: string; onSubmit(name: string): void; onCancel(): void }) {
  const [name, setName] = useState(initial)
  return (
    <form
      className="section-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSubmit(name.trim())
      }}
      onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), onCancel())}
    >
      <input className="field" autoFocus value={name} placeholder="Name this section" maxLength={120} onChange={(e) => setName(e.target.value)} />
      <div className="editor-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>{submit}</button>
      </div>
    </form>
  )
}

export function SectionHead({ section, count }: { section: Section; count: number }) {
  const [renaming, setRenaming] = useState(false)
  const menu = usePopover()
  const open = useUI((s) => s.open)

  if (renaming)
    return <NameInput initial={section.name} submit="Save" onCancel={() => setRenaming(false)} onSubmit={(name) => (updateSection(section.id, { name }), setRenaming(false))} />

  return (
    <header className="group-head section-head">
      <button
        className="task-collapse is-static"
        aria-expanded={!section.collapsed}
        aria-label={section.collapsed ? `Expand ${section.name}` : `Collapse ${section.name}`}
        onClick={() => updateSection(section.id, { collapsed: !section.collapsed })}
      >
        <ChevronRight size={14} />
      </button>
      <h2 onDoubleClick={() => setRenaming(true)}>{section.name}</h2>
      <span className="micro">{count}</span>
      <button className="icon-btn" aria-label={`${section.name} actions`} onClick={menu.toggle} aria-expanded={menu.open}><Ellipsis size={16} /></button>
      {menu.open && (
        <Popover anchor={menu.anchor} onClose={menu.close} width={200} label="Section actions">
          <div className="menu-list">
            <button className="menu-item" onClick={() => (setRenaming(true), menu.close())}><Pencil size={14} /> Rename</button>
            <button
              className="menu-item is-danger"
              onClick={() => {
                menu.close()
                open({
                  type: 'confirm',
                  title: 'Delete section?',
                  body: `“${section.name}” and its ${count} task${count === 1 ? '' : 's'} will be deleted.`,
                  action: 'Delete',
                  onConfirm: () => useUI.getState().toast(`Deleted section: ${section.name}`, deleteSection(section.id)),
                })
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </Popover>
      )}
    </header>
  )
}

export function AddSection({ projectId, variant = 'divider' }: { projectId: string; variant?: 'divider' | 'column' }) {
  const [open, setOpen] = useState(false)
  if (open) return <NameInput submit="Add section" onCancel={() => setOpen(false)} onSubmit={(name) => (addSection(projectId, name), setOpen(false))} />
  return (
    <button className={variant === 'divider' ? 'add-section' : 'add-column'} onClick={() => setOpen(true)}>
      <span>Add section</span>
    </button>
  )
}
