import { addDays, toISO } from '../lib/dates'
import { addLabel, addProject, addSection, addTask, inboxId } from './actions'
import { useStore } from './store'

const SEEDED = 'calmlist:seeded'

/** Guarantees an Inbox; on a brand-new local install, adds a short guided tour. */
export const seed = () => {
  if (!inboxId()) addProject('Inbox', { inbox: true, order: -1 })
  const fresh = Object.keys(useStore.getState().data.tasks).length === 0
  if (!fresh || localStorage.getItem(SEEDED)) return
  localStorage.setItem(SEEDED, '1')

  const d = (n: number) => ({ date: toISO(addDays(new Date(), n)) })
  const quick = addLabel('quick')
  const tour = addProject('Getting Started')
  const basics = addSection(tour.id, 'Basics')
  const power = addSection(tour.id, 'Power moves')

  addTask({ content: 'Press Q anywhere to add a task', projectId: tour.id, sectionId: basics.id, due: d(0), priority: 1,
    description: 'Type naturally: "Call Sam tomorrow 4pm p2 #Work @phone". Dates, priorities, projects and labels are picked out as you type.' })
  addTask({ content: 'Click the circle to complete a task', projectId: tour.id, sectionId: basics.id, due: d(0), labels: [quick.id] })
  const parent = addTask({ content: 'Open a task to add notes, subtasks and comments', projectId: tour.id, sectionId: basics.id, due: d(1) })
  addTask({ content: 'This is a subtask', projectId: tour.id, sectionId: basics.id, parentId: parent.id })
  addTask({ content: 'Drag tasks to reorder them or move them between sections', projectId: tour.id, sectionId: basics.id })
  addTask({ content: 'Water the plants (repeats every other day)', projectId: tour.id, sectionId: power.id,
    due: { ...d(0), recurrence: { every: 2, unit: 'day' } }, priority: 3 })
  addTask({ content: 'Press / to search, ? for every shortcut', projectId: tour.id, sectionId: power.id, labels: [quick.id], due: d(2) })
  addTask({ content: 'Switch this project to a board from its ••• menu', projectId: tour.id, sectionId: power.id, due: d(3) })
  addTask({ content: 'Sign in from Settings to sync across devices', projectId: tour.id, sectionId: power.id, priority: 2, due: d(5) })
}
