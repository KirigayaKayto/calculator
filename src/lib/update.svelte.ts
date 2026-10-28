/**
 * Updates the person controls. The service worker is registered in "prompt" mode: a new
 * version downloads in the background and then waits until "Update" is chosen (or "Later").
 * The app never reloads by itself in the middle of a calculation.
 */
import { registerSW } from 'virtual:pwa-register'
import changelog from '../changelog.json'

export interface Highlight {
  icon: string
  title: string
  text: string
  /** A formula to show with it, as LaTeX. */
  latex?: string
}

export interface Release {
  version: string
  date: string
  title: string
  highlights: Highlight[]
}

/** Every release, newest first (src/changelog.json). */
export const RELEASES = changelog as Release[]
export const APP_VERSION = __APP_VERSION__
export const BUILD_TIME = __BUILD_TIME__

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'updating' | 'upToDate' | 'offline' | 'error'

export const update = $state<{
  status: UpdateStatus
  /** What the waiting version brings, when the server could be asked. */
  next: Release | null
  /** "Later" was chosen: the banner stays away until the next launch. */
  dismissed: boolean
}>({ status: 'idle', next: null, dismissed: false })

let registration: ServiceWorkerRegistration | undefined
let skipWaiting: (() => Promise<void>) | null = null
let resetTimer: ReturnType<typeof setTimeout> | undefined

/** "1.10.0" after "1.9.2": compare version numbers part by part. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** Register the service worker and keep an eye out for new versions. Call once, at start. */
export function setupUpdates() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const check = () => registration?.update().catch(() => {})
  skipWaiting = registerSW({
    immediate: true,
    onNeedRefresh: () => void available(),
    onRegisteredSW(_url, r) {
      registration = r
      if (r?.waiting) void available()
      // look again now and then, and whenever the app comes back to the front or online
      setInterval(check, 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
    },
    onRegisterError() {
      // no service worker here (the dev server): nothing to update
    },
  })
}

async function available() {
  if (update.status === 'available') return
  update.status = 'available'
  update.dismissed = false
  update.next = await nextRelease()
}

/** The newest release after this one, read from the server (null when offline). */
async function nextRelease(): Promise<Release | null> {
  try {
    const res = await fetch('./changelog.json', { cache: 'no-store' })
    if (!res.ok) return null
    const releases = (await res.json()) as Release[]
    return releases.find((r) => compareVersions(r.version, APP_VERSION) > 0) ?? null
  } catch {
    return null
  }
}

function resetSoon() {
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    if (update.status !== 'available' && update.status !== 'updating') update.status = 'idle'
  }, 3000)
}

/** "Check for updates" in the settings. */
export async function checkForUpdates() {
  if (update.status === 'available' || update.status === 'updating' || update.status === 'checking') return
  if (!navigator.onLine) {
    update.status = 'offline'
    return resetSoon()
  }
  if (!registration) {
    update.status = 'error'
    return resetSoon()
  }
  update.status = 'checking'
  try {
    await registration.update()
    const installing = registration.installing
    if (installing) {
      // a new version is downloading: wait for it to be ready (the "waiting" event follows)
      await new Promise<void>((resolve) => {
        const done = () => {
          if (installing.state !== 'installing') resolve()
        }
        installing.addEventListener('statechange', done)
        setTimeout(resolve, 8000)
      })
    }
    if (update.status === 'checking') {
      if (registration.waiting) await available()
      else {
        update.status = 'upToDate'
        resetSoon()
      }
    }
  } catch {
    update.status = navigator.onLine ? 'error' : 'offline'
    resetSoon()
  }
}

/** "Update": the new version takes over and the page reloads (everything is saved already). */
export async function applyUpdate() {
  if (!skipWaiting) return
  update.status = 'updating'
  try {
    await skipWaiting()
  } catch {
    update.status = 'error'
    return resetSoon()
  }
  // the registration reloads the page when the new worker takes control; just in case it does not
  setTimeout(() => location.reload(), 5000)
}

/** "Later": the new version keeps waiting; the banner comes back at the next launch. */
export function dismissUpdate() {
  update.dismissed = true
}
