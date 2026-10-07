import { GraduationCap } from '@phosphor-icons/react'
import PageHeader from '@/components/ui/PageHeader'
import ResourceGate from '@/components/ui/ResourceGate'
import GradeBook from '@/components/dashboard/GradeBook'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'

// Phase 8 batch 5. Real school-wide classes and real grade_records.
//
// Management writes through can_manage_class, which is CLASS-level, so every
// subject of a class is writable here. The same component narrows to a teacher's
// own subjects when a teacher mounts it, because the restriction lives in
// ClassSummary.writableSubjects rather than in the screen.

export default function AdminGrades() {
  const { state, classes, schoolId } = useRecordableClasses()

  return (
    <div>
      <PageHeader title="Grades" description="Review class assessment scores and export performance reports." />
      <ResourceGate
        state={state}
        empty={{
          icon: GraduationCap,
          title: 'No classes yet',
          description: 'Create a class and enrol students to begin recording grades.',
        }}
        deniedHint="Grade records are available to school staff."
      >
        {(visibleClasses) => <GradeBook classes={visibleClasses} schoolId={schoolId as string} readOnly />}
      </ResourceGate>
    </div>
  )
}
