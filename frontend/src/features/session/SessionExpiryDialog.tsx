import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SESSION_EXPIRY_GRACE_MS, SESSION_WARNING_LEAD_MS } from '@/constants/session'
import { useAuth } from '@/hooks/useAuth'
import { ApiError, getSessionTiming } from '@/services/api/httpClient'
import { formatCountdown, sessionCountdown, type SessionCountdown } from '@/utils/session'

/**
 * "Your session will expire in 4:59." — shown once the sign-in is within
 * SESSION_WARNING_LEAD_MS of running out, whichever limit that is.
 *
 * Purely a courtesy. The backend expires the token on its own schedule and
 * refuses it with a 401 whether or not this dialog ever appears; this only
 * gives the user the chance to keep working, and signs the tab out cleanly
 * once the deadline passes so it never sits showing data it can no longer
 * load.
 *
 * Timing is read from localStorage on every tick, so every open tab shows
 * the same countdown and "Continue session" in one tab closes the dialog in
 * all of them.
 *
 * When the 8-hour limit is the one running out there is no "Continue
 * session": renewing the idle timer cannot move it, and offering the button
 * would promise something the backend will refuse.
 *
 * Mounted by AuthProvider only while a user is signed in.
 */
export function SessionExpiryDialog() {
  const { keepAlive, expireSession, logout } = useAuth()
  const [countdown, setCountdown] = useState<SessionCountdown | null>(null)
  const [dismissedDeadline, setDismissedDeadline] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const expiring = useRef(false)

  useEffect(() => {
    const tick = () => {
      const timing = getSessionTiming()
      if (!timing) {
        setCountdown(null)
        return
      }

      const next = sessionCountdown(timing, Date.now())
      setCountdown(next)

      if (next.remainingMs <= -SESSION_EXPIRY_GRACE_MS && !expiring.current) {
        expiring.current = true
        void expireSession()
      }
    }

    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [expireSession])

  const open =
    countdown !== null &&
    countdown.remainingMs <= SESSION_WARNING_LEAD_MS &&
    countdown.remainingMs > 0 &&
    countdown.deadline !== dismissedDeadline

  const continueSession = async () => {
    setBusy(true)
    try {
      await keepAlive()
    } catch (error) {
      // A 401 has already signed the tab out; anything else is worth saying.
      if (!(error instanceof ApiError && error.status === 401)) {
        toast.error('Could not reach the server to continue your session.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!countdown) return null

  const absolute = countdown.limit === 'absolute'
  const remaining = formatCountdown(countdown.remainingMs)

  return (
    <Dialog
      open={open}
      headerText={absolute ? 'Sign-in time limit reached' : 'Your session is about to expire'}
      state="Critical"
      onClose={() => !busy && setDismissedDeadline(countdown.deadline)}
      footer={
        <Bar
          design="Footer"
          endContent={
            absolute ? (
              <>
                <Button variant="ghost" onClick={() => void logout()}>
                  Log out now
                </Button>
                <Button onClick={() => setDismissedDeadline(countdown.deadline)}>OK</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => void logout()} disabled={busy}>
                  Log out
                </Button>
                <Button loading={busy} onClick={continueSession}>
                  Continue session
                </Button>
              </>
            )
          }
        />
      }
    >
      <div className="text-[0.8125rem] leading-relaxed text-muted-foreground">
        {absolute ? (
          <>
            You have been signed in for the maximum time allowed. You will be signed out in{' '}
            <strong className="font-medium text-foreground tabular-nums">{remaining}</strong>. Save any unsaved
            work, then log in again to continue.
          </>
        ) : (
          <>
            Your session will expire in{' '}
            <strong className="font-medium text-foreground tabular-nums">{remaining}</strong> because of
            inactivity.
          </>
        )}
      </div>
    </Dialog>
  )
}
