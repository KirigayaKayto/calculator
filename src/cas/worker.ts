/// <reference lib="webworker" />
import { casEvaluate } from './engine'
import type { CasRequest, CasResponse } from './protocol'

const post = (msg: CasResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg)

self.onmessage = (e: MessageEvent<CasRequest>) => {
  const { id, ...request } = e.data
  post({ id, ...casEvaluate(request) })
}

// importing the engine above is the slow part; from here on requests are quick
post({ id: 0, ready: true })
