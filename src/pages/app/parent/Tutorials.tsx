import TutorialsPage, { type TutorialVideo } from '@/components/dashboard/TutorialsPage'
import { useLanguage } from '@/context/LanguageContext'

const videos: Omit<TutorialVideo, 'title' | 'description'>[] = [
  { duration: '2:30', tint: '#0071E3' },
  { duration: '1:45', tint: '#FF5A1F' },
  { duration: '3:05', tint: '#34A853' },
  { duration: '2:00', tint: '#A855F7' },
]

export default function ParentTutorials() {
  const { t } = useLanguage()
  return (
    <TutorialsPage
      title={t('parent.tutorials.title')}
      description={t('parent.tutorials.description')}
      videos={videos.map((video, index) => ({
        ...video,
        title: t(`parent.tutorials.video${index + 1}.title`),
        description: t(`parent.tutorials.video${index + 1}.description`),
      }))}
    />
  )
}
