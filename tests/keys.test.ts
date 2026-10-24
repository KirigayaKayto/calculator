import { describe, it, expect } from 'vitest'
import { customKey, KEYS, PAGES, PAGE_SIZE } from '../src/ui/keys'

describe('key layout', () => {
  it('has full pages of known keys', () => {
    for (const page of PAGES) {
      expect(page.keys).toHaveLength(PAGE_SIZE)
      for (const id of page.keys) expect(KEYS[id], `${page.id}: ${id}`).toBeDefined()
    }
  })
  it('makes custom keys whose boxes the cursor visits', () => {
    const k = customKey('custom-1', 'KE', '\\frac{1}{2}\\placeholder{}\\placeholder{}^2')
    expect(k).toMatchObject({ label: 'KE', latex: '\\frac{1}{2}#?#?^2', aria: 'KE' })
    const plain = customKey('custom-2', '', '\\sqrt{\\placeholder{}}')
    expect(plain.labelLatex).toBe('\\sqrt{\\square}')
  })
})
