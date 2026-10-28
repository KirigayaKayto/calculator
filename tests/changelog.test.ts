import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import changelog from '../src/changelog.json'
import pkg from '../package.json'

const icons = new Set(
  [...readFileSync(new URL('../src/ui/Icon.svelte', import.meta.url), 'utf8').matchAll(/^\s+'?([a-z-]+)'?:\s/gm)].map((m) => m[1]),
)

describe('changelog', () => {
  it('starts with the version being built', () => {
    expect(changelog[0].version).toBe(pkg.version)
  })
  it('lists releases newest first with dates and highlights', () => {
    const versions = changelog.map((r) => r.version)
    const key = (v: string) => v.split('.').map(Number)
    for (let i = 1; i < versions.length; i++) {
      const [a, b] = [key(versions[i - 1]), key(versions[i])]
      expect(a.some((x, j) => x > b[j]) && !a.some((x, j) => x < b[j] && a.slice(0, j).every((y, k) => y === b[k]))).toBe(true)
    }
    for (const r of changelog) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(r.date))).toBe(false)
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.highlights.length).toBeGreaterThan(0)
      for (const h of r.highlights) {
        expect(h.title.length).toBeGreaterThan(0)
        expect(h.text.length).toBeGreaterThan(0)
        expect(icons.has(h.icon), `icon "${h.icon}" exists`).toBe(true)
      }
    }
  })
})
