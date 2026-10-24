import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users, Envelope as Mail, ShieldCheck, ShieldSlash as ShieldOff } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import PageHeader from '@/components/ui/PageHeader'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import SearchInput from '@/components/ui/SearchInput'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import ResourceGate from '@/components/ui/ResourceGate'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import { deriveResourceState } from '@/lib/resourceState'
import { fetchGuardianDirectory, type GuardianDirectoryRow } from '@/services/guardianService'
import { avatarColorForId } from '@/services/studentService'
import { fetchGuardianAccess, revokeAccess, restoreAccess, type PersonAccess } from '@/services/accessService'
import { listLiveInvitations, sendInvitation, type InvitationRow } from '@/services/invitationService'
import BulkInviteBar from '@/components/ui/BulkInviteBar'
import { ThinkingOrb } from 'thinking-orbs'
import { runBulkInvite, type BulkInviteProgress, type BulkInviteResult } from '@/services/bulkInvite'
import { errorMessage, toError } from '@/utils/errorMessage'

// ---------------------------------------------------------------------------
// Guardians — the families of this school.
//
// WHY THIS PAGE EXISTS. A guardian record could only ever be created inside a
// student's form, which is the right place to create one (a guardian without a
// child is not a thing this school needs). But it left nowhere to SEE the
// families, and nowhere to give them a login. Creating stays where it was; this
// page is the list, the access state, and the invitation.
//
// INVITING IS THE SAME ACT EVERYWHERE. The button calls sendInvitation, the one
// path that writes an invitation as the caller and lets Supabase Auth email a
// single-use activation link. No password is created here or anywhere else.
// ---------------------------------------------------------------------------

export default function AdminGuardians() {
  const { school } = useAuth()
  const { showToast } = useToast()
  const schoolId = school?.id ?? null

  const [guardians, setGuardians] = useState<GuardianDirectoryRow[]>([])
  const [access, setAccess] = useState<Map<string, PersonAccess>>(new Map())
  const [invitations, setInvitations] = useState<Map<string, InvitationRow>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)
  const [search, setSearch] = useState('')
  const [inviting, setInviting] = useState<string | null>(null)
  const [accessTarget, setAccessTarget] = useState<{ guardian: GuardianDirectoryRow; current: PersonAccess } | null>(null)
  // Bulk invitation. `selected` holds ids, so it survives re-filtering and a
  // reload without ever selecting somebody the administrator cannot see.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkInviteProgress | null>(null)
  const [bulkResults, setBulkResults] = useState<BulkInviteResult[] | null>(null)
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianDirectoryRow | null>(null)
  const [page, setPage] = useState(1)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    if (!schoolId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    Promise.all([fetchGuardianDirectory(schoolId), fetchGuardianAccess(schoolId), listLiveInvitations(schoolId)])
      .then(([rows, accessMap, live]) => {
        if (cancelled) return
        setGuardians(rows)
        setAccess(accessMap)
        setInvitations(new Map(live.filter((i) => i.role === 'guardian').map((i) => [i.email.toLowerCase(), i])))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toError(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, nonce])

  const state = deriveResourceState<GuardianDirectoryRow[]>({
    isLoading,
    canAccess: schoolId !== null,
    error,
    data: guardians,
    retry: reload,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return guardians
    return guardians.filter(
      (g) =>
        g.full_name.toLowerCase().includes(q) ||
        (g.email ?? '').toLowerCase().includes(q) ||
        g.phone.toLowerCase().includes(q) ||
        g.studentNames.some((name) => name.toLowerCase().includes(q)),
    )
  }, [guardians, search])
  const pageSize = 25
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visibleGuardians = filtered.slice((page - 1) * pageSize, page * pageSize)
  const activeGuardianAccounts = guardians.filter((guardian) => access.get(guardian.id)?.status === 'active').length
  const suspendedGuardianAccounts = guardians.filter((guardian) => access.get(guardian.id)?.status === 'suspended').length
  const invite = async (guardian: GuardianDirectoryRow) => {
    if (!schoolId) return
    setInviting(guardian.id)
    try {
      const outcome = await sendInvitation({ schoolId, role: 'guardian', personId: guardian.id })
      if (outcome.status === 'sent') {
        showToast({ type: 'success', title: `Invitation sent to ${outcome.email}`, description: `${guardian.full_name} can now create their password.` })
      } else {
        showToast({
          type: outcome.status === 'skipped' ? 'warning' : 'error',
          title: outcome.status === 'skipped' ? `Not invited: ${guardian.full_name}` : `Invitation not sent to ${guardian.full_name}`,
          description: outcome.message,
        })
      }
      reload()
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Invitation not sent', description: errorMessage(err) })
    } finally {
      setInviting(null)
    }
  }

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // "Select all" means everything the current search is showing, and nothing
  // it is hiding — selecting rows the administrator cannot see would be a trap.
  const allFilteredSelected = filtered.length > 0 && filtered.every((g) => selected.has(g.id))
  const toggleAll = () => setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((g) => g.id)))

  /**
   * Invites everybody selected, paced. Each row's outcome comes from the same
   * function the single-row button uses, so a failed send has already revoked
   * its own invitation by the time it is reported here.
   *
   * Re-running is safe: anybody invited a moment ago now has a live invitation,
   * and the function answers 'already_invited' for them instead of sending a
   * second email. Their row is also dropped from the selection below.
   */
  const inviteSelected = async () => {
    if (!schoolId || selected.size === 0) return
    const targets = filtered
      .filter((g) => selected.has(g.id))
      .map((g) => ({ id: g.id, name: g.full_name, email: g.email }))

    setBulkRunning(true)
    setBulkResults(null)
    setBulkProgress({ done: 0, total: targets.length, current: null, pausing: false })
    try {
      const results = await runBulkInvite({
        schoolId,
        role: 'guardian',
        targets,
        onProgress: setBulkProgress,
      })
      setBulkResults(results)
      const sentIds = new Set(results.filter((r) => r.outcome.status === 'sent').map((r) => r.id))
      setSelected((current) => new Set([...current].filter((id) => !sentIds.has(id))))
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Bulk invitation stopped', description: errorMessage(err) })
    } finally {
      setBulkRunning(false)
      setBulkProgress(null)
      reload()
    }
  }

  const confirmAccessChange = async () => {
    if (!accessTarget || !schoolId) return
    const revoking = accessTarget.current.status === 'active'
    try {
      if (revoking) await revokeAccess(schoolId, accessTarget.current.membershipId)
      else await restoreAccess(schoolId, accessTarget.current.membershipId)
      showToast({ type: 'success', title: revoking ? 'Access revoked' : 'Access restored' })
      reload()
    } catch (err: unknown) {
      showToast({ type: 'error', title: 'Access not changed', description: errorMessage(err) })
    } finally {
      setAccessTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Guardians"
        description="Families linked to your students. Add a guardian from a student's record, then invite them here."
      />

      <ResourceGate
        state={state}
        empty={{
          icon: Users,
          title: 'No guardians yet',
          description: 'Open a student and link a guardian to them — they will appear here.',
        }}
        deniedHint="Guardian records are available to school management."
      >
        {() => (
          <>
            {!isLoading && !error && (
              <AdminSectionInsights
                metrics={[]}
                charts={[
                  {
                    kind: 'donut',
                    title: 'Account access',
                    segments: [
                      { label: 'Active', value: activeGuardianAccounts, tone: 'positive' },
                      { label: 'Suspended', value: suspendedGuardianAccounts, tone: 'negative' },
                      { label: 'No active login', value: Math.max(0, guardians.length - activeGuardianAccounts - suspendedGuardianAccounts), tone: 'neutral' },
                    ],
                  },
                ]}
              />
            )}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search by name, email, phone or child…" className="sm:w-96" />
            </div>

            <BulkInviteBar
              selectedCount={selected.size}
              running={bulkRunning}
              progress={bulkProgress}
              results={bulkResults}
              onInvite={() => void inviteSelected()}
              onClear={() => setSelected(new Set())}
              onDismissResults={() => setBulkResults(null)}
            />

            {filtered.length === 0 ? (
              <EmptyState icon={Users} title="No guardians found" description="Try adjusting your search." />
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead>
                    <tr className="border-b border-ink/5 text-left text-xs text-graphite dark:border-white/10">
                      <th className="w-10 px-5 py-3.5">
                        <input
                          type="checkbox"
                          aria-label="Select all guardians"
                          checked={allFilteredSelected}
                          onChange={toggleAll}
                          disabled={bulkRunning}
                          className="h-4 w-4 rounded border-ink/20 accent-brand"
                        />
                      </th>
                      <th className="px-5 py-3.5 font-medium">Guardian</th>
                      <th className="px-5 py-3.5 font-medium">Email</th>
                      <th className="px-5 py-3.5 font-medium">Phone</th>
                      <th className="px-5 py-3.5 font-medium">Children</th>
                      <th className="px-5 py-3.5 font-medium">App access</th>
                      <th className="px-5 py-3.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleGuardians.map((g) => {
                      const a = access.get(g.id)
                      const pending = g.email ? invitations.get(g.email.toLowerCase()) : undefined
                      return (
                        <tr key={g.id} className="border-b border-ink/5 last:border-b-0 dark:border-white/5">
                          <td className="px-5 py-3.5">
                            <input
                              type="checkbox"
                              aria-label={`Select ${g.full_name}`}
                              checked={selected.has(g.id)}
                              onChange={() => toggle(g.id)}
                              disabled={bulkRunning}
                              className="h-4 w-4 rounded border-ink/20 accent-brand"
                            />
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <Avatar name={g.full_name} color={avatarColorForId(g.id)} size="sm" />
                              <button type="button" onClick={() => setSelectedGuardian(g)} className="font-medium text-ink hover:text-brand dark:text-white">{g.full_name}</button>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-graphite">{g.email ?? <span className="text-xs">No email</span>}</td>
                          <td className="px-5 py-3.5 text-graphite">{g.phone}</td>
                          <td className="px-5 py-3.5 text-graphite">{g.studentNames.join(', ') || '—'}</td>
                          <td className="px-5 py-3.5">
                            {a ? (
                              <Badge tone={a.status === 'active' ? 'brand' : 'danger'}>
                                {a.status === 'active' ? 'Active' : 'Revoked'}
                              </Badge>
                            ) : pending ? (
                              <Badge tone="warning">Invited</Badge>
                            ) : (
                              <span className="text-xs text-graphite">No login</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {!a && (
                                <button
                                  type="button"
                                  disabled={!g.email || inviting === g.id}
                                  aria-busy={inviting === g.id || undefined}
                                  onClick={() => void invite(g)}
                                  aria-label={`${pending ? 'Resend invitation to' : 'Invite'} ${g.full_name}`}
                                  title={g.email ? (pending ? 'Resend invitation' : 'Invite to Nom Cloud') : 'Add an email address first'}
                                  className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white"
                                >
                                  {inviting === g.id ? <ThinkingOrb state="working" size={20} color="#C9471B" aria-label="Sending invitation" /> : <Mail className="h-4 w-4" />}
                                </button>
                              )}
                              {a && (
                                <button
                                  type="button"
                                  onClick={() => setAccessTarget({ guardian: g, current: a })}
                                  aria-label={`${a.status === 'active' ? 'Revoke' : 'Restore'} app access for ${g.full_name}`}
                                  title={a.status === 'active' ? 'Revoke app access' : 'Restore app access'}
                                  className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                                >
                                  {a.status === 'active' ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {filtered.length > 0 && (
              <div className="mt-4 flex items-center justify-between text-xs text-graphite">
                <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
                <div className="flex gap-2">
                  <button className="rounded-lg border border-ink/10 px-3 py-1.5 disabled:opacity-40" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                  <button className="rounded-lg border border-ink/10 px-3 py-1.5 disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </ResourceGate>
      <Modal open={Boolean(selectedGuardian)} onClose={() => setSelectedGuardian(null)} title={selectedGuardian?.full_name} description="Parent profile">
        {selectedGuardian && <div className="space-y-4 text-sm">
          <div><p className="text-xs text-graphite">Phone</p><p className="font-medium">{selectedGuardian.phone}</p></div>
          <div><p className="text-xs text-graphite">Email</p><p className="font-medium">{selectedGuardian.email ?? 'No email'}</p></div>
          <div><p className="text-xs text-graphite">Linked children</p><div className="mt-2 space-y-2">{selectedGuardian.studentNames.map((name) => <p key={name} className="rounded-lg bg-mist/60 px-3 py-2 font-medium">{name}</p>)}</div></div>
        </div>}
      </Modal>

      <ConfirmDialog
        open={!!accessTarget}
        title={
          accessTarget?.current.status === 'active'
            ? `Revoke ${accessTarget?.guardian.full_name}'s app access?`
            : `Restore ${accessTarget?.guardian.full_name}'s app access?`
        }
        description={
          accessTarget?.current.status === 'active'
            ? 'They will no longer be able to sign in. Their family record and their children stay exactly as they are.'
            : 'They will be able to sign in again and see their own children.'
        }
        confirmLabel={accessTarget?.current.status === 'active' ? 'Revoke access' : 'Restore access'}
        danger={accessTarget?.current.status === 'active'}
        onConfirm={confirmAccessChange}
        onCancel={() => setAccessTarget(null)}
      />
    </div>
  )
}
