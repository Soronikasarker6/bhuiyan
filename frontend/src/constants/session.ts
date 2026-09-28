/**
 * Client-side timing for the sign-in session warning.
 *
 * The session lifetimes themselves (8 hours absolute, 60 minutes idle) are
 * NOT here: they live in the backend's `config/auth.php` (`session`) and
 * arrive with every login / `/me` / keep-alive response, so there is exactly
 * one place to change them. The backend alone decides validity — these only
 * decide when the user is told about it.
 */

/** How long before expiry the "Your session will expire" dialog opens. */
export const SESSION_WARNING_LEAD_MS = 5 * 60_000

/**
 * How long past its own computed deadline a tab waits before signing out.
 * The client's clock starts when a response *arrives*, a moment after the
 * server stamped the request, so waiting a little longer guarantees the
 * server has already expired the token by the time the tab says so.
 */
export const SESSION_EXPIRY_GRACE_MS = 3_000

/** Why a sign-in ended — what the login screen tells the user. */
export type SessionEndReason = 'expired' | 'deactivated' | 'signed-out-elsewhere'

export const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  expired: 'Your session has expired. Please log in again.',
  deactivated: 'This account has been deactivated. Contact an administrator.',
  'signed-out-elsewhere': 'You were signed out in another tab. Please log in again.',
}
