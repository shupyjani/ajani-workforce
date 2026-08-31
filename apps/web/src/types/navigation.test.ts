import { describe, expect, it } from 'vitest'
import { roleDefinitions, roleNavigation } from './navigation'

describe('typed role navigation', () => {
  it('provides unique, purposeful routes for every preview role', () => {
    for (const role of Object.keys(roleDefinitions) as (keyof typeof roleDefinitions)[]) {
      const items = roleNavigation[role]
      const paths = items.map((item) => item.to)

      expect(items.length).toBeGreaterThanOrEqual(3)
      expect(new Set(paths).size).toBe(paths.length)
      expect(paths).toContain(roleDefinitions[role].landingPath)
      expect(items.every((item) => item.description.length > 0)).toBe(true)
    }
  })
})
