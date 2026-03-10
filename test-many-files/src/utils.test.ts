import { describe, it, expect } from 'vitest'

function add(a: number, b: number) {
  return a + b
}

describe('utils', () => {
  it('should add numbers', () => {
    expect(add(2, 3)).toBe(5)
  })
})

// Another test file that should be filtered out