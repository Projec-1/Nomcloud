import { useEffect, useState } from 'react'
import { Buildings, Clock, FileText, MapPin, Shield, Users } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import type { Request, School, SchoolStatus } from './types'
import type { PlatformAuditRecord } from '@/services/platformService'

const profileTabs = [
  'Overview',
  'School Information',
  'Users',
  'Activity',
  'Requests',
  'Records',
  'Audit History',
]

const statusStyles: Record<SchoolStatus, string> = {
  Active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'Under review': 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Suspended: 'bg-red-500/10 text-red-700 dark:text-red-300',
  Rejected: 'bg-red-500/10 text-red-700 dark:text-red-300',
  Closed: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
}

interface SchoolProfileModalProps {
  school: School | null
  requests: Request[]
  auditEntries: PlatformAuditRecord[]
  busy: boolean
  onClose: () => void
  onOpenRequest: (request: Request) => void
  onStatusChange: (id: string, status: SchoolStatus, message: string) => void
}

function StatusBadge({ status }: { status: SchoolStatus }) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-md px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {status}
    </span>
  )
}

function DataField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-ink/10 py-3 dark:border-white/10">
      <dt className="text-xs text-graphite">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-ink dark:text-white">{value}</dd>
    </div>
  )
}

export default function SchoolProfileModal({
  school,
  requests,
  auditEntries,
  busy,
  onClose,
  onOpenRequest,
  onStatusChange,
}: SchoolProfileModalProps) {
  const [tab, setTab] = useState('Overview')

  useEffect(() => {
    if (school) setTab('Overview')
  }, [school])

  if (!school) return null

  const schoolRequests = requests.filter((request) => request.school === school.name)
  const schoolActivity = auditEntries.filter((entry) => entry.schoolId === school.id)

  const footer = (
    <>
      {school.status === 'Suspended' ? (
        <Button
          variant="accent"
          loading={busy}
          disabled={busy}
          onClick={() => onStatusChange(school.id, 'Active', 'School reactivated')}
        >
          Reactivate school
        </Button>
      ) : school.status === 'Active' || school.status === 'Under review' ? (
        <Button
          variant="danger"
          loading={busy}
          disabled={busy}
          onClick={() => onStatusChange(school.id, 'Suspended', 'School suspended')}
        >
          Suspend school
        </Button>
      ) : null}
    </>
  )

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      size="xl"
      title={school.name}
      description={`${school.code ?? school.id} · ${school.location}`}
      footer={footer}
    >
      <div className="space-y-6">
        <nav aria-label="School profile sections" className="flex gap-1 overflow-x-auto border-b border-ink/10 dark:border-white/10">
          {profileTabs.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
              className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-xs font-semibold ${
                tab === item
                  ? 'border-brand text-brand'
                  : 'border-transparent text-graphite hover:text-ink dark:hover:text-white'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        {tab === 'Overview' && (
          <div className="space-y-6">
            <section aria-labelledby="school-contact-heading">
              <h2 id="school-contact-heading" className="font-semibold">Primary contact</h2>
              <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
                <DataField label="Administrator" value={school.admin} />
                <DataField label="Email" value={school.email} />
                <DataField label="Phone" value={school.phone} />
                <DataField label="Location" value={school.location} />
              </dl>
            </section>

            <section aria-labelledby="school-account-heading">
              <h2 id="school-account-heading" className="font-semibold">Account</h2>
              <dl className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                <DataField label="Status" value={<StatusBadge status={school.status} />} />
                <DataField label="Plan" value={school.plan} />
                <DataField label="Registered" value={school.registered} />
                <DataField label="Students" value={school.students.toLocaleString()} />
                <DataField label="Teachers" value={school.teachers.toLocaleString()} />
                <DataField label="Last activity" value={school.activity} />
              </dl>
            </section>

            <section aria-labelledby="school-requests-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="school-requests-heading" className="font-semibold">Recent requests</h2>
                <button
                  type="button"
                  className="text-sm font-semibold text-brand"
                  onClick={() => setTab('Requests')}
                >
                  View all
                </button>
              </div>
              {schoolRequests.length ? (
                <div className="mt-2 divide-y divide-ink/10 dark:divide-white/10">
                  {schoolRequests.slice(0, 2).map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      className="flex min-h-14 w-full items-center gap-3 py-3 text-left"
                      onClick={() => onOpenRequest(request)}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{request.type}</span>
                        <span className="block text-xs text-graphite">{request.id} · {request.submitted}</span>
                      </span>
                      <span className="text-xs font-semibold text-graphite">{request.status}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-graphite">No requests from this school.</p>
              )}
            </section>
          </div>
        )}

        {tab === 'School Information' && (
          <section aria-labelledby="school-information-heading">
            <h2 id="school-information-heading" className="font-semibold">Organization information</h2>
            <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
              <DataField label="School name" value={school.name} />
              <DataField label="School ID" value={school.code ?? school.id} />
              <DataField label="Administrator" value={school.admin} />
              <DataField label="Location" value={<span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-brand" />{school.location}</span>} />
              <DataField label="Contact email" value={school.email} />
              <DataField label="Contact phone" value={school.phone} />
              <DataField label="Registration date" value={school.registered} />
              <DataField label="Subscription plan" value={school.plan} />
            </dl>
          </section>
        )}

        {tab === 'Users' && (
          <section aria-labelledby="school-users-heading">
            <h2 id="school-users-heading" className="font-semibold">School users</h2>
            <div className="mt-3 divide-y divide-ink/10 dark:divide-white/10">
              <div className="flex min-h-16 items-center gap-3 py-3">
                <Users className="h-4 w-4 shrink-0 text-brand" />
                <span className="flex-1 text-sm font-medium">Students</span>
                <span className="text-sm tabular-nums">{school.students.toLocaleString()}</span>
              </div>
              <div className="flex min-h-16 items-center gap-3 py-3">
                <Users className="h-4 w-4 shrink-0 text-brand" />
                <span className="flex-1 text-sm font-medium">Teachers</span>
                <span className="text-sm tabular-nums">{school.teachers.toLocaleString()}</span>
              </div>
              <div className="flex min-h-16 items-center gap-3 py-3">
                <Buildings className="h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{school.admin}</span>
                  <span className="block text-xs text-graphite">School administrator · {school.email}</span>
                </span>
                <span className="text-xs text-graphite">Administrator</span>
              </div>
            </div>
          </section>
        )}

        {(tab === 'Activity' || tab === 'Audit History') && (
          <section aria-labelledby="school-history-heading">
            <h2 id="school-history-heading" className="font-semibold">
              {tab === 'Activity' ? 'Recent activity' : 'School audit history'}
            </h2>
            <ol className="mt-3 divide-y divide-ink/10 dark:divide-white/10">
              {schoolActivity.length ? schoolActivity.map((event) => (
                <li key={event.id} className="flex gap-3 py-4">
                  {tab === 'Activity' ? (
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  ) : (
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{event.action}</p>
                    <p className="mt-1 text-xs leading-relaxed text-graphite">{event.summary ?? `${event.entityType}${event.entityId ? ` · ${event.entityId}` : ''}`}</p>
                    <p className="mt-1 text-xs text-graphite">{event.actorEmail ?? 'System'} · {new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                </li>
              )) : <li className="py-4 text-sm text-graphite">No school-scoped audit events are recorded for this school.</li>}
            </ol>
          </section>
        )}

        {tab === 'Requests' && (
          <section aria-labelledby="school-requests-list-heading">
            <h2 id="school-requests-list-heading" className="font-semibold">Requests and reviews</h2>
            {schoolRequests.length ? (
              <div className="mt-3 divide-y divide-ink/10 dark:divide-white/10">
                {schoolRequests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    className="flex min-h-16 w-full items-start gap-3 py-4 text-left"
                    onClick={() => onOpenRequest(request)}
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{request.type}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-graphite">{request.summary}</span>
                      <span className="mt-1 block text-xs text-graphite">{request.id} · {request.submittedBy} · {request.submitted}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-graphite">{request.status}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-graphite">No requests from this school.</p>
            )}
          </section>
        )}

        {tab === 'Records' && (
          <section aria-labelledby="school-records-heading">
            <h2 id="school-records-heading" className="font-semibold">School records</h2>
            <p className="mt-2 text-sm text-graphite">School details are read from the live organization record. Uploaded verification files are not stored in the current schema.</p>
          </section>
        )}

      </div>
    </Modal>
  )
}
