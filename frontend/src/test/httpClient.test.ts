import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getToken, onTokenChange, setToken } from '@/services/api/httpClient'

/**
 * Token bookkeeping — specifically, when listeners are told about it.
 *
 * `useAppData` and `useCompanyProfile` both refetch when the token changes.
 * That makes `setToken` notifying on a *non*-change the whole ingredient list
 * for a runaway loop: a 401 clears an already-absent token, the clear is
 * announced anyway, both providers refetch, the refetch 401s, and round it
 * goes. It happened in production — 294 requests on one page load — so the
 * "only a real change is a change" rule is pinned down here.
 */
describe('setToken notifications', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('notifies when a session starts', () => {
    const listener = vi.fn()
    const off = onTokenChange(listener)

    setToken('a-real-token')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getToken()).toBe('a-real-token')
    off()
  })

  it('notifies when a session ends', () => {
    setToken('a-real-token')
    const listener = vi.fn()
    const off = onTokenChange(listener)

    setToken(null)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getToken()).toBeNull()
    off()
  })

  it('stays silent when clearing a token that was never there', () => {
    const listener = vi.fn()
    const off = onTokenChange(listener)

    // This is the exact call a 401 on an unauthenticated request makes.
    setToken(null)
    setToken(null)
    setToken(null)

    expect(listener).not.toHaveBeenCalled()
    off()
  })

  it('stays silent when re-writing the token it already holds', () => {
    setToken('a-real-token')
    const listener = vi.fn()
    const off = onTokenChange(listener)

    setToken('a-real-token')

    expect(listener).not.toHaveBeenCalled()
    off()
  })

  it('stops listening once unsubscribed', () => {
    const listener = vi.fn()
    onTokenChange(listener)()

    setToken('a-real-token')

    expect(listener).not.toHaveBeenCalled()
  })
})
