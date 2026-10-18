import TutorialsPage, { type TutorialVideo } from '@/components/dashboard/TutorialsPage'
import { useLanguage } from '@/context/LanguageContext'

const videos: Omit<TutorialVideo, 'title' | 'description'>[] = [
  { duration: '2:10', tint: '#34A853' },
  { duration: '3:34', tint: '#0071E3' },
  { duration: '3:52', tint: '#A855F7' },
  { duration: '2:47', tint: '#FF5A1F' },
  { duration: '2:15', tint: '#14B8A6' },
]

export default function TeacherTutorials() {
  const { t } = useLanguage()
  return (
    <TutorialsPage
      title={t('teacher.tutorials.title')}
      description={t('teacher.tutorials.description')}
      videos={videos.map((video, index) => ({
        ...video,
        title: t(`teacher.tutorials.video${index + 1}.title`),
        description: t(`teacher.tutorials.video${index + 1}.description`),
      }))}
    />
  )
}
