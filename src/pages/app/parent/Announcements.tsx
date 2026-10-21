import { Megaphone } from '@phosphor-icons/react'
import PageHeader from '@/components/ui/PageHeader'
import { useLanguage } from '@/context/LanguageContext'
import ResourceGate from '@/components/ui/ResourceGate'
import AnnouncementBoard from '@/components/dashboard/AnnouncementBoard'
import { useAnnouncements } from '@/hooks/useCommunications'
import { useSelectedChild } from '@/hooks/useSelectedChild'

// Phase 8 batch 7. Real announcements, read-only for a guardian.
//
// A CLIENT-SIDE MISREADING IS FIXED BY DELETION. The prototype filtered to
// audience 'all', 'parents', 'students' and the child's class. Including
// 'students' was wrong: migration 14 is explicit that 'students' is visible to
// management only, because V1 issues students no logins, and that treating it as
// a guardian audience "would silently redirect a message meant for children to
// their parents".
//
// No audience filter is applied here at all now. The guardian SELECT policies
// decide readership: 'all' and 'parents' through announcements_guardian_select,
// plus class notices for a class their own child is enrolled in through
// announcements_guardian_class_select. 'students' is not among them, so it never
// arrives.

export default function ParentAnnouncements() {
  const { t } = useLanguage()
  const { state, schoolId, reload } = useAnnouncements()
  const { selectedChild } = useSelectedChild()

  // Only needed to label a class notice. A guardian sees notices for their own
  // child's class, so that is the only class name worth resolving here.
  const classes =
    selectedChild?.classId && selectedChild.className
      ? [{ id: selectedChild.classId, name: selectedChild.className }]
      : []

  return (
    <div>
      <PageHeader title={t('parent.announcements.title')} description={t('parent.announcements.description')} />
      <ResourceGate
        state={state}
        empty={{
          icon: Megaphone,
          title: 'No announcements yet',
          description: 'School news for parents will appear here.',
        }}
        deniedHint="Announcements are available to school members."
      >
        {(rows) => (
          <AnnouncementBoard
            announcements={rows}
            classes={classes}
            schoolId={schoolId as string}
            canManage={false}
            audienceOptions={[]}
            onChanged={reload}
          />
        )}
      </ResourceGate>
    </div>
  )
}
