import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import DemoModeBanner from '@/components/dashboard/DemoModeBanner'
import Sidebar from '@/components/dashboard/Sidebar'
import AdminNavigation from '@/components/dashboard/AdminNavigation'
import Topbar from '@/components/dashboard/Topbar'
import type { Role } from '@/types'

export default function DashboardLayout({ role }: { role: Role }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  if (role === 'admin') {
    return (
      <div className="admin-workspace">
        <div className="admin-app-frame">
          <DemoModeBanner />
          <Topbar onMenuClick={() => setMobileOpen(false)} />
          <AdminNavigation />
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

  return (
    <div className="flex min-h-screen bg-mist dark:bg-[#17191C]">
      <Sidebar role={role} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoModeBanner />
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="dashboard-shell min-w-0 flex-1 px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div key={location.pathname} className="route-motion route-motion--workspace">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
