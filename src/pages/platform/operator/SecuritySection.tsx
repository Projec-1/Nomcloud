import { useEffect, useState } from 'react'
import { Fingerprint, Key, Shield, Warning } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/utils/errorMessage'
import { KpiTile, Panel, SectionHeader, UnavailableNotice } from './PrototypeKit'

interface CurrentSessionSecurity {
  assuranceLevel: string | null
  nextAssuranceLevel: string | null
  verifiedFactors: string[]
}

const factorLabels: Record<string, string> = {
  totp: 'Authenticator app',
  phone: 'Phone',
  webauthn: 'Security key or passkey',
  recovery_code: 'Recovery codes',
}

export default function SecuritySection() {
  const [session, setSession] = useState<CurrentSessionSecurity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ])
      .then(([assuranceResult, factorsResult]) => {
        if (assuranceResult.error) throw assuranceResult.error
        if (factorsResult.error) throw factorsResult.error
        if (cancelled) return
        setSession({
          assuranceLevel: assuranceResult.data.currentLevel,
          nextAssuranceLevel: assuranceResult.data.nextLevel,
          verifiedFactors: factorsResult.data.all
            .filter((factor) => factor.status === 'verified')
            .map((factor) => factorLabels[factor.factor_type] ?? factor.factor_type),
        })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setSession(null)
        setError(errorMessage(cause, 'Could not load current account MFA status.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  return <>
    <SectionHeader eyebrow="Threat and access monitoring" title="Security" description="A limited current-session view for the signed-in operator; no network-wide security signals are available." />
    <UnavailableNotice scope="Platform-wide security monitoring" detail="The application has no network-wide security-event, failed-sign-in, session-history, or access-review source. No containment or session-revocation action is available here." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile label="Current session assurance" value={loading ? '…' : session?.assuranceLevel ?? 'Not reported'} detail="Identity-provider session level" icon={Fingerprint} />
      <KpiTile label="Verified MFA factors" value={loading ? '…' : session?.verifiedFactors.length.toLocaleString() ?? 'Not available'} detail="For the signed-in operator only" icon={Key} />
      <KpiTile label="Open security signals" value="Not available" detail="No platform security-event source" icon={Warning} tone="warning" />
      <KpiTile label="Access reviews" value="Not available" detail="No review workflow source" icon={Shield} tone="warning" />
    </div>
    <Panel title="Signed-in operator MFA" description="Read-only Supabase Auth data for the current account. It does not represent other operators." className="mt-6">
      {loading ? <p role="status" className="text-sm text-graphite">Loading current session security…</p>
        : error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-red-800 dark:text-red-300"><span>{error}</span><Button size="sm" variant="outline" onClick={() => setRefresh((value) => value + 1)}>Retry</Button></div>
          : session ? <div className="space-y-3 text-sm">
            <p>Current assurance level: <strong>{session.assuranceLevel ?? 'Not reported'}</strong>{session.nextAssuranceLevel ? ` · next level ${session.nextAssuranceLevel}` : ''}</p>
            {session.verifiedFactors.length ? <div><p className="font-semibold">Verified factors</p><ul className="mt-1 list-inside list-disc text-graphite">{session.verifiedFactors.map((factor, index) => <li key={`${factor}-${index}`}>{factor}</li>)}</ul></div>
              : <p className="text-graphite">No verified MFA factors were returned for this account.</p>}
          </div> : <p className="text-sm text-graphite">Current session security data is unavailable.</p>}
    </Panel>
    <Panel title="Response principle" description="Guidance only; this screen does not perform containment." className="mt-6"><p className="text-sm leading-6 text-graphite">When a verified security signal exists, contain access through an approved server-side path, preserve evidence, record the decision, and communicate the outcome. This workspace cannot perform those platform-wide actions.</p></Panel>
  </>
}
