import { useEffect, useState } from 'react'
import { CalendarBlank as CalendarRange } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { useSelectedChild } from '@/hooks/useSelectedChild'
import ChildSwitcher from '@/components/dashboard/ChildSwitcher'
import TimetableGrid from '@/components/dashboard/TimetableGrid'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import ResourceGate from '@/components/ui/ResourceGate'
import { deriveResourceState } from '@/lib/resourceState'
import { fetchChildTimetable } from '@/services/guardianService'
import type { TimetableSlotView } from '@/services/teacherService'
import { toError } from '@/utils/errorMessage'

export default function ParentTimetable() {
  const { school } = useAuth()
  const { t } = useLanguage()
  const { children, selectedChild, selectChild, state: childrenState } = useSelectedChild()
  const [slots, setSlots] = useState<TimetableSlotView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const schoolId = school?.id ?? null
  const classId = selectedChild?.classId ?? null

  useEffect(() => {
    let cancelled = false
    if (!schoolId || !classId) {
      setSlots([])
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    fetchChildTimetable(schoolId, classId)
      .then((rows) => {
        if (!cancelled) setSlots(rows)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toError(cause))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, classId, reloadKey])

  if (childrenState.status !== 'ready') {
    return (
      <div>
        <PageHeader title={t('parent.timetable.title')} />
        <ResourceGate state={childrenState} empty={{ title: t('parent.timetable.noChildren') }} deniedHint={t('parent.fees.access')}>
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  if (!selectedChild) {
    return (
      <div>
        <PageHeader title={t('parent.timetable.title')} />
        <EmptyState
          icon={CalendarRange}
          title={t('parent.timetable.noChildren')}
          description={t('parent.timetable.contactAdmin')}
        />
      </div>
    )
  }

  if (!classId) {
    return (
      <div>
        <PageHeader title={t('parent.timetable.title')} description={t('parent.timetable.noEnrolment', { name: selectedChild.name })} />
        <ChildSwitcher children={children} selectedId={selectedChild.id} onSelect={selectChild} classLabel={(child) => child.className ?? ''} />
        <div className="mt-6">
          <EmptyState icon={CalendarRange} title={t('parent.timetable.noClassTimetable')} description={t('parent.timetable.noClassTimetableDescription')} />
        </div>
      </div>
    )
  }

  const timetableState = deriveResourceState({
    isLoading,
    canAccess: schoolId !== null && classId !== null,
    error,
    data: slots,
    retry: () => setReloadKey((current) => current + 1),
  })

  return (
    <div>
      <PageHeader
        title={t('parent.timetable.title')}
        description={`${selectedChild.name} · ${selectedChild.className ?? t('parent.timetable.assignedClass')}`}
        actions={<ChildSwitcher children={children} selectedId={selectedChild.id} onSelect={selectChild} classLabel={(child) => child.className ?? ''} />}
      />
      <ResourceGate state={timetableState} empty={{ icon: CalendarRange, title: t('parent.timetable.noPublishedTimetable') }} deniedHint={t('parent.timetable.unavailable')}>
        {(data) => <TimetableGrid slots={data} />}
      </ResourceGate>
    </div>
  )
}
