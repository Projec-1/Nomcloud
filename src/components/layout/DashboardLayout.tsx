import { Outlet, useLocation } from 'react-router-dom'
import DemoModeBanner from '@/components/dashboard/DemoModeBanner'
import WorkspaceNavigation from '@/components/dashboard/WorkspaceNavigation'
import Topbar from '@/components/dashboard/Topbar'
import type { Role } from '@/types'

export default function DashboardLayout({ role }: { role: Role }) {
  const location = useLocation()

  return (
    <div className="admin-workspace">
      <div className="admin-app-frame">
        <DemoModeBanner />
        <Topbar />
        <WorkspaceNavigation role={role} />
        <main className="dashboard-shell admin-dashboard-shell min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <div className="mx-auto max-w-[1180px]">
            <div key={location.pathname} className="route-motion route-motion--workspace">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
