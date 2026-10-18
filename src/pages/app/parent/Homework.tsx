import { ClipboardText as ClipboardCheck, Calendar } from '@phosphor-icons/react'
import { useSelectedChild } from '@/hooks/useSelectedChild'
import { useChildHomework } from '@/hooks/useChildRecords'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import ChildSwitcher from '@/components/dashboard/ChildSwitcher'
import ResourceGate from '@/components/ui/ResourceGate'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/utils/format'

// Phase 8 batch 5. Real homework for the class the selected child is enrolled in.
//
// READ ONLY, AND THAT IS A DELIBERATE REMOVAL RATHER THAN AN OMISSION.
//
// The prototype rendered a "Mark as Submitted" button here that called
// updateSubmission on the child's behalf. Decision 4 of RLS batch 4 settled the
// opposite: guardians do NOT digitally submit homework. Homework is physical and
// the teacher marks it reviewed in person, which is why no guardian write policy
// exists on homework_submissions at all. The button is gone rather than
// disabled, because leaving it visible would promise something the database
// refuses — and a refused UPDATE returns zero rows with no error, so the parent
// would have seen a success message and no change.
//
// The status shown is the teacher's own record. A child with no submission row
// reads as `pending`, since nothing creates those rows at assignment time.
//
// The attachment count is gone too: homework has no such column, and there is no
// Storage bucket for one to point at (open decision 10).

const statusTone = { pending: 'warning', submitted: 'info', late: 'danger', graded: 'success' } as const

export default function ParentHomework() {
  const { t } = useLanguage()
  const { children, selectedChild, selectChild, state } = useSelectedChild()
  const { state: homeworkState } = useChildHomework(selectedChild?.id ?? null, selectedChild?.classId ?? null)

  if (!selectedChild) {
    return (
      <div>
        <PageHeader title={t('parent.homework.title')} description={t('parent.homework.description')} />
        <ResourceGate
          state={state}
          empty={{ icon: ClipboardCheck, title: "No children linked yet", description: "Contact your school administrator to link your child's record." }}
          deniedHint="Child records are available to a linked parent or guardian."
        >
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={t('parent.homework.title')}
        description={`${selectedChild.name} · ${selectedChild.className ?? ''}`}
        actions={<ChildSwitcher children={children} selectedId={selectedChild.id} onSelect={selectChild} classLabel={(c) => c.className ?? ''} />}
      />

      <ResourceGate
        state={homeworkState}
        empty={{
          icon: ClipboardCheck,
          title: 'No homework assigned',
          description: "Homework assigned to your child's class will appear here.",
        }}
        deniedHint="Child records are available to a linked parent or guardian."
      >
        {(items) => (
          <div className="space-y-4">
            {items.map((hw) => (
              <div key={hw.id} className="card p-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="info">{hw.subjectName}</Badge>
                  <Badge tone={statusTone[hw.status]}>{hw.status}</Badge>
                </div>
                <p className="font-medium text-ink dark:text-white">{hw.title}</p>
                {hw.description && <p className="mt-1.5 text-sm text-graphite">{hw.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-graphite">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Due {formatDate(hw.dueDate)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ResourceGate>
    </div>
  )
}
