import { CalendarCheck } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import ResourceGate from '@/components/ui/ResourceGate'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import AttendanceMarker from '@/components/dashboard/AttendanceMarker'
import { useRecordableClasses } from '@/hooks/useRecordableClasses'
import { DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'

// Phase 8 batch 5. Real attendance_records for the teacher's assigned classes.
//
// Attendance is CLASS-level, not subject-exact: attendance_records_teacher_insert
// checks teaches_class. A homeroom teacher who teaches none of this class's
// subjects can still mark this register, which is why no subject appears here.

export default function TeacherAttendance() {
  const { t } = useLanguage()
  const { school } = useAuth()
  const { state, schoolId } = useRecordableClasses()

  return (
    <div>
      <PageHeader title={t('teacher.attendance.title')} description={t('teacher.attendance.description')} />
      <ResourceGate
        state={state}
        empty={{
          icon: CalendarCheck,
          title: 'No classes assigned yet',
          description: "You'll be able to mark attendance once a class is assigned to you.",
        }}
        deniedHint="Class records are available to an assigned teacher."
      >
        {(myClasses) => (
          <AttendanceMarker
            classes={myClasses}
            schoolId={schoolId as string}
            timeZone={school?.timezone ?? DEFAULT_TIME_ZONE}
          />
        )}
      </ResourceGate>
    </div>
  )
}
