/** An error whose message is already written for the person using the calculator. */
export class CalcError extends Error {}

/** The formula still has empty boxes (placeholders) to fill. */
export class IncompleteError extends CalcError {
  constructor() {
    super('Fill in the empty boxes')
  }
}
