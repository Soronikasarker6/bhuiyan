import type { SessionTiming } from '@/services/api/httpClient'

export interface SessionCountdown {
  /** The earlier of the absolute limit and last activity + idle timeout. */
  deadline: number
  remainingMs: number
  /**
   * Which limit is the one running out. `absolute` means "Continue session"
   * cannot help: renewing the idle timer never moves the hard limit.
   */
  limit: 'idle' | 'absolute'
}

/** Mirrors SessionPolicy::expiresAt() on the backend, on this browser's clock. */
export function sessionCountdown(timing: SessionTiming, now: number): SessionCountdown {
  const idleDeadline = timing.lastActivityAt + timing.idleTimeoutMs
  const limit = timing.absoluteExpiresAt <= idleDeadline ? 'absolute' : 'idle'
  const deadline = Math.min(timing.absoluteExpiresAt, idleDeadline)

  return { deadline, remainingMs: deadline - now, limit }
}

/** 4:05 — minutes and seconds, never negative. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
