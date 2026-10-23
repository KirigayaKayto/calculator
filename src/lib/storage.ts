const PREFIX = 'calc.'

/** Everything is kept only in this browser; storage may be unavailable (private mode), so never throw. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // full or blocked storage: the app keeps working, it just will not remember
  }
}
