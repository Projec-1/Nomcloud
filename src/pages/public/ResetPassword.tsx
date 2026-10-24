import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle as CheckCircle2, Eye, EyeSlash as EyeOff, Lock, ShieldWarning as ShieldAlert } from '@phosphor-icons/react'
import AuthLayout from '@/components/layout/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { recoveryLanding } from '@/lib/recoveryLanding'
import { errorMessage } from '@/utils/errorMessage'
import { MIN_PASSWORD_LENGTH, isValidPassword } from '@/utils/validators'

// ---------------------------------------------------------------------------
// Setting a new password after following the recovery link.
//
// THE SESSION IS SUPABASE'S, NOT OURS. Following the link signs the person in
// with a recovery session; `supabase.auth.updateUser({ password })` is the real
// password-change call and it acts on exactly that session. Nothing here
// invents a token, a reset record or a second account system.
//
// WHY A FORM IS NOT SHOWN BY DEFAULT. A password field that quietly does
// nothing is worse than an honest refusal, so the form appears only when this
// page was genuinely opened by a recovery link AND a session exists. Somebody
// who simply types /reset-password — including a signed-in user — gets the
// invalid-link message instead, because they hold no recovery session and the
// update would either fail or change the wrong account's password.
//
// AFTER A SUCCESSFUL CHANGE the recovery session is signed out deliberately.
// It was granted by an emailed link, not by the new password, so leaving it
// open would mean the link kept working as a login for the rest of its life.
// ---------------------------------------------------------------------------

type Status = 'checking' | 'ready' | 'saving' | 'invalid' | 'done'

/** How long to wait for supabase-js to turn the fragment into a session. */
const SESSION_WAIT_MS = 8000

export default function ResetPassword() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('checking')
  const [invalidReason, setInvalidReason] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const settle = (next: Status, reason?: string) => {
      if (cancelled) return
      setStatus((current) => (current === 'checking' ? next : current))
      if (reason) setInvalidReason(reason)
    }

    // The link itself was refused by Supabase (expired, already used, tampered).
    if (recoveryLanding.errorDescription) {
      settle('invalid', recoveryLanding.errorDescription)
      return
    }
    // Opened directly, with no recovery link behind it.
    if (!recoveryLanding.isRecovery) {
      settle('invalid')
      return
    }

    // A real recovery arrival: wait for the client to store the session. The
    // event may already have fired before this mounted, so the poll below is
    // what actually decides, and the subscription only makes it quicker.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle('ready')
    })

    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return
        if (data.session) {
          window.clearInterval(timer)
          settle('ready')
        } else if (Date.now() - startedAt > SESSION_WAIT_MS) {
          window.clearInterval(timer)
          settle('invalid')
        }
      })
    }, 250)

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
      window.clearInterval(timer)
    }
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!isValidPassword(password)) {
      setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Both passwords must match.')
      return
    }

    setStatus('saving')
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setStatus('ready')
      setError(errorMessage(updateError))
      return
    }

    // The emailed link must not keep working as a way in. See the header.
    await supabase.auth.signOut()
    setStatus('done')
  }

  if (status === 'checking') {
    return (
      <AuthLayout title="Checking your link" subtitle="One moment.">
        <p className="text-sm text-graphite">Verifying your password reset link…</p>
      </AuthLayout>
    )
  }

  if (status === 'invalid') {
    return (
      <AuthLayout title="Reset link not valid" subtitle="Nothing has been changed.">
        <div className="flex gap-3 rounded-2xl bg-red-500/10 px-4 py-3.5">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-500">This password reset link is invalid or has expired.</p>
            {invalidReason && <p className="mt-1 text-xs text-red-500/80">{invalidReason}</p>}
          </div>
        </div>
        <p className="mt-5 text-sm text-graphite">
          Request a new link from the sign-in page. Each link works once and expires.
        </p>
        <Link to="/login" className="btn-primary mt-6 w-full px-8 py-4 text-base">
          Back to sign in <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthLayout>
    )
  }

  if (status === 'done') {
    return (
      <AuthLayout title="Password updated" subtitle="Your new password is ready to use.">
        <div className="flex gap-3 rounded-2xl bg-green-500/10 px-4 py-3.5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Your password was updated. For your security you have been signed out — please sign in again with your new
            password.
          </p>
        </div>
        <Button size="lg" className="mt-6 w-full" onClick={() => navigate('/login?password=updated', { replace: true })}>
          Go to sign in <ArrowRight className="h-4 w-4" />
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a password you have not used here before.">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Input
          label="New password"
          type={showPassword ? 'text' : 'password'}
          required
          icon={<Lock className="h-4 w-4" />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        <div>
          <Input
            label="Confirm new password"
            type={showPassword ? 'text' : 'password'}
            required
            icon={<Lock className="h-4 w-4" />}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-graphite hover:text-ink dark:hover:text-white"
          >
            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPassword ? 'Hide passwords' : 'Show passwords'}
          </button>
        </div>
        {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-500">{error}</p>}
        <Button type="submit" size="lg" loading={status === 'saving'} className="w-full">
          Update password <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </AuthLayout>
  )
}
