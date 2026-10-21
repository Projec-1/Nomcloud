import { useEffect, useState } from 'react'
import {
  Bell,
  Buildings,
  Check,
  Gear as SettingsIcon,
  Globe,
  LockKey,
  Moon,
  SignOut as LogOut,
  Sun,
  UserCircle,
  Users,
  Warning as AlertTriangle,
} from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import ThemeSwitcher from '@/components/ui/ThemeSwitcher'
import LanguageSwitcher from '@/components/layout/LanguageSwitcher'
import { useTheme, type ThemeMode } from '@/context/ThemeContext'
import { useLanguage } from '@/context/LanguageContext'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { cn } from '@/utils/cn'
import { Callout, Panel, Pill, Restrict, SectionHeader } from './PrototypeKit'

/**
 * Settings: the operator's own account, appearance and preferences, plus the
 * platform configuration this role can see.
 *
 * Anything that has no backend — editing a profile, multi-device session
 * history, per-operator notification routing — is stated plainly instead of
 * being mocked, so nothing on this screen promises something the product does
 * not do.
 */

const TABS = ['Profile', 'Appearance', 'Notifications', 'Language', 'Security', 'Sessions', 'Platform'] as const
type Tab = (typeof TABS)[number]

const PREFS_KEY = 'nomcloud_operator_notifications'

interface NotificationPrefs {
  newApplication: boolean
  newRequest: boolean
  billingFailure: boolean
  securityAlert: boolean
  weeklyDigest: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
  newApplication: true,
  newRequest: true,
  billingFailure: true,
  securityAlert: true,
  weeklyDigest: false,
}

function readPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) }
  } catch {
    return DEFAULT_PREFS
  }
}

const NOTIFY_OPTIONS: Array<{ key: keyof NotificationPrefs; label: string; detail: string }> = [
  { key: 'newApplication', label: 'New school applications', detail: 'When a school submits an application for review.' },
  { key: 'newRequest', label: 'New contact requests', detail: 'When the public contact form produces a request.' },
  { key: 'billingFailure', label: 'Failed payments', detail: 'When an invoice goes overdue or a payment fails.' },
  { key: 'securityAlert', label: 'Security alerts', detail: 'When a high severity signal is raised against the platform.' },
  { key: 'weeklyDigest', label: 'Weekly digest', detail: 'A summary of platform activity every Monday.' },
]

const LANGUAGE_LABEL: Record<string, string> = { en: 'English', so: 'Soomaali', ar: 'العربية' }

interface SettingsSectionProps {
  fullName: string
  email: string
  role: string
  provider: string | null
  accountCreatedAt: string | null
  lastSignInAt: string | null
  platform: {
    schoolCount: number
    studentCount: number
    teacherCount: number
    pendingApplications: number
    operatorCount: number
    requestCount: number
    connected: boolean
    error: string | null
  }
  onEmergency: () => void
  onSignOut: () => void
  notify: (message: string) => void
}

export default function SettingsSection({
  fullName,
  email,
  role,
  provider,
  accountCreatedAt,
  lastSignInAt,
  platform,
  onEmergency,
  onSignOut,
  notify,
}: SettingsSectionProps) {
  const [tab, setTab] = useState<Tab>('Profile')
  const [prefs, setPrefs] = useState<NotificationPrefs>(readPrefs)
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const { theme, mode } = useTheme()
  const { lang } = useLanguage()

  useEffect(() => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }, [prefs])

  const sendResetEmail = async () => {
    if (!email || !isSupabaseConfigured) {
      setResetError('Password reset is unavailable because this app is missing its Supabase configuration.')
      return
    }
    setResetSending(true)
    setResetError(null)
    setResetSent(false)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        setResetError('We could not send the reset email just now. Try again in a moment.')
        return
      }
      setResetSent(true)
    } catch {
      setResetError('We could not send the reset email just now. Try again in a moment.')
    } finally {
      setResetSending(false)
    }
  }

  const themeLabel: Record<ThemeMode, string> = {
    light: 'Light — always light',
    dark: 'Dark — always dark',
    system: `System — following your device, currently ${theme}`,
  }

  const enabledCount = Object.values(prefs).filter(Boolean).length

  return (
    <div>
      <SectionHeader
        eyebrow="Your account"
        title="Settings"
        description="Your operator identity, appearance, notifications, language, security and the platform configuration this role can see."
        action={<Button variant="danger" size="sm" onClick={onEmergency}><AlertTriangle className="h-4 w-4" /> Emergency controls</Button>}
      />

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-ink/[0.07] pb-3 dark:border-white/[0.08]">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
            className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold', tab === item ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'text-graphite hover:bg-ink/[0.05] dark:hover:bg-white/[0.06]')}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'Profile' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-ink/[0.07] bg-white p-6 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white">
              {(fullName || email || '?').charAt(0).toUpperCase()}
            </div>
            <h2 className="mt-5 text-xl font-semibold">{fullName || 'Operator'}</h2>
            <p className="mt-1 text-sm text-graphite">{role}</p>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-ink/[0.035] px-3 py-2.5 dark:bg-white/[0.05]">
                <dt className="text-graphite">Email</dt>
                <dd className="min-w-0 truncate font-medium">{email || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-ink/[0.035] px-3 py-2.5 dark:bg-white/[0.05]">
                <dt className="text-graphite">Sign-in method</dt>
                <dd className="font-medium capitalize">{provider ?? 'Email and password'}</dd>
              </div>
            </dl>
            <Restrict>
              Editing an operator's name, email or role is not connected yet, so this card is read-only. Nothing here can be changed from the client.
            </Restrict>
          </div>

          <Panel title="Personal information" description="Read from your signed-in account.">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-graphite">Full name</dt>
                <dd className="mt-2 text-sm font-medium">{fullName || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-graphite">Role</dt>
                <dd className="mt-2 text-sm font-medium">{role}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold text-graphite">Email</dt>
                <dd className="mt-2 text-sm font-medium break-all">{email || '—'}</dd>
              </div>
            </dl>
            <Callout tone="info" title="Why there is no Save button">
              A previous version of this screen showed an editable form whose Save button only raised a toast. Profile changes need a backend to write to, so the fields are read-only until that exists.
            </Callout>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => setTab('Security')}><LockKey className="h-4 w-4" /> Security settings</Button>
              <Button variant="outline" size="sm" onClick={() => setTab('Appearance')}><SettingsIcon className="h-4 w-4" /> Appearance</Button>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'Appearance' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Theme" description="Applies to every screen in Nom Cloud — pages, dialogs, tables, charts and sidebars.">
            <ThemeSwitcher />
            <p className="mt-4 text-sm text-graphite">
              Currently <span className="font-semibold text-ink dark:text-white">{themeLabel[mode]}</span>. Your choice is stored on this device and kept across navigation and sign-in.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-graphite">
              <li className="flex items-center gap-2"><Sun className="h-4 w-4 text-amber-500" /> Light uses a white surface with soft grey borders.</li>
              <li className="flex items-center gap-2"><Moon className="h-4 w-4 text-blue-400" /> Dark uses the same layout on a charcoal surface.</li>
              <li className="flex items-center gap-2"><Globe className="h-4 w-4 text-graphite" /> System follows your operating system and changes with it.</li>
            </ul>
          </Panel>
          <Panel title="Contrast and readability" description="What the theme guarantees.">
            <ul className="space-y-3 text-sm text-graphite">
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> Status colours keep an accessible text tone in both modes.</li>
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> Borders stay subtle in both modes, so tables and cards never look outlined.</li>
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> No screen hardcodes its own background, so nothing breaks when you switch.</li>
            </ul>
            <Callout tone="info" title="Keyboard access">
              Every control in the Operator Control Center is reachable by keyboard and shows a visible focus outline in both themes.
            </Callout>
          </Panel>
        </div>
      )}

      {tab === 'Notifications' && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="What should reach you" description={`${enabledCount} of ${NOTIFY_OPTIONS.length} notifications are on. Stored on this device.`}>
            <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
              {NOTIFY_OPTIONS.map((option) => (
                <li key={option.key} className="flex items-center justify-between gap-4 py-4">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-graphite">{option.detail}</span>
                  </span>
                  <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
                    <span className="sr-only">{option.label}</span>
                    <input
                      type="checkbox"
                      checked={prefs[option.key]}
                      onChange={(event) => setPrefs((current) => ({ ...current, [option.key]: event.target.checked }))}
                      className="h-4 w-4 rounded border-ink/20 accent-brand"
                    />
                    <span className="text-xs font-semibold text-graphite">{prefs[option.key] ? 'On' : 'Off'}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Delivery" description="How these preferences are honoured today.">
            <Callout tone="warning" title="Notification routing is not connected yet">
              These switches are saved on this device and shown here so the preference is ready, but no email or in-app notification is sent from them until the notification service is connected.
            </Callout>
            <p className="mt-4 text-sm text-graphite">
              School-scoped communications are separate from these device-local operator preferences.
            </p>
            <div className="mt-4"><Pill label={`${enabledCount} preferences saved`} tone="info" /></div>
          </Panel>
        </div>
      )}

      {tab === 'Language' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Interface language" description="Applies to the whole product and is remembered on this device.">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-graphite" />
              <LanguageSwitcher />
            </div>
            <p className="mt-4 text-sm text-graphite">
              Current language: <span className="font-semibold text-ink dark:text-white">{LANGUAGE_LABEL[lang] ?? lang}</span>.
            </p>
            <Callout tone="info" title="Right-to-left is supported">
              Arabic switches the whole interface to right-to-left. School Applications, dialogs and tables follow the same direction.
            </Callout>
          </Panel>
          <Panel title="Regional formatting" description="How dates and money are shown.">
            <ul className="space-y-3 text-sm text-graphite">
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> Dates follow the browser locale.</li>
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> Money is formatted in each school's own currency, not a single global one.</li>
            </ul>
          </Panel>
        </div>
      )}

      {tab === 'Security' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Your sign-in" description="Read from the authentication service.">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-graphite">Method</dt>
                <dd className="mt-1.5 text-sm font-medium capitalize">{provider ?? 'Email and password'}</dd>
              </div>
              <div className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-graphite">Last sign-in</dt>
                <dd className="mt-1.5 text-sm font-medium">{lastSignInAt ? new Date(lastSignInAt).toLocaleString() : 'Not recorded'}</dd>
              </div>
              <div className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05] sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-graphite">Account created</dt>
                <dd className="mt-1.5 text-sm font-medium">{accountCreatedAt ? new Date(accountCreatedAt).toLocaleDateString() : 'Not recorded'}</dd>
              </div>
            </dl>
            <div className="mt-5">
              <Button variant="outline" size="sm" loading={resetSending} onClick={() => void sendResetEmail()}><LockKey className="h-4 w-4" /> Email me a password reset link</Button>
              {resetSent && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">Reset link sent to {email}. It opens the reset-password page.</p>}
              {resetError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-300">{resetError}</p>}
            </div>
          </Panel>
          <Panel title="Platform security posture" description="Checks that are enforced outside this screen.">
            <ul className="space-y-3 text-sm text-graphite">
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> Platform access is verified on the database, not only in this interface.</li>
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> Operator grants and revocations are written to <span className="font-mono text-xs">platform_admins</span>.</li>
              <li className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" /> Current-account MFA status is available in Security; cross-account status and platform-wide security monitoring are unavailable.</li>
            </ul>
            <div className="mt-4">
              <Button variant="outline" size="sm" disabled>Live security checks unavailable</Button>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'Sessions' && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="This session" description="The only session this client can see.">
            <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
              <li className="flex flex-wrap items-center justify-between gap-3 py-4">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold"><UserCircle className="h-4 w-4 text-brand" /> Current device</span>
                  <span className="mt-1 block text-xs text-graphite">{email || 'Unknown account'} · signed in {lastSignInAt ? new Date(lastSignInAt).toLocaleString() : 'at an unrecorded time'}</span>
                </span>
                <Pill label="Active" tone="success" />
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="danger" size="sm" onClick={onSignOut}><LogOut className="h-4 w-4" /> Sign out of this device</Button>
            </div>
          </Panel>
          <Panel title="Other devices" description="What is and is not available.">
            <Callout tone="warning" title="Session history is not recorded yet">
              Nom Cloud does not store per-operator sign-in history, so no other devices are listed. Sign-in events appear in the audit log once a session service is connected.
            </Callout>
            <p className="mt-4 text-sm text-graphite">
              Signing out here ends this session only. This client does not provide a cross-device or other-operator revocation action.
            </p>
          </Panel>
        </div>
      )}

      {tab === 'Platform' && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Platform configuration" description="Live counts read from the database for this role.">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: Buildings, label: 'Registered schools', value: platform.error ? 'Not available' : !platform.connected ? '…' : platform.schoolCount.toLocaleString() },
                { icon: Users, label: 'Platform operators', value: platform.error ? 'Not available' : !platform.connected ? '…' : platform.operatorCount.toLocaleString() },
                { icon: UserCircle, label: 'Students and teachers', value: platform.error ? 'Not available' : !platform.connected ? '…' : `${platform.studentCount.toLocaleString()} / ${platform.teacherCount.toLocaleString()}` },
                { icon: Bell, label: 'Contact requests', value: platform.error ? 'Not available' : !platform.connected ? '…' : platform.requestCount.toLocaleString() },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="rounded-xl bg-ink/[0.035] p-3 dark:bg-white/[0.05]">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-graphite"><Icon className="h-3.5 w-3.5" /> {item.label}</p>
                    <p className="mt-1.5 text-lg font-semibold">{item.value}</p>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-ink/10 p-3 dark:border-white/10">
              <span className={cn('h-2 w-2 rounded-full', platform.connected ? 'bg-emerald-500' : platform.error ? 'bg-red-500' : 'bg-amber-500')} />
              <span className="text-sm font-semibold">
                {platform.connected ? 'Platform data connected' : platform.error ? 'Platform data unavailable' : 'Checking platform records'}
              </span>
              <span className="ml-auto text-xs text-graphite">{platform.error ? 'Application count unavailable' : !platform.connected ? 'Checking application count' : `${platform.pendingApplications} applications pending`}</span>
            </div>
          </Panel>
          <Panel title="Where platform settings live" description="So nothing is changed twice.">
            <ul className="space-y-3 text-sm text-graphite">
              <li className="flex gap-3"><SettingsIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Maintenance mode and release windows: <span className="font-semibold text-ink dark:text-white">Maintenance</span></li>
              <li className="flex gap-3"><SettingsIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Feature availability and rollouts: <span className="font-semibold text-ink dark:text-white">Features</span></li>
              <li className="flex gap-3"><SettingsIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> What each operator role may do: <span className="font-semibold text-ink dark:text-white">Permissions</span></li>
              <li className="flex gap-3"><SettingsIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Providers, keys and webhooks: <span className="font-semibold text-ink dark:text-white">Integrations</span></li>
            </ul>
            <Restrict>
              These sections explain where controls would live, but their backends are not connected and no platform setting can be changed from this summary.
            </Restrict>
          </Panel>
        </div>
      )}
    </div>
  )
}
