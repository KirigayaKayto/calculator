/** Messages between the calculator and the CAS worker (Compute Engine runs off the main thread). */

export type Angle = 'deg' | 'rad'

export interface CasRequest {
  id: number
  latex: string
  angle: Angle
  /** Variables already known to the calculator, as LaTeX: { a: "5" }. */
  vars?: Record<string, string>
  /** For an equation with several letters: the one to solve for. */
  solveFor?: string
}

/** One value: exact LaTeX, and its decimal digits (40 significant) when it is a plain number. */
export interface CasValue {
  exact: string
  approx: string | null
}

export type CasAnswer =
  | ({ kind: 'value'; symbolic: boolean } & CasValue)
  | { kind: 'solutions'; variable: string; solutions: CasValue[] }
  /** An equation with several letters: the person picks which one to solve for. */
  | { kind: 'choose'; variables: string[] }

export type CasResponse =
  | { id: number; ok: true; answer: CasAnswer }
  | { id: number; ok: false; error: string }
  /** Sent once, when the engine has loaded. */
  | { id: 0; ready: true }
