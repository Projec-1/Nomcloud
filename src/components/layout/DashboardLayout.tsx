import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import DemoModeBanner from '@/components/dashboard/DemoModeBanner'
import Sidebar from '@/components/dashboard/Sidebar'
import Topbar from '@/components/dashboard/Topbar'
import AdminAIAssistant from '@/components/dashboard/AdminAIAssistant'
import type { Role } from '@/types'

export default function DashboardLayout({ role }: { role: Role }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className={`${role === 'admin' ? 'admin-workspace' : ''} flex min-h-screen bg-mist dark:bg-[#17191C]`}>
      <Sidebar role={role} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoModeBanner />
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="dashboard-shell min-w-0 flex-1 px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
      {role === 'admin' && location.pathname.startsWith('/app/admin') && <AdminAIAssistant />}
    </div>
  )
}
