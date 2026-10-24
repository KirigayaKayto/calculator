/**
 * Physical constants, CODATA 2022. In the formula each one is a LaTeX command of its own
 * (\ConstC) that looks like its textbook symbol (c), so it never clashes with a variable
 * called c: numbers use the value with its unit, the symbolic engine keeps the symbol.
 */
export interface Constant {
  /** The LaTeX command, without the backslash. */
  id: string
  /** How it looks: the textbook symbol. */
  symbol: string
  name: string
  value: string
  /** Unit as the engine writes it ('' for none). */
  unit: string
  /** The value is exact by the definition of the SI units. */
  exact: boolean
}

export const CONSTANTS: Constant[] = [
  { id: 'ConstC', symbol: 'c', name: 'Speed of light in vacuum', value: '299792458', unit: 'm/s', exact: true },
  { id: 'ConstG', symbol: 'G', name: 'Gravitational constant', value: '6.67430e-11', unit: 'm^3/(kg s^2)', exact: false },
  { id: 'ConstH', symbol: 'h', name: 'Planck constant', value: '6.62607015e-34', unit: 'J s', exact: true },
  { id: 'ConstHbar', symbol: '\\hbar', name: 'Reduced Planck constant', value: '1.054571817e-34', unit: 'J s', exact: true },
  { id: 'ConstE', symbol: 'e', name: 'Elementary charge', value: '1.602176634e-19', unit: 'C', exact: true },
  { id: 'ConstKB', symbol: 'k_{\\mathrm{B}}', name: 'Boltzmann constant', value: '1.380649e-23', unit: 'J/K', exact: true },
  { id: 'ConstNA', symbol: 'N_{\\mathrm{A}}', name: 'Avogadro constant', value: '6.02214076e23', unit: 'mol^-1', exact: true },
  { id: 'ConstR', symbol: 'R', name: 'Molar gas constant', value: '8.314462618', unit: 'J/(mol K)', exact: true },
  { id: 'ConstEps', symbol: '\\varepsilon_0', name: 'Vacuum permittivity', value: '8.8541878188e-12', unit: 'F/m', exact: false },
  { id: 'ConstMu', symbol: '\\mu_0', name: 'Vacuum permeability', value: '1.25663706127e-6', unit: 'N/A^2', exact: false },
  { id: 'ConstKe', symbol: 'k_{\\mathrm{e}}', name: 'Coulomb constant', value: '8.9875517862e9', unit: 'N m^2/C^2', exact: false },
  { id: 'ConstMe', symbol: 'm_{\\mathrm{e}}', name: 'Electron mass', value: '9.1093837139e-31', unit: 'kg', exact: false },
  { id: 'ConstMp', symbol: 'm_{\\mathrm{p}}', name: 'Proton mass', value: '1.67262192595e-27', unit: 'kg', exact: false },
  { id: 'ConstMn', symbol: 'm_{\\mathrm{n}}', name: 'Neutron mass', value: '1.67492750056e-27', unit: 'kg', exact: false },
  { id: 'ConstAmu', symbol: 'm_{\\mathrm{u}}', name: 'Atomic mass constant', value: '1.66053906892e-27', unit: 'kg', exact: false },
  { id: 'ConstGn', symbol: 'g', name: 'Standard gravity', value: '9.80665', unit: 'm/s^2', exact: true },
  { id: 'ConstSigma', symbol: '\\sigma', name: 'Stefan–Boltzmann constant', value: '5.670374419e-8', unit: 'W/(m^2 K^4)', exact: true },
  { id: 'ConstF', symbol: 'F', name: 'Faraday constant', value: '96485.33212', unit: 'C/mol', exact: true },
  { id: 'ConstBohr', symbol: 'a_0', name: 'Bohr radius', value: '5.29177210544e-11', unit: 'm', exact: false },
  { id: 'ConstRydberg', symbol: 'R_{\\infty}', name: 'Rydberg constant', value: '10973731.568157', unit: 'm^-1', exact: false },
]

export const CONSTANT_BY_ID: Record<string, Constant> = Object.fromEntries(CONSTANTS.map((c) => [c.id, c]))

/** For MathLive and static rendering: \ConstC draws as c but stays its own command. */
export const CONSTANT_MACROS = Object.fromEntries(
  CONSTANTS.map((c) => [c.id, { def: `{${c.symbol}}`, expand: false, captureSelection: true }]),
)

/** The name a constant has in the numeric engine's scope. */
export const constantVar = (id: string) => `const_${id}`

/** The textbook symbols in place of the constants, for the symbolic engine: E = mc², solve for m. */
export function constantsAsSymbols(latex: string): string {
  return latex.replace(/\\(Const[A-Za-z]+)(?![A-Za-z])/g, (all, id: string) => {
    const c = CONSTANT_BY_ID[id]
    return c ? `{${c.symbol}}` : all
  })
}
