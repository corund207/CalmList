import { CalendarSync, ChevronLeft, ChevronRight, ExternalLink, EyeOff, Plus, RefreshCw, Undo2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Page } from '../components/Page'
import { TaskItem } from '../components/TaskItem'
import { useData } from '../hooks'
import { addDays, formatDayHeading, startOfDay, toISO } from '../lib/dates'
import { viewTransition } from '../lib/motion'
import { openTasks } from '../lib/select'
import type { Task } from '../lib/types'
import { dismissEvent, eventEnd, eventStart, loadEvents, pickEvent, useGoogle, type PickableEvent } from '../store/google'
import { useUI } from '../store/ui'

type Mode = 'month' | 'week' | 'list'

type Item =
  | { kind: 'task'; id: string; title: string; start: Date; end: Date; allDay: boolean; task: Task }
  | { kind: 'event'; id: string; title: string; start: Date; end: Date; allDay: boolean; event: PickableEvent }

const HOUR = 48 // px per hour in the week grid
const LIST_DAYS = 30
const MODE_KEY = 'calmlist:calendar-mode'
const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))
const sameDay = (a: Date, b: Date) => toISO(a) === toISO(b)
const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes()

const readMode = (): Mode => {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return m === 'week' || m === 'list' ? m : 'month'
  } catch {
    return 'month'
  }
}

/** Three days on a phone, seven elsewhere. */
function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const mq = matchMedia('(max-width: 760px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

/** The days a mode shows around an anchor day. */
function windowFor(mode: Mode, anchor: Date, narrow: boolean) {
  if (mode === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const start = monday(first)
    return { start, days: 42 }
  }
  if (mode === 'week') return narrow ? { start: anchor, days: 3 } : { start: monday(anchor), days: 7 }
  return { start: anchor, days: LIST_DAYS }
}

/** Animates a calendar change: the period slides the way time moved; a new view settles in place. */
const transition = (direction: 'next' | 'prev' | 'swap', update: () => void) => viewTransition(`cal-${direction}`, update)

/** Tasks and Google events by date and time: a month, a week of hours, or a list. */
export function CalendarView() {
  const data = useData()
  const { connected, available, events, version, loadingEvents, eventsError } = useGoogle()
  const { open } = useUI()
  const [, setParams] = useSearchParams()
  const narrow = useNarrow()
  const [mode, setModeState] = useState<Mode>(readMode)
  const [anchor, setAnchor] = useState(() => startOfDay())
  const [showSkipped, setShowSkipped] = useState(false)
  const [selected, setSelected] = useState<{ event: PickableEvent; rect: DOMRect } | null>(null)

  const { start, days } = windowFor(mode, anchor, narrow)
  const end = addDays(start, days)

  // Events for the visible window, again whenever Google reports a change.
  useEffect(() => {
    void loadEvents(start, end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.getTime(), end.getTime(), connected, version])

  const items = useMemo(() => {
    const out: Item[] = []
    for (const t of openTasks(data)) {
      if (!t.due) continue
      const [y, m, d] = t.due.date.split('-').map(Number)
      const [h, min] = (t.due.time ?? '00:00').split(':').map(Number)
      const at = new Date(y, m - 1, d, h, min)
      if (at < start || at >= end) continue
      out.push({ kind: 'task', id: t.id, title: t.content, start: at, end: new Date(at.getTime() + 30 * 60_000), allDay: !t.due.time, task: t })
    }
    for (const e of Object.values(events)) {
      // A picked event lives on as its task; skipped ones only on request.
      if (e.taskId || (e.dismissed && !showSkipped)) continue
      const at = eventStart(e)
      const until = eventEnd(e)
      if (until <= start || at >= end) continue
      out.push({ kind: 'event', id: e.key, title: e.title, start: at, end: until, allDay: e.allDay, event: e })
    }
    return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, events, showSkipped, start.getTime(), end.getTime()])

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const it of items) {
      // Events that span days appear on each one.
      for (let d = startOfDay(it.start); d < it.end || sameDay(d, it.start); d = addDays(d, 1)) {
        if (d >= end) break
        if (d < start) continue
        map.set(toISO(d), [...(map.get(toISO(d)) ?? []), it])
        if (!it.allDay || it.kind === 'task') break
      }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const skipped = Object.values(events).filter((e) => e.dismissed && !e.taskId).length

  const setMode = (m: Mode) => {
    if (m === mode) return
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* a convenience only */
    }
    transition('swap', () => setModeState(m))
  }
  const step = (dir: 1 | -1) =>
    transition(dir === 1 ? 'next' : 'prev', () =>
      setAnchor((a) =>
        mode === 'month' ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * (mode === 'week' ? (narrow ? 3 : 7) : LIST_DAYS)),
      ),
    )
  const goToday = () => transition('swap', () => setAnchor(startOfDay()))
  const openDay = (d: Date) => transition('swap', () => (setAnchor(d), setModeState('list')))

  const openItem = (it: Item, target: HTMLElement) => {
    if (it.kind === 'task') setParams((p) => (p.set('task', it.id), p))
    else setSelected({ event: it.event, rect: target.getBoundingClientRect() })
  }

  const label =
    mode === 'month'
      ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : mode === 'week'
        ? `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(end, -1).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
        : sameDay(anchor, startOfDay())
          ? 'Next 30 days'
          : `From ${anchor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  const actions = connected && (
    <>
      {skipped > 0 && (
        <button className="btn btn-secondary btn-sm" aria-pressed={showSkipped} onClick={() => setShowSkipped((v) => !v)}>
          <EyeOff size={14} /> {showSkipped ? 'Hide skipped' : `${skipped} skipped`}
        </button>
      )}
      <button className="icon-btn" aria-label="Refresh events" title="Refresh events" disabled={loadingEvents} onClick={() => void loadEvents(start, end)}>
        <RefreshCw size={17} className={loadingEvents ? 'spin' : undefined} />
      </button>
    </>
  )

  return (
    <Page title="Calendar" actions={actions} wide={mode !== 'list'}>
      <div className="cal-toolbar">
        <div className="segmented" role="radiogroup" aria-label="Calendar view">
          {(['month', 'week', 'list'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
              {m === 'month' ? 'Month' : m === 'week' ? 'Week' : 'List'}
            </button>
          ))}
        </div>
        <h2 className="cal-period" aria-live="polite">{label}</h2>
        <div className="cal-nav">
          <button className="icon-btn" aria-label="Earlier" onClick={() => step(-1)}><ChevronLeft size={18} /></button>
          <button className="btn btn-secondary btn-sm" onClick={goToday}>Today</button>
          <button className="icon-btn" aria-label="Later" onClick={() => step(1)}><ChevronRight size={18} /></button>
        </div>
      </div>

      {!connected && available !== false && (
        <div className="cal-connect">
          <CalendarSync size={16} />
          <p>See your Google Calendar events here alongside your tasks.</p>
          <button className="btn btn-secondary btn-sm" onClick={() => open({ type: 'settings', tab: 'integrations' })}>Connect</button>
        </div>
      )}
      {eventsError && <p className="form-hint" data-error>{eventsError}</p>}

      <div className="cal-body" data-mode={mode}>
        {mode === 'month' && <MonthGrid start={start} anchor={anchor} byDay={byDay} onItem={openItem} onDay={openDay} />}
        {mode === 'week' && <WeekGrid start={start} days={days} byDay={byDay} onItem={openItem} />}
        {mode === 'list' && <Agenda start={start} byDay={byDay} onEvent={openItem} />}
      </div>

      {selected && <EventPopover event={selected.event} rect={selected.rect} onClose={() => setSelected(null)} />}
    </Page>
  )
}

/* ─── Shared pieces ─────────────────────────────────────────────────────── */

const colorOf = (it: Item) => (it.kind === 'event' ? (it.event.color ?? 'var(--accent)') : 'var(--accent)')

/** One item as a compact chip: a ring for a task (weighted by priority), a dot in its calendar's colour for an event. */
function Chip({ item, onOpen }: { item: Item; onOpen(it: Item, el: HTMLElement): void }) {
  return (
    <button
      className="cal-chip"
      data-kind={item.kind}
      data-skipped={(item.kind === 'event' && item.event.dismissed) || undefined}
      style={{ '--cal-color': colorOf(item) } as CSSProperties}
      onClick={(e) => onOpen(item, e.currentTarget)}
      title={item.allDay ? item.title : `${time(item.start)} · ${item.title}`}
    >
      {item.kind === 'task' ? <span className="cal-ring" data-priority={item.task.priority} aria-hidden="true" /> : <span className="cal-dot" aria-hidden="true" />}
      {!item.allDay && <span className="cal-chip-time">{time(item.start)}</span>}
      <span className="cal-chip-title">{item.title}</span>
    </button>
  )
}

/* ─── Month ─────────────────────────────────────────────────────────────── */

function MonthGrid({ start, anchor, byDay, onItem, onDay }: {
  start: Date
  anchor: Date
  byDay: Map<string, Item[]>
  onItem(it: Item, el: HTMLElement): void
  onDay(d: Date): void
}) {
  const todayIso = toISO(new Date())
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays(start, i).toLocaleDateString(undefined, { weekday: 'short' }))
  return (
    <div className="cal-month">
      <div className="cal-weekdays" aria-hidden="true">{weekdays.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="cal-month-days">
        {Array.from({ length: 42 }, (_, i) => {
          const d = addDays(start, i)
          const iso = toISO(d)
          const list = byDay.get(iso) ?? []
          const shown = list.slice(0, 3)
          return (
            <div
              key={iso}
              className="month-cell"
              data-today={iso === todayIso || undefined}
              data-other={d.getMonth() !== anchor.getMonth() || undefined}
              data-past={iso < todayIso || undefined}
              style={{ '--i': i } as CSSProperties}
            >
              <button className="cal-date" onClick={() => onDay(d)} aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${list.length || 'nothing'} planned`}>
                {d.getDate()}
              </button>
              <div className="cal-chips">
                {shown.map((it) => <Chip key={it.kind + it.id} item={it} onOpen={onItem} />)}
                {list.length > shown.length && <button className="cal-more" onClick={() => onDay(d)}>+{list.length - shown.length} more</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Week ──────────────────────────────────────────────────────────────── */

/** Side-by-side columns for overlapping timed items in one day. */
function lanes(list: Item[]) {
  const placed: { it: Item; lane: number; of: number }[] = []
  let cluster: typeof placed = []
  let ends: number[] = []
  let clusterEnd = 0
  const close = () => {
    const of = ends.length
    for (const p of cluster) p.of = of
    cluster = []
    ends = []
  }
  for (const it of [...list].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const s = it.start.getTime()
    const e = Math.max(it.end.getTime(), s + 30 * 60_000)
    if (s >= clusterEnd && cluster.length) close()
    let lane = ends.findIndex((x) => x <= s)
    if (lane === -1) lane = ends.push(e) - 1
    else ends[lane] = e
    clusterEnd = Math.max(clusterEnd, e)
    const p = { it, lane, of: 1 }
    cluster.push(p)
    placed.push(p)
  }
  close()
  return placed
}

function WeekGrid({ start, days, byDay, onItem }: { start: Date; days: number; byDay: Map<string, Item[]>; onItem(it: Item, el: HTMLElement): void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => new Date())
  const cols = Array.from({ length: days }, (_, i) => addDays(start, i))
  const todayIso = toISO(now)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  // Open at the working day, or just before now when today is in view.
  useLayoutEffect(() => {
    const showsToday = cols.some((d) => toISO(d) === todayIso)
    scroller.current?.scrollTo({ top: Math.max(0, ((showsToday ? minutes(new Date()) / 60 - 1.5 : 7.5) * HOUR)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.getTime()])

  return (
    <div className="cal-week" style={{ '--days': days, '--hour': `${HOUR}px` } as CSSProperties}>
      <div className="cal-week-head">
        <span />
        {cols.map((d) => (
          <div key={toISO(d)} className="cal-col-head" data-today={toISO(d) === todayIso || undefined}>
            <span className="micro">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className="cal-col-date">{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="cal-allday">
        <span className="micro cal-gutter-label">All day</span>
        {cols.map((d) => (
          <div key={toISO(d)} className="cal-allday-cell">
            {(byDay.get(toISO(d)) ?? []).filter((it) => it.allDay).map((it) => <Chip key={it.kind + it.id} item={it} onOpen={onItem} />)}
          </div>
        ))}
      </div>
      <div className="cal-week-body" ref={scroller}>
        <div className="cal-hours" aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} style={{ top: h * HOUR }}>{h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}</span>
          ))}
        </div>
        {cols.map((d) => {
          const iso = toISO(d)
          const timed = (byDay.get(iso) ?? []).filter((it) => !it.allDay)
          return (
            <div key={iso} className="cal-col" data-today={iso === todayIso || undefined}>
              {lanes(timed).map(({ it, lane, of }) => {
                const startMin = sameDay(it.start, d) ? minutes(it.start) : 0
                const endMin = sameDay(it.end, d) ? Math.max(minutes(it.end), startMin + 30) : 24 * 60
                return (
                  <button
                    key={it.kind + it.id}
                    className="cal-block"
                    data-kind={it.kind}
                    data-short={endMin - startMin < 45 || undefined}
                    style={{
                      top: (startMin / 60) * HOUR,
                      height: Math.max(22, ((endMin - startMin) / 60) * HOUR - 2),
                      left: `calc(${(lane / of) * 100}% + 2px)`,
                      width: `calc(${100 / of}% - 4px)`,
                      '--cal-color': colorOf(it),
                    } as CSSProperties}
                    onClick={(e) => onItem(it, e.currentTarget)}
                  >
                    <span className="cal-block-title">{it.title}</span>
                    <span className="cal-block-time">{time(it.start)}</span>
                  </button>
                )
              })}
              {iso === todayIso && <span className="cal-now" style={{ top: (minutes(now) / 60) * HOUR }} aria-hidden="true" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── List ──────────────────────────────────────────────────────────────── */

function Agenda({ start, byDay, onEvent }: { start: Date; byDay: Map<string, Item[]>; onEvent(it: Item, el: HTMLElement): void }) {
  const todayIso = toISO(new Date())
  const daysWith = Array.from({ length: LIST_DAYS }, (_, i) => toISO(addDays(start, i))).filter((iso) => byDay.has(iso) || iso === todayIso)
  if (!daysWith.length)
    return (
      <div className="empty">
        <h2>A clear stretch.</h2>
        <p>Nothing is planned for these 30 days. Dated tasks and calendar events land here.</p>
      </div>
    )
  return (
    <>
      {daysWith.map((iso) => (
        <section key={iso} className="group">
          <header className="group-head"><h2>{formatDayHeading(iso)}</h2></header>
          <div className="task-list" role="list">
            {(byDay.get(iso) ?? []).map((it) =>
              it.kind === 'task' ? <TaskItem key={it.id} task={it.task} showProject /> : <EventRow key={it.id} item={it} onOpen={onEvent} />,
            )}
            {!byDay.has(iso) && <p className="cal-quiet">Nothing planned today.</p>}
          </div>
        </section>
      ))}
    </>
  )
}

function useEventActions(event: PickableEvent) {
  const toast = useUI((s) => s.toast)
  const [working, setWorking] = useState(false)
  const run = (fn: () => Promise<unknown>, done?: string) => {
    setWorking(true)
    fn().then(() => done && toast(done), (e: Error) => toast(e.message)).finally(() => setWorking(false))
  }
  return {
    working,
    add: () => run(() => pickEvent(event.key), `Added “${event.title}” to your Inbox`),
    skip: () => run(() => dismissEvent(event.key)),
    restore: () => run(() => dismissEvent(event.key, true)),
  }
}

function EventActions({ event, children }: { event: PickableEvent; children?: ReactNode }) {
  const { working, add, skip, restore } = useEventActions(event)
  return (
    <span className="cal-event-actions">
      {children}
      {event.link && (
        <a className="icon-btn" href={event.link} target="_blank" rel="noopener" aria-label={`Open “${event.title}” in Google Calendar`} title="Open in Google Calendar">
          <ExternalLink size={15} />
        </a>
      )}
      {event.dismissed ? (
        <button className="btn btn-secondary btn-sm" disabled={working} onClick={restore}><Undo2 size={14} /> Bring Back</button>
      ) : (
        <>
          <button className="btn btn-secondary btn-sm" disabled={working} onClick={skip}>Skip</button>
          <button className="btn btn-primary btn-sm" disabled={working} onClick={add}><Plus size={14} /> Add</button>
        </>
      )}
    </span>
  )
}

function EventRow({ item, onOpen }: { item: Extract<Item, { kind: 'event' }>; onOpen(it: Item, el: HTMLElement): void }) {
  const e = item.event
  return (
    <div role="listitem" className="cal-event-row" data-skipped={e.dismissed || undefined} style={{ '--cal-color': colorOf(item) } as CSSProperties}>
      <span className="cal-dot" aria-hidden="true" />
      <button className="cal-event-main" onClick={(ev) => onOpen(item, ev.currentTarget)}>
        <span className="cal-event-title">{e.title}</span>
        <span className="micro">{e.allDay ? 'All day' : `${time(item.start)} – ${time(item.end)}`} · {e.calendar}</span>
      </button>
      <EventActions event={e} />
    </div>
  )
}

/* ─── Event details ─────────────────────────────────────────────────────── */

function EventPopover({ event, rect, onClose }: { event: PickableEvent; rect: DOMRect; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const start = eventStart(event)
  const end = eventEnd(event)

  useLayoutEffect(() => {
    const el = ref.current!
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - w / 2), innerWidth - w - 12)
    const below = rect.bottom + 8
    setPos({ left, top: below + h > innerHeight - 12 ? Math.max(12, rect.top - h - 8) : below })
    el.focus()
  }, [rect])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose()
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="cal-popover"
      role="dialog"
      aria-label={event.title}
      tabIndex={-1}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, '--cal-color': event.color ?? 'var(--accent)' } as CSSProperties}
    >
      <p className="cal-popover-cal micro"><span className="cal-dot" aria-hidden="true" /> {event.calendar}</p>
      <h3>{event.title}</h3>
      <p className="cal-popover-when">
        {start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        {!event.allDay && <> · {time(start)} – {time(end)}</>}
      </p>
      <EventActions event={event} />
    </div>
  )
}
