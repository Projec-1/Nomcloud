import { Outlet, useLocation } from 'react-router-dom'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'

export default function PublicLayout() {
  const location = useLocation()

  return (
    <div className="public-site flex min-h-screen flex-col bg-mist dark:bg-[#17191C]">
      <PublicHeader />
      <main className="flex-1">
        <div key={location.pathname} className="route-motion">
          <Outlet />
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
