import { CalendarDays, CalendarRange, CalendarSync, Inbox, Menu } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { usePrefs } from '../store/prefs'

const TABS = [
  { to: '/today', label: 'Today', Icon: CalendarDays },
  { to: '/inbox', label: 'Inbox', Icon: Inbox },
  { to: '/upcoming', label: 'Upcoming', Icon: CalendarRange },
  { to: '/calendar', label: 'Calendar', Icon: CalendarSync },
]

/** The phone's navigation, under the thumb: the four places people go most, and More for the sidebar's everything else. */
export function TabBar() {
  const { pathname } = useLocation()
  const { sidebar, set } = usePrefs()
  const elsewhere = !TABS.some((t) => t.to === pathname)
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink key={to} viewTransition className="tab" to={to}>
          <Icon size={22} strokeWidth={1.75} />
          <span>{label}</span>
        </NavLink>
      ))}
      <button className="tab" data-active={elsewhere || sidebar || undefined} aria-expanded={sidebar} onClick={() => set({ sidebar: !sidebar })}>
        <Menu size={22} strokeWidth={1.75} />
        <span>More</span>
      </button>
    </nav>
  )
}
