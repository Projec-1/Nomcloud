import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeSlash as EyeOff, Key as KeyRound, Lock } from '@phosphor-icons/react'
import AuthLayout from '@/components/layout/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { PageLoader } from '@/components/ui/Loader'
import { useAuth } from '@/context/AuthContext'
import { completeFirstLoginPasswordChange, mustChangePassword } from '@/services/accountService'
import { errorMessage } from '@/utils/errorMessage'
import { MIN_PASSWORD_LENGTH, isValidPassword } from '@/utils/validators'

// ---------------------------------------------------------------------------
// Choosing a real password, the first time.
//
// This screen is the only place a person provisioned with a temporary password
// can reach until they have replaced it. The guards in ProtectedRoute and
// PlatformRoute send them here; this page sends them away again once the
// requirement is gone, so the two cannot loop.
//
// The invited operator can reveal either field while choosing a new password.
// ---------------------------------------------------------------------------

export default function FirstLoginPassword() {
  const navigate = useNavigate()
  const { authState, authUser, displayName } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (authState === 'initialising' || authState === 'loading_profile') {
    return <PageLoader />
  }
  if (authState === 'signed_out') return <Navigate to="/login" replace />
  if (authState === 'error') {
    return (
      <AuthLayout title="We could not verify your account" subtitle="Your session could not be checked. Try again or sign in again to continue.">
        <div className="flex flex-col gap-3">
          <Button variant="accent" onClick={() => window.location.reload()}>Try again</Button>
          <Button variant="outline" onClick={() => navigate('/login', { replace: true })}>Back to sign in</Button>
        </div>
      </AuthLayout>
    )
  }
  // Nothing to do here: either they never had the requirement, or it is done.
  if (authState === 'ready' && !mustChangePassword(authUser)) return <Navigate to="/" replace />

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

    setSaving(true)
    try {
      await completeFirstLoginPasswordChange(password)
      navigate('/login?password=updated', { replace: true })
    } catch (err: unknown) {
      setSaving(false)
      setError(errorMessage(err))
    }
  }

  return (
    <AuthLayout
      title="Choose your password"
      subtitle={displayName ? `Welcome, ${displayName}.` : 'Welcome to Nom Cloud.'}
    >
      <div className="mb-6 flex gap-3 rounded-2xl bg-brand/10 px-4 py-3.5">
        <KeyRound className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
        <p className="text-sm text-ink dark:text-white">
          You signed in with a temporary password. Choose your own password to finish setting up your account — you
          cannot use Nom Cloud until you do.
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
              onClick={() => setShowPassword((value) => !value)}
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
          label="Confirm new password"
          type={showConfirmPassword ? 'text' : 'password'}
          required
          icon={<Lock className="h-4 w-4" />}
          endAdornment={
            <button
              type="button"
              onClick={() => setShowConfirmPassword((value) => !value)}
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
        <Button type="submit" size="lg" loading={saving} className="w-full">
          Save password <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-xs text-graphite">
          You will be signed out and asked to sign in again with your new password.
        </p>
      </form>
    </AuthLayout>
  )
}
