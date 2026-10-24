import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeSlash as EyeOff, Key as KeyRound, Lock, ShieldWarning as ShieldAlert } from '@phosphor-icons/react'
import AuthLayout from '@/components/layout/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { recoveryLanding } from '@/lib/recoveryLanding'
import { useAuth } from '@/context/AuthContext'
import { claimPendingInvitation, type InvitationAcceptanceOutcome } from '@/services/invitationService'
import { fetchActiveMemberships } from '@/services/identityService'
import { workspacesForMembershipRoles } from '@/lib/roles'
import { errorMessage } from '@/utils/errorMessage'
import { MIN_PASSWORD_LENGTH, isValidPassword } from '@/utils/validators'

// ---------------------------------------------------------------------------
// Activating an account from the emailed link.
//
// WHAT THE LINK IS. Supabase Auth's own invite (or recovery) link. Following it
// opens a session for exactly the invited address and puts the result in the URL
// fragment, never a query string. Supabase owns the link's single use and its
// expiry, so no second token system exists: the school, role and memberships
// were already created by approval, and the only thing missing is a password
// that nobody but its owner has ever seen.
//
// WHY A FORM IS NOT SHOWN BY DEFAULT. The same rule the reset screen follows: a
// password field that cannot save is worse than an honest refusal. The form
// appears only when this page was opened by a real link AND a session exists.
// Expired, already used and tampered links each get their own sentence.
//
// AFTER ACTIVATION the person stays signed in and goes to their workspace: they
// have just proved they own the mailbox and chosen the password themselves, so
// asking them to type it again would be ceremony, not security.
// ---------------------------------------------------------------------------

type Status = 'checking' | 'ready' | 'saving' | 'invalid' | 'blocked'

/** How long to wait for supabase-js to turn the fragment into a session. */
const SESSION_WAIT_MS = 8000

export default function ActivateAccount() {
  const navigate = useNavigate()
  const { authState, school, memberships, displayName, refreshIdentity } = useAuth()
  const [status, setStatus] = useState<Status>('checking')
  const [invalidReason, setInvalidReason] = useState<string | null>(null)
  // WHY the invitation could not be claimed. accept_pending_invitation now
  // reports the real reason — cancelled, expired, already used — instead of
  // lumping them all into "not found", so this screen can say something true.
  const [claimOutcome, setClaimOutcome] = useState<InvitationAcceptanceOutcome | null>(null)
  // The signed-in address, read from the session rather than from AuthContext.
  // An account with no profile yet makes AuthContext report 'error' and clear
  // authUser, which is exactly the case where naming the address matters most:
  // seeing it is how somebody realises they are signed in as the wrong person.
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const settle = (next: Status, reason?: string) => {
      if (cancelled) return
      setStatus((current) => (current === 'checking' ? next : current))
      if (reason) setInvalidReason(reason)
    }

    // Supabase refused the link itself: expired, already used, or tampered with.
    if (recoveryLanding.errorDescription) {
      settle('invalid', recoveryLanding.errorDescription)
      return
    }
    // Opened directly, with no activation link behind it.
    if (!recoveryLanding.isActivation) {
      settle('invalid')
      return
    }

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

  // A teacher or guardian arrives with no membership yet — and no profile
  // either, because accept_invitation is what creates one. AuthContext cannot
  // resolve an identity for them and reports 'error', which is correct and is
  // NOT a reason to wait: the claim below is exactly what turns this account
  // into a member. So it runs as soon as a session exists, whatever the
  // identity state, and the identity is then re-read.
  //
  // An administrator activating already has profile and memberships from
  // approval, so the call finds nothing pending and changes nothing.
  const [claimed, setClaimed] = useState(false)
  useEffect(() => {
    if (status !== 'ready' || claimed) return
    let cancelled = false
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setSessionEmail(data.user?.email ?? null)
    })
    void claimPendingInvitation()
      .then((outcome) => {
        if (!cancelled) setClaimOutcome(outcome)
        if (outcome === 'accepted') refreshIdentity()
      })
      .catch(() => {
        // The call itself failed, which is not the same as being refused; the
        // screen falls back to its most general message rather than inventing
        // a reason.
      })
      .finally(() => {
        if (!cancelled) setClaimed(true)
      })
    return () => {
      cancelled = true
    }
  }, [status, claimed, refreshIdentity])

  // The link itself worked, but this account ended up connected to no school.
  // 'error' counts too — that is what an account with no profile looks like
  // once the claim has found nothing to claim.
  useEffect(() => {
    if (status !== 'ready' || !claimed) return
    if (authState === 'ready' && memberships.length === 0) setStatus('blocked')
    if (authState === 'error') setStatus('blocked')
  }, [status, authState, claimed, memberships.length])

  const roleLabel = (() => {
    const roles = memberships.map((membership) => membership.role)
    if (roles.includes('administrator')) return 'Administrator'
    if (roles.includes('owner')) return 'Owner'
    if (roles.includes('teacher')) return 'Teacher'
    if (roles.includes('guardian')) return 'Parent'
    return roles[0] ? `${roles[0][0].toUpperCase()}${roles[0].slice(1)}` : ''
  })()

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

    // Where to send them is decided from a FRESH read, not from `memberships`
    // in this component's state. The claim above populates that list through an
    // async identity refresh, and somebody who types a password quickly can
    // submit before it lands — which sent newly activated people to /login
    // instead of their workspace, making activation look like it had failed.
    // The session is already valid here, so one authoritative read settles it.
    let roles = memberships.map((membership) => membership.role)
    try {
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        const fresh = await fetchActiveMemberships(data.user.id)
        if (fresh.length > 0) roles = fresh.map((membership) => membership.role)
      }
    } catch {
      // Fall back to whatever state already holds; the worst case is the
      // sign-in screen, which is where the old code always ended up.
    }

    const workspace = workspacesForMembershipRoles(roles)[0]
    navigate(workspace ? `/app/${workspace}` : '/login', { replace: true })
  }

  if (status === 'checking') {
    return (
      <AuthLayout title="Checking your link" subtitle="One moment.">
        <p className="text-sm text-graphite">Verifying your activation link…</p>
      </AuthLayout>
    )
  }

  if (status === 'invalid' || status === 'blocked') {
    // One honest message per real cause. Nothing here blames the person for a
    // decision the school made or for time passing, and none of it claims the
    // link was "invalid" when the link was fine and the invitation was not.
    const { title, headline, advice } = (() => {
      if (status === 'invalid') {
        return {
          title: 'This link has expired',
          headline: 'This activation link no longer works.',
          advice:
            'Activation links last 24 hours and can only be opened once. Ask your school to send you a new one, then open the newest email.',
        }
      }
      switch (claimOutcome) {
        case 'revoked':
          return {
            title: 'This invitation was cancelled',
            headline: 'Your school cancelled this invitation, so it can no longer be used.',
            advice: 'Ask them to invite you again and you will get a fresh email.',
          }
        case 'expired':
          return {
            title: 'This invitation has expired',
            headline: 'This invitation is older than 24 hours, so it can no longer be used.',
            advice: 'Ask your school to invite you again — it only takes them a moment.',
          }
        case 'already_accepted':
        case 'role_already_held':
          return {
            title: 'Your account is already set up',
            headline: 'This invitation has already been used.',
            advice:
              'Sign in with your email address and the password you chose. If you have forgotten it, use “Forgot password?” on the sign-in page.',
          }
        case 'email_mismatch':
          return {
            title: 'This link was sent to a different address',
            headline: `This invitation was not sent to ${sessionEmail ?? 'this address'}.`,
            advice: 'Sign out, then open the link from the email your school sent you.',
          }
        default:
          return {
            title: 'No invitation found',
            headline: sessionEmail
              ? `We could not find an invitation for ${sessionEmail}.`
              : 'We could not find an invitation for this account.',
            advice:
              'If that is not the address your school invited, you may be signed in with another account — sign out, then open the link from your email again. Otherwise ask your school to send the invitation again.',
          }
      }
    })()

    return (
      <AuthLayout title={title} subtitle="Nothing has been changed.">
        <div className="flex gap-3 rounded-2xl bg-amber-500/10 px-4 py-3.5">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-ink dark:text-white">{headline}</p>
            {invalidReason && <p className="mt-1 text-xs text-graphite">{invalidReason}</p>}
          </div>
        </div>
        <p className="mt-5 text-sm text-graphite">{advice}</p>
        <Link to="/login" className="btn-primary mt-6 w-full px-8 py-4 text-base">
          Back to sign in <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={school ? `Welcome to ${school.name}` : 'Welcome to Nom Cloud'}
      subtitle={roleLabel ? `${roleLabel}${displayName ? ` · ${displayName}` : ''}` : 'Create your password to finish.'}
    >
      <div className="mb-6 flex gap-3 rounded-2xl bg-brand/10 px-4 py-3.5">
        <KeyRound className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
        <p className="text-sm text-ink dark:text-white">
          Choose a password to activate your account. Nobody else has ever seen it — Nom Cloud never sends passwords by
          email.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Input
          label="New password"
          type={showPassword ? 'text' : 'password'}
          required
          icon={<Lock className="h-4 w-4" />}
          endAdornment={
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-graphite hover:bg-ink/5 dark:hover:bg-white/10"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        <Input
          label="Confirm password"
          type={showConfirmPassword ? 'text' : 'password'}
          required
          icon={<Lock className="h-4 w-4" />}
          endAdornment={
            <button
              type="button"
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-graphite hover:bg-ink/5 dark:hover:bg-white/10"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="••••••••"
        />
        {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-500">{error}</p>}
        <Button type="submit" size="lg" loading={status === 'saving'} className="w-full">
          Activate account <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </AuthLayout>
  )
}
