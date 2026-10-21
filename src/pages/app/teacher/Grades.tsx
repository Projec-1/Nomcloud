import { ClipboardText as ClipboardList } from '@phosphor-icons/react'
import ResourceGate from '@/components/ui/ResourceGate'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import GradeBook from '@/components/dashboard/GradeBook'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'

// Phase 8 batch 5. Real grade_records, with SUBJECT-EXACT writes.
//
// A teacher reads the whole class's grades but may enter marks only in subjects
// they are assigned to teach. The subject selector inside GradeBook is built
// from ClassSummary.writableSubjects for exactly that reason, so a subject this
// teacher does not teach is never offered rather than being refused on save.

export default function TeacherGrades() {
  const { t } = useLanguage()
  const { state, schoolId } = useRecordableClasses()

  return (
    <div>
      <PageHeader title={t('teacher.grades.title')} description={t('teacher.grades.description')} />
      <ResourceGate
        state={state}
        empty={{
          icon: ClipboardList,
          title: 'No classes assigned yet',
          description: "You'll be able to record grades once a class is assigned to you.",
        }}
        deniedHint="Class records are available to an assigned teacher."
      >
        {(myClasses) => <GradeBook classes={myClasses} schoolId={schoolId as string} />}
      </ResourceGate>
    </div>
  )
}
