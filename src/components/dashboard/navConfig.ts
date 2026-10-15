import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Layout as LayoutDashboard, Users, GraduationCap, BookOpen, CalendarCheck, ClipboardText as ClipboardList, ClipboardText as ClipboardCheck, ChartBar as BarChart3, Wallet, Bell, ChatText as MessageSquare, CalendarBlank as CalendarRange, Table as Table2, Gear as Settings, BellRinging as BellRing, UserCircle, PlayCircle, Pulse as Activity, TrendUp as TrendingUp, CreditCard } from '@phosphor-icons/react'
import type { Role } from '@/types'

export interface NavItem {
  to: string
  labelKey: string
  icon: PhosphorIcon
  end?: boolean
  group?: string
}

export const navByRole: Record<Role, NavItem[]> = {
  admin: [
    { to: '/app/admin', labelKey: 'dash.nav.dashboard', icon: LayoutDashboard, end: true },
    { to: '/app/admin/students', labelKey: 'dash.nav.students', icon: Users },
    { to: '/app/admin/teachers', labelKey: 'dash.nav.teachers', icon: GraduationCap },
    { to: '/app/admin/guardians', labelKey: 'dash.nav.guardians', icon: UserCircle },
    { to: '/app/admin/classes', labelKey: 'dash.nav.classes', icon: BookOpen },
    { to: '/app/admin/timetables', labelKey: 'dash.nav.timetables', icon: Table2 },
    { to: '/app/admin/attendance', labelKey: 'dash.nav.attendance', icon: CalendarCheck },
    { to: '/app/admin/grades', labelKey: 'dash.nav.grades', icon: ClipboardList },
    { to: '/app/admin/homework', labelKey: 'dash.nav.homework', icon: ClipboardCheck },
    { to: '/app/admin/exams', labelKey: 'dash.nav.exams', icon: BarChart3 },
    { to: '/app/admin/fees', labelKey: 'dash.nav.fees', icon: Wallet },
    { to: '/app/admin/fee-insights', labelKey: 'dash.nav.feeInsights', icon: TrendingUp },
    { to: '/app/billing', labelKey: 'dash.nav.subscriptionBilling', icon: CreditCard },
    { to: '/app/admin/announcements', labelKey: 'dash.nav.announcements', icon: Bell },
    { to: '/app/admin/messages', labelKey: 'dash.nav.messages', icon: MessageSquare },
    { to: '/app/admin/reports', labelKey: 'dash.nav.reports', icon: BarChart3 },
    { to: '/app/admin/teacher-activity', labelKey: 'dash.nav.teacherActivity', icon: Activity },
    { to: '/app/admin/academic-years', labelKey: 'dash.nav.academicYears', icon: CalendarRange },
    { to: '/app/admin/tutorials', labelKey: 'dash.nav.tutorials', icon: PlayCircle },
    { to: '/app/admin/settings', labelKey: 'dash.nav.settings', icon: Settings },
  ],
  teacher: [
    { to: '/app/teacher', labelKey: 'dash.nav.dashboard', icon: LayoutDashboard, end: true },
    { to: '/app/teacher/timetable', labelKey: 'dash.nav.timetable', icon: Table2 },
    { to: '/app/teacher/attendance', labelKey: 'dash.nav.attendance', icon: CalendarCheck },
    { to: '/app/teacher/grades', labelKey: 'dash.nav.grades', icon: ClipboardList },
    { to: '/app/teacher/homework', labelKey: 'dash.nav.homework', icon: ClipboardCheck },
    { to: '/app/teacher/exams', labelKey: 'dash.nav.exams', icon: BarChart3 },
    { to: '/app/teacher/announcements', labelKey: 'dash.nav.announcements', icon: Bell },
    { to: '/app/teacher/messages', labelKey: 'dash.nav.messages', icon: MessageSquare },
    { to: '/app/teacher/progress', labelKey: 'dash.nav.progress', icon: TrendingUp },
    { to: '/app/teacher/notifications', labelKey: 'dash.nav.notifications', icon: BellRing },
    { to: '/app/teacher/tutorials', labelKey: 'dash.nav.tutorials', icon: PlayCircle },
  ],
  parent: [
    { to: '/app/parent', labelKey: 'dash.nav.overview', icon: LayoutDashboard, end: true },
    { to: '/app/parent/timetable', labelKey: 'dash.nav.timetable', icon: Table2 },
    { to: '/app/parent/attendance', labelKey: 'dash.nav.attendance', icon: CalendarCheck },
    { to: '/app/parent/homework', labelKey: 'dash.nav.homework', icon: ClipboardCheck },
    { to: '/app/parent/grades', labelKey: 'dash.nav.results', icon: ClipboardList },
    { to: '/app/parent/announcements', labelKey: 'dash.nav.announcements', icon: Bell },
    { to: '/app/parent/messages', labelKey: 'dash.nav.messages', icon: MessageSquare },
    { to: '/app/parent/children', labelKey: 'dash.nav.myChildren', icon: UserCircle, group: 'Account' },
    { to: '/app/parent/notifications', labelKey: 'dash.nav.notifications', icon: BellRing, group: 'Account' },
    { to: '/app/parent/settings', labelKey: 'dash.nav.settings', icon: Settings, group: 'Account' },
  ],
}

export const roleLabelKey: Record<Role, string> = {
  admin: 'dash.role.admin',
  teacher: 'dash.role.teacher',
  parent: 'dash.role.parent',
}
