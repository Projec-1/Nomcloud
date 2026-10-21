import { CaretDown as ChevronDown, Gear as Settings, ShieldCheck, UserCircle } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ResourceGate from '@/components/ui/ResourceGate'
import { useAuth } from '@/context/AuthContext'
import { useSelectedChild } from '@/hooks/useSelectedChild'

// ---------------------------------------------------------------------------
// The family workspace's Settings page.
//
// WHY THIS FILE IS MUCH SHORTER THAN IT WAS. It used to carry ten sections —
// timetable, attendance, homework, results, announcements, messages, children,
// notifications, overview — every one built from hardcoded arrays of invented
// pupils, marks and attendance percentages. None of them were reachable: each of
// those routes points at its own real page (ParentTimetable, ParentAttendance,
// ParentGrades, …). Only `/app/parent/settings` renders this component, so the
// unreachable invented sections are gone and the routed one is real.
//
// WHAT IS REAL HERE. The guardian's own name, email and school come from their
// session; their children come from student_guardians through useSelectedChild,
// scoped by RLS to their own family. The visual language — the eyebrow, the
// heading, the child switcher, the two-column cards — is unchanged.
//
// WHAT IS NOT BUILT. Per-guardian notification preferences have no table:
// schools.email_notifications and sms_notifications are school-wide settings an
// administrator controls, not a parent's. Rather than show switches that save
// nowhere, the card says so plainly.
// ---------------------------------------------------------------------------

export default function ParentWorkspace() {
  const { school, displayName, authUser } = useAuth()
  const { state, children, selectedChild, selectChild } = useSelectedChild()
  const [showChildMenu, setShowChildMenu] = useState(false)

  return (
    <>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Family workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-graphite">{school?.name ?? 'Your school'}</p>
        </div>
        {selectedChild && (
          <div className="relative">
            <button
              className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-3 py-2 text-left dark:border-white/10 dark:bg-white/5"
              onClick={() => setShowChildMenu((open) => !open)}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
                {selectedChild.name[0]}
              </span>
              <span>
                <span className="block text-sm font-semibold">{selectedChild.name}</span>
                <span className="block text-xs text-graphite">{selectedChild.className ?? 'No class yet'}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-graphite" />
            </button>
            {showChildMenu && (
              <div className="interaction-menu absolute right-0 z-20 mt-2 w-60 rounded-xl border border-ink/10 bg-white p-2 shadow-card dark:border-white/10 dark:bg-[#161618]">
                {children.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      selectChild(item.id)
                      setShowChildMenu(false)
                    }}
                    aria-pressed={item.id === selectedChild.id}
                    className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-brand/5"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                      {item.name[0]}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{item.name}</span>
                      <span className="block text-xs text-graphite">{item.className ?? 'No class yet'}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Profile</h2>
            <UserCircle className="h-5 w-5 text-brand" />
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-graphite">Name</dt>
              <dd className="mt-0.5 font-medium text-ink dark:text-white">{displayName || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-graphite">Email</dt>
              <dd className="mt-0.5 font-medium text-ink dark:text-white">{authUser?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-graphite">School</dt>
              <dd className="mt-0.5 font-medium text-ink dark:text-white">{school?.name ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-5 text-xs text-graphite">
            Ask your school to correct your name or email. Editing your own details from here is not available yet.
          </p>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Notifications</h2>
            <Badge tone="neutral">Not available yet</Badge>
          </div>
          <p className="text-sm text-graphite">
            Choosing which alerts you receive is not available yet. Your school controls notifications for everyone at the
            moment.
          </p>
          <Link to="/reset-password" className="mt-5 flex items-center gap-2 text-sm font-semibold text-brand">
            <Settings className="h-4 w-4" /> Change your password
          </Link>
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">My children</h2>
            <ShieldCheck className="h-5 w-5 text-brand" />
          </div>
          <ResourceGate
            state={state}
            empty={{
              icon: UserCircle,
              title: 'No children linked yet',
              description: 'Your school links your children to your account. Contact them if something is missing.',
            }}
            deniedHint="Family records are available to a linked parent or guardian."
          >
            {(rows) =>
              rows.length === 0 ? (
                <EmptyState icon={UserCircle} title="No children linked yet" />
              ) : (
                <ul className="divide-y divide-ink/5">
                  {rows.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
                        {item.name[0]}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">{item.name}</span>
                        <span className="block text-xs text-graphite">
                          {[item.className, item.admissionNo].filter(Boolean).join(' · ') || 'No class yet'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </ResourceGate>
        </div>
      </div>
    </>
  )
}
