import { ClipboardText as ClipboardCheck } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import ResourceGate from '@/components/ui/ResourceGate'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import HomeworkBoard from '@/components/dashboard/HomeworkBoard'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'
import { DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'

// Phase 8 batch 5. Real homework and homework_submissions, SUBJECT-EXACT.
//
// Homework is the one table in this batch where a teacher also holds DELETE, and
// only for a subject they teach. The board shows the delete control on that
// basis rather than everywhere.

export default function TeacherHomework() {
  const { t } = useLanguage()
  const { school } = useAuth()
  const { state, schoolId } = useRecordableClasses()

  return (
    <div>
      <PageHeader title={t('teacher.homework.title')} description={t('teacher.homework.description')} />
      <ResourceGate
        state={state}
        empty={{
          icon: ClipboardCheck,
          title: 'No classes assigned yet',
          description: "You'll be able to assign homework once a class is assigned to you.",
        }}
        deniedHint="Class records are available to an assigned teacher."
      >
        {(myClasses) => (
          <HomeworkBoard
            classes={myClasses}
            schoolId={schoolId as string}
            timeZone={school?.timezone ?? DEFAULT_TIME_ZONE}
          />
        )}
      </ResourceGate>
    </div>
  )
}
