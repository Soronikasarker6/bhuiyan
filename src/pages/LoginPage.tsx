import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'

/**
 * The only route that exists outside `AppLayout` in the backend-connected
 * build — see `src/router/AppRouter.tsx`. The offline single-file build
 * never renders this at all (there is no backend to sign in to).
 */
export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch {
      setError('Those credentials were not recognised. Check the email and password and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-secondary/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-pop">
        <div className="mb-5 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-primary-700 text-sm font-semibold text-white">
            BI
          </span>
          <h1 className="mt-3 font-display text-lg font-semibold">BHUIYAN INDUSTRY</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Field label="Email" htmlFor="login-email">
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>

          <Field label="Password" htmlFor="login-password" error={error ?? undefined}>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <Button type="submit" className="w-full" disabled={submitting}>
            {/* <LogIn /> */}
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
