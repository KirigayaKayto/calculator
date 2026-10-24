import type { CasAnswer, CasRequest, CasResponse } from './protocol'

/**
 * The symbolic engine is big, so it is loaded in a worker the first time it is needed,
 * and restarted if a problem takes too long (a hard integral must not freeze the app).
 */
export const cas = $state<{ status: 'idle' | 'loading' | 'ready' }>({ status: 'idle' })

interface Pending {
  resolve: (a: CasAnswer) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

const TIMEOUT_MS = 12_000
/** The first request also waits for the engine to load, which is slow on phones. */
const FIRST_TIMEOUT_MS = 30_000

function start(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  cas.status = 'loading'
  w.onmessage = (e: MessageEvent<CasResponse>) => {
    const msg = e.data
    if ('ready' in msg) {
      cas.status = 'ready'
      return
    }
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    clearTimeout(p.timer)
    if (msg.ok) p.resolve(msg.answer)
    else p.reject(new Error(msg.error))
  }
  return w
}

function restart(reason: string) {
  worker?.terminate()
  worker = null
  cas.status = 'idle'
  for (const p of pending.values()) {
    clearTimeout(p.timer)
    p.reject(new Error(reason))
  }
  pending.clear()
}

/** Ask the engine; rejects with a message for the person if it fails or takes too long. */
export function askCas(request: Omit<CasRequest, 'id'>): Promise<CasAnswer> {
  const firstTime = !worker || cas.status !== 'ready'
  worker ??= start()
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => restart('Took too long'), firstTime ? FIRST_TIMEOUT_MS : TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    worker!.postMessage({ ...request, id } satisfies CasRequest)
  })
}

/** Start loading the engine ahead of time (e.g. when the Calc key page opens). */
export function warmUpCas() {
  worker ??= start()
}
