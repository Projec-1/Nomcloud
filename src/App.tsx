import { Routes, Route, Navigate } from 'react-router-dom'
import ScrollToTop from '@/components/layout/ScrollToTop'
import PublicLayout from '@/components/layout/PublicLayout'
import DashboardLayout from '@/components/layout/DashboardLayout'
import CookieConsent from '@/components/layout/CookieConsent'
import ProtectedRoute from '@/routes/ProtectedRoute'
import RoleRoute from '@/routes/RoleRoute'
import PlatformRoute from '@/routes/PlatformRoute'
import PlatformLayout from '@/components/layout/PlatformLayout'

import Home from '@/pages/public/Home'
import Solutions from '@/pages/public/Solutions'
import Features from '@/pages/public/Features'
import Pricing from '@/pages/public/Pricing'
import Security from '@/pages/public/Security'
import About from '@/pages/public/About'
import Contact from '@/pages/public/Contact'
import BookDemo from '@/pages/public/BookDemo'
import Privacy from '@/pages/public/Privacy'
import Terms from '@/pages/public/Terms'
import Cookies from '@/pages/public/Cookies'
import Login from '@/pages/public/Login'
import Signup from '@/pages/public/Signup'
import ResetPassword from '@/pages/public/ResetPassword'
import FirstLoginPassword from '@/pages/public/FirstLoginPassword'
import ActivateAccount from '@/pages/public/ActivateAccount'
import NotFound from '@/pages/public/NotFound'

import AdminDashboard from '@/pages/app/admin/Dashboard'
import AdminStudents from '@/pages/app/admin/Students'
import AdminTeachers from '@/pages/app/admin/Teachers'
import AdminGuardians from '@/pages/app/admin/Guardians'
import AdminClasses from '@/pages/app/admin/Classes'
import AdminTimetables from '@/pages/app/admin/Timetables'
import AdminAttendance from '@/pages/app/admin/Attendance'
import AdminGrades from '@/pages/app/admin/Grades'
import AdminHomework from '@/pages/app/admin/Homework'
import AdminExams from '@/pages/app/admin/Exams'
import AdminFees from '@/pages/app/admin/Fees'
import AdminFeeInsights from '@/pages/app/admin/FeeInsights'
import AdminAnnouncements from '@/pages/app/admin/Announcements'
import AdminMessages from '@/pages/app/admin/Messages'
import AdminReports from '@/pages/app/admin/Reports'
import AdminTeacherActivity from '@/pages/app/admin/TeacherActivity'
import AdminAcademicYears from '@/pages/app/admin/AcademicYears'
import AdminTutorials from '@/pages/app/admin/Tutorials'
import AdminSettings from '@/pages/app/admin/Settings'
import TeacherDashboard from '@/pages/app/teacher/Dashboard'
import TeacherClasses from '@/pages/app/teacher/Classes'
import TeacherTimetable from '@/pages/app/teacher/ConnectedTimetable'
import TeacherWorkspace from '@/pages/app/teacher/Workspace'
import TeacherAttendance from '@/pages/app/teacher/Attendance'
import TeacherGrades from '@/pages/app/teacher/Grades'
import TeacherHomework from '@/pages/app/teacher/Homework'
import TeacherAnnouncements from '@/pages/app/teacher/Announcements'
import TeacherMessages from '@/pages/app/teacher/Messages'
import TeacherTutorials from '@/pages/app/teacher/Tutorials'

import ParentDashboard from '@/pages/app/parent/Dashboard'
import ParentWorkspace from '@/pages/app/parent/Workspace'
import ParentTimetable from '@/pages/app/parent/Timetable'
import ParentChildren from '@/pages/app/parent/Children'
import ParentAttendance from '@/pages/app/parent/Attendance'
import ParentGrades from '@/pages/app/parent/Grades'
import ParentHomework from '@/pages/app/parent/Homework'
import ParentFees from '@/pages/app/parent/Fees'
import ParentAnnouncements from '@/pages/app/parent/Announcements'
import ParentNotifications from '@/pages/app/parent/Notifications'
import ParentMessages from '@/pages/app/parent/Messages'
import ParentTutorials from '@/pages/app/parent/Tutorials'
import PlatformPlaceholder from '@/pages/platform/Placeholder'
import PlatformWorkspace from '@/pages/platform/Workspace'

export default function App() {
  return (
    <>
      <ScrollToTop />
      <CookieConsent />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/solutions" element={<Solutions />} />
          <Route path="/features" element={<Features />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/security" element={<Security />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/book-demo" element={<BookDemo />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/cookies" element={<Cookies />} />
        </Route>

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {/* Where Supabase's password-recovery link lands. Public by design: the
            person following it is signed out and cannot reach anything else. */}
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Where the guards send someone provisioned with a temporary password.
            The page checks the session itself, so it is not wrapped in
            ProtectedRoute — that guard redirects here and would otherwise loop. */}
        <Route path="/first-login" element={<FirstLoginPassword />} />
        {/* Where the activation email lands. Public: the person following it is
            signed out until Supabase's link opens their session. */}
        <Route path="/activate" element={<ActivateAccount />} />
        <Route
          path="/__dev/platform-preview"
          element={import.meta.env.DEV ? <PlatformWorkspace /> : <NotFound />}
        />
        {/* The approval screen used to exist only in development builds at this
            path. It now lives in the platform workspace; the old address still works. */}
        <Route path="/dev/approval" element={<Navigate to="/platform/applications" replace />} />

        <Route
          path="/platform"
          element={
            <PlatformRoute>
              <PlatformLayout />
            </PlatformRoute>
          }
        >
          <Route index element={<PlatformWorkspace />} />
          <Route path="actions" element={<PlatformWorkspace />} />
          <Route path="schools" element={<PlatformWorkspace />} />
          <Route path="people" element={<PlatformWorkspace />} />
          <Route path="requests" element={<PlatformWorkspace />} />
          <Route path="communications" element={<PlatformWorkspace />} />
          <Route path="operators" element={<PlatformWorkspace />} />
          <Route path="permissions" element={<PlatformWorkspace />} />
          <Route path="features" element={<PlatformWorkspace />} />
          <Route path="integrations" element={<PlatformWorkspace />} />
          <Route path="billing" element={<PlatformWorkspace />} />
          <Route path="data" element={<PlatformWorkspace />} />
          <Route path="backups" element={<PlatformWorkspace />} />
          <Route path="activity" element={<PlatformWorkspace />} />
          <Route path="audit" element={<PlatformWorkspace />} />
          <Route path="security" element={<PlatformWorkspace />} />
          <Route path="health" element={<PlatformWorkspace />} />
          <Route path="maintenance" element={<PlatformWorkspace />} />
          <Route path="analytics" element={<PlatformWorkspace />} />
          <Route path="settings" element={<PlatformWorkspace />} />
          <Route path="templates/*" element={<Navigate to="/platform" replace />} />
          {/* School applications run inside the same Operator Control Center
              shell as every other platform section, so they share its header,
              sidebar, theme switcher and spacing instead of a private layout. */}
          <Route path="applications" element={<PlatformWorkspace />} />
          <Route path="applications/:applicationId" element={<PlatformWorkspace />} />
        </Route>

        <Route
          path="/app/admin"
          element={
            <ProtectedRoute>
              <RoleRoute role="admin">
                <DashboardLayout role="admin" />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="teachers" element={<AdminTeachers />} />
          <Route path="guardians" element={<AdminGuardians />} />
          <Route path="classes" element={<AdminClasses />} />
          <Route path="timetables" element={<AdminTimetables />} />
          <Route path="attendance" element={<AdminAttendance />} />
          <Route path="grades" element={<AdminGrades />} />
          <Route path="homework" element={<AdminHomework />} />
          <Route path="exams" element={<AdminExams />} />
          <Route path="fees" element={<AdminFees />} />
          <Route path="fee-insights" element={<AdminFeeInsights />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="teacher-activity" element={<AdminTeacherActivity />} />
          <Route path="academic-years" element={<AdminAcademicYears />} />
          <Route path="tutorials" element={<AdminTutorials />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route
          path="/app/teacher"
          element={
            <ProtectedRoute>
              <RoleRoute role="teacher">
                <DashboardLayout role="teacher" />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<TeacherDashboard />} />
          <Route path="classes" element={<TeacherClasses />} />
          <Route path="timetable" element={<TeacherTimetable />} />
          <Route path="my-day" element={<Navigate to="/app/teacher" replace />} />
          <Route path="students" element={<Navigate to="/app/teacher" replace />} />
          <Route path="my-students" element={<Navigate to="/app/teacher" replace />} />
          <Route path="resources" element={<Navigate to="/app/teacher" replace />} />
          <Route path="progress" element={<TeacherGrades />} />
          <Route path="profile" element={<TeacherWorkspace />} />
          <Route path="notifications" element={<TeacherWorkspace />} />
          <Route path="attendance" element={<TeacherAttendance />} />
          <Route path="grades" element={<TeacherGrades />} />
          <Route path="homework" element={<TeacherHomework />} />
          <Route path="assignments" element={<TeacherHomework />} />
          <Route path="lessons" element={<TeacherTimetable />} />
          <Route path="exams" element={<TeacherWorkspace />} />
          <Route path="class-performance" element={<Navigate to="/app/teacher" replace />} />
          <Route path="announcements" element={<TeacherAnnouncements />} />
          <Route path="messages" element={<TeacherMessages />} />
          <Route path="tutorials" element={<TeacherTutorials />} />
        </Route>

        <Route
          path="/app/parent"
          element={
            <ProtectedRoute>
              <RoleRoute role="parent">
                <DashboardLayout role="parent" />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<ParentDashboard />} />
          <Route path="children" element={<ParentChildren />} />
          <Route path="timetable" element={<ParentTimetable />} />
          <Route path="attendance" element={<ParentAttendance />} />
          <Route path="grades" element={<ParentGrades />} />
          <Route path="homework" element={<ParentHomework />} />
          <Route path="fees" element={<ParentFees />} />
          <Route path="announcements" element={<ParentAnnouncements />} />
          <Route path="notifications" element={<ParentNotifications />} />
          <Route path="messages" element={<ParentMessages />} />
          <Route path="tutorials" element={<ParentTutorials />} />
          <Route path="settings" element={<ParentWorkspace />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
