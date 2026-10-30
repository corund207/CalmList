/**
 * Every version of CalmList, newest first, with what's new in it. The first entry is the running version;
 * package.json carries the same number (a test checks). Each release, major, minor or patch, adds an entry here.
 */
export interface Release {
  version: string
  date: string // YYYY-MM-DD
  title: string
  notes: string[]
}

export const RELEASES: Release[] = [
  {
    version: '1.2.0',
    date: '2026-10-29',
    title: 'Your calendar, both ways',
    notes: [
      'A new Calendar shows tasks and Google events together, by date and time: a month at a glance, a week of hours, or a list.',
      'The CalmList calendar in Google syncs both ways: add or move an event there, on any device, and the task follows.',
      'Events from your other Google calendars show up too. Add the ones you want as tasks, skip the rest.',
      'Sync runs on the server, so it keeps going with the app closed, with no hourly reconnect. Open apps update the moment anything changes.',
      'Motion throughout: finishing a task fills its circle with a little burst, pages settle in, the calendar slides through time, and a new theme spreads from where you click.',
      'Version numbers and this What’s New, after every update and in Settings → General.',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-10-29',
    title: 'Dictation that works',
    notes: [
      'On-device dictation (Whisper) works in the hosted app: its speech engine now loads from CalmList itself.',
      '“At 3 p.m.” and “Dr. Lee” no longer cut a task in half.',
      'Browser dictation keeps your last words, stops repeating phrases on phones, and switches to Whisper where the browser can’t listen, like the iPhone home-screen app.',
      'The Whisper model downloads while you talk, and recording shows a timer.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-29',
    title: 'A home of its own',
    notes: [
      'CalmList moved to calmlist.jonahchang.com. The old addresses forward here, offering a download of anything kept in that browser.',
      'Install it like an app: Add to Home Screen on iPhone and iPad, or Install in Chrome, Edge and Safari. It starts even offline.',
      'Long-press the icon for shortcuts to Today, Inbox and Upcoming.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-23',
    title: 'CalmList',
    notes: [
      'Quick Add that reads dates, times, priorities, projects and labels as you type.',
      'Today, Upcoming, projects as lists or boards, sub-tasks, filters and a command palette.',
      '48 themes, free on-device AI (Ramble, Task Assist, Filter Assist), and connectors for Claude and ChatGPT.',
      'Sync through Supabase or a CalmList server, plus apps for Mac, Windows and iOS.',
    ],
  },
]

export const VERSION = RELEASES[0].version

/** Releases newer than the one this device last saw, newest first. */
export const releasesSince = (seen: string | null) => {
  const i = RELEASES.findIndex((r) => r.version === seen)
  return i === -1 ? RELEASES.slice(0, 1) : RELEASES.slice(0, i)
}
