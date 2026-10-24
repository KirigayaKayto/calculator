import { describe, it, expect } from 'vitest'
import {
  evaluateProgrammer,
  formatRadix,
  groupDigits,
  characterOf,
  flipBit,
  bitAt,
  isDigit,
  type Radix,
  type Word,
} from '../src/engine/programmer'

const I32: Word = { bits: 32, signed: true }
const U8: Word = { bits: 8, signed: false }
const I8: Word = { bits: 8, signed: true }

function run(text: string, radix: Radix = 10, w: Word = I32) {
  try {
    return evaluateProgrammer(text, radix, w)
  } catch (e) {
    return `ERR: ${(e as Error).message}`
  }
}

describe('programmer calculator', () => {
  it('reads numbers in every radix and with prefixes', () => {
    expect(run('FF', 16)).toBe(255n)
    expect(run('0x1F + 0b101 + 0o17 + 10')).toBe(31n + 5n + 15n + 10n)
    expect(run('1010', 2)).toBe(10n)
    expect(run('777', 8)).toBe(511n)
    // in hex, 0B1 is a number, not a binary prefix
    expect(run('0B1', 16)).toBe(0xb1n)
    expect(run('12', 2)).toBe('ERR: “2” is not a BIN digit')
    expect(run('A', 10)).toBe('ERR: “A” is not a DEC digit')
    expect(run('', 10)).toBeNull()
  })

  it('follows C precedence', () => {
    expect(run('2 + 3 * 4')).toBe(14n)
    expect(run('1 << 2 + 1')).toBe(8n)
    expect(run('6 AND 3 OR 8')).toBe(10n)
    expect(run('6 & 3 | 8 ^ 8')).toBe(2n)
    expect(run('(2 + 3) * 4')).toBe(20n)
    expect(run('(2 + 3')).toBe(5n)
    expect(run('NOT 0')).toBe(-1n)
    expect(run('-7 / 2')).toBe(-3n)
    expect(run('-7 MOD 2')).toBe(-1n)
    expect(run('17 % 5')).toBe(2n)
  })

  it('wraps around the word', () => {
    expect(run('255 + 1', 10, U8)).toBe(0n)
    expect(run('127 + 1', 10, I8)).toBe(-128n)
    expect(run('NOT 0', 10, U8)).toBe(255n)
    expect(run('0 - 1', 10, U8)).toBe(255n)
    expect(run('1 << 40', 10, I32)).toBe(0n)
    expect(run('1 << 1000000000', 10, I32)).toBe(0n)
    expect(run('5 NAND 3', 10, U8)).toBe(0xfen)
    expect(run('5 NOR 3', 10, U8)).toBe(0xf8n)
  })

  it('shifts and rotates', () => {
    expect(run('-16 >> 2', 10, I32)).toBe(-4n)
    expect(run('0xF0 >> 4', 10, U8)).toBe(0x0fn)
    expect(run('0x81 ROL 1', 10, U8)).toBe(0x03n)
    expect(run('0x81 ROR 1', 10, U8)).toBe(0xc0n)
    expect(run('0x81 ROL 8', 10, U8)).toBe(0x81n)
    expect(run('1 SHL -1')).toBe('ERR: Shift by a negative count')
  })

  it('reports mistakes', () => {
    expect(run('5 / 0')).toBe('ERR: Division by zero')
    expect(run('5 +')).toBe('ERR: Incomplete expression')
    expect(run('5 6')).toBe('ERR: Missing operator')
    expect(run('5)')).toBe('ERR: Too many closing parentheses')
  })

  it('shows the word in each radix', () => {
    expect(formatRadix(-1n, 16, I8)).toBe('FF')
    expect(formatRadix(-1n, 10, I8)).toBe('-1')
    expect(formatRadix(10n, 2, I32)).toBe('1010')
    expect(groupDigits('1010', 2)).toBe('1010')
    expect(groupDigits('101', 2)).toBe('0101')
    expect(groupDigits('11111111', 2)).toBe('1111 1111')
    expect(groupDigits('1234567', 10)).toBe('1 234 567')
    expect(groupDigits('-1234', 10)).toBe('-1 234')
    expect(groupDigits('DEADBEEF', 16)).toBe('DEAD BEEF')
  })

  it('flips bits and names characters', () => {
    expect(flipBit(0n, 7, I8)).toBe(-128n)
    expect(flipBit(0n, 7, U8)).toBe(128n)
    expect(bitAt(-1n, 31, I32)).toBe(true)
    expect(bitAt(4n, 1, I32)).toBe(false)
    expect(characterOf(0x41n)).toBe('A')
    expect(characterOf(10n)).toBe('LF')
    expect(characterOf(0x1f600n)).toBe('😀')
    expect(characterOf(-1n)).toBeNull()
    expect(isDigit('F', 16)).toBe(true)
    expect(isDigit('8', 8)).toBe(false)
  })
})
