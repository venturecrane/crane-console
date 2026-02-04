import { describe, it, expect } from 'vitest'
import { hello } from '../src/index'

describe('hello', () => {
  it('returns greeting', () => {
    expect(hello()).toBe('Hello from venture-template!')
  })
})
