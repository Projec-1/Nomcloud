import { Buildings, Clock, User, WarningCircle } from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import type { Request, RequestStatus, School, SchoolStatus } from './types'

const schoolStatusStyles: Record<SchoolStatus, string> = {
  Active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'Under review': 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Suspended: 'bg-red-500/10 text-red-700 dark:text-red-300',
  Rejected: 'bg-red-500/10 text-red-700 dark:text-red-300',
  Closed: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
}

const requestStatusStyles: Record<RequestStatus, string> = {
  Open: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'In review': 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Resolved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
}

interface RequestReviewModalProps {
  request: Request | null
  schools: School[]
  onClose: () => void
  onDecision: (id: string, status: RequestStatus, message: string) => void
  onOpenSchool: (school: School) => void
}

export default function RequestReviewModal({
  request,
  schools,
  onClose,
  onDecision,
  onOpenSchool,
}: RequestReviewModalProps) {
  const school = request ? schools.find((item) => item.name === request.school) : undefined

  const footer = request
    ? request.source === 'contact-message'
      ? request.status === 'Resolved'
        ? null
        : <Button variant="accent" onClick={() => onDecision(request.id, 'Resolved', 'Contact message marked handled')}>Mark handled</Button>
    : null
    : null

  return (
    <Modal
      open={Boolean(request)}
      onClose={onClose}
      size="xl"
      title={request?.type ?? 'Request review'}
      description={request ? `${request.id} · ${request.school}` : ''}
      footer={footer}
    >
      {request && (
        <div className="space-y-6">
          <section aria-labelledby="request-summary-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="request-summary-heading" className="font-semibold">Request details</h2>
              <span className={`inline-flex min-h-7 items-center rounded-md px-2.5 py-1 text-xs font-semibold ${requestStatusStyles[request.status]}`}>
                {request.status}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink dark:text-white">{request.summary}</p>
            <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
              <div className="flex min-h-12 items-center gap-2 border-t border-ink/10 py-3 text-sm dark:border-white/10">
                <User className="h-4 w-4 shrink-0 text-brand" />
                <span><span className="text-graphite">Submitted by</span> {request.submittedBy}</span>
              </div>
              <div className="flex min-h-12 items-center gap-2 border-t border-ink/10 py-3 text-sm dark:border-white/10">
                <Clock className="h-4 w-4 shrink-0 text-brand" />
                <span><span className="text-graphite">Submitted</span> {request.submitted}</span>
              </div>
            </div>
            {request.details?.length ? (
              <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
                {request.details.map((detail) => (
                  <div key={detail.label} className="border-t border-ink/10 py-3 dark:border-white/10">
                    <dt className="text-xs text-graphite">{detail.label}</dt>
                    <dd className="mt-1 break-words text-sm font-medium">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          {school ? (
            <section aria-labelledby="request-school-heading" className="border-t border-ink/10 pt-5 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="request-school-heading" className="font-semibold">School context</h2>
                <button
                  type="button"
                  className="text-sm font-semibold text-brand"
                  onClick={() => onOpenSchool(school)}
                >
                  Open full profile
                </button>
              </div>
              <dl className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex min-h-16 items-start gap-2 border-t border-ink/10 py-3 dark:border-white/10">
                  <Buildings className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <span className="min-w-0">
                    <dt className="text-xs text-graphite">School</dt>
                    <dd className="mt-1 break-words text-sm font-medium">{school.name}</dd>
                  </span>
                </div>
                <div className="border-t border-ink/10 py-3 dark:border-white/10">
                  <dt className="text-xs text-graphite">School ID</dt>
                  <dd className="mt-1 text-sm font-medium">{school.id}</dd>
                </div>
                <div className="border-t border-ink/10 py-3 dark:border-white/10">
                  <dt className="text-xs text-graphite">Account status</dt>
                  <dd className="mt-1">
                    <span className={`inline-flex min-h-7 items-center rounded-md px-2.5 py-1 text-xs font-semibold ${schoolStatusStyles[school.status]}`}>
                      {school.status}
                    </span>
                  </dd>
                </div>
                <div className="border-t border-ink/10 py-3 dark:border-white/10">
                  <dt className="text-xs text-graphite">Administrator</dt>
                  <dd className="mt-1 text-sm font-medium">{school.admin}</dd>
                </div>
                <div className="min-w-0 border-t border-ink/10 py-3 dark:border-white/10">
                  <dt className="text-xs text-graphite">Contact</dt>
                  <dd className="mt-1 break-words text-sm font-medium">{school.email}</dd>
                  <dd className="mt-1 break-words text-xs text-graphite">{school.phone}</dd>
                </div>
                <div className="border-t border-ink/10 py-3 dark:border-white/10">
                  <dt className="text-xs text-graphite">Plan and enrollment</dt>
                  <dd className="mt-1 text-sm font-medium">{school.plan}</dd>
                  <dd className="mt-1 text-xs text-graphite">
                    {school.students.toLocaleString()} students · {school.teachers.toLocaleString()} teachers
                  </dd>
                </div>
              </dl>
            </section>
          ) : (
            <p className="flex items-start gap-2 border-t border-ink/10 pt-4 text-sm text-graphite dark:border-white/10">
              <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {request.source === 'contact-message'
                ? 'This general enquiry is not linked to a school account.'
                : 'School profile is unavailable for this request.'}
            </p>
          )}

          <section aria-labelledby="request-actions-heading" className="border-t border-ink/10 pt-5 dark:border-white/10">
            <h2 id="request-actions-heading" className="font-semibold">Previous actions</h2>
            {request.previousActions?.length ? (
              <ol className="mt-2 divide-y divide-ink/10 dark:divide-white/10">
                {request.previousActions.map((item, index) => (
                  <li key={`${item.date}-${index}`} className="py-3 text-sm">
                    <p className="font-medium">{item.action}</p>
                    <p className="mt-1 text-xs text-graphite">{item.operator} · {item.date}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-graphite">No previous actions recorded.</p>
            )}
          </section>

          <section className="border-t border-ink/10 pt-5 text-sm text-graphite dark:border-white/10">
            {request.source === 'contact-message'
              ? 'Mark handled is the only available update. It changes the stored handled status; decisions, replies, assignments, and private notes do not yet have a durable backend.'
              : 'No action is available for this request type until its server-side workflow is connected.'}
          </section>
        </div>
      )}
    </Modal>
  )
}
