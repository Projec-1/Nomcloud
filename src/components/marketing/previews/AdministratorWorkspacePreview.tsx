import { useState } from 'react'
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarCheck,
  ChatText,
  Check,
  Clock,
  CurrencyDollar,
  Gear,
  SquaresFour,
  Users,
} from '@phosphor-icons/react'
import BrowserFrame from '@/components/marketing/BrowserFrame'

const sections = [
  { label: 'Overview', icon: SquaresFour },
  { label: 'Students', icon: Users },
  { label: 'Attendance', icon: CalendarCheck },
  { label: 'Academics', icon: BookOpen },
  { label: 'Messages', icon: ChatText },
  { label: 'Teachers', icon: Users },
  { label: 'Fees', icon: CurrencyDollar },
  { label: 'Timetable', icon: Clock },
  { label: 'Settings', icon: Gear },
]

const studentRows = [
  ['Ayaan Abdi', 'NC-1048', 'Grade 7A', 'Active'],
  ['Hassan Ahmed', 'NC-1047', 'Grade 6B', 'Active'],
  ['Maryan Ali', 'NC-1046', 'Grade 8A', 'Review'],
]

const classSchedule = [
  ['08:30', 'Mathematics', 'Grade 7A', 'Room 12'],
  ['10:15', 'Science', 'Grade 6B', 'Lab 04'],
  ['13:00', 'English', 'Grade 8A', 'Room 08'],
]

function OverviewContent() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Students', '1,248'],
          ['Teachers', '68'],
          ['Attendance', '94.8%'],
          ['Fees due', '$12,480'],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 border-t border-ink/10 py-3 dark:border-white/10">
            <p className="text-xs text-graphite">{label}</p>
            <p className="mt-1 break-words text-xl font-semibold tabular-nums text-ink dark:text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section aria-label="Attendance trend" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Attendance this term</h3>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <ArrowUpRight className="h-3.5 w-3.5" /> +4.8%
            </span>
          </div>
          <div className="mt-4 flex h-28 items-end gap-1.5 border-b border-ink/10 dark:border-white/10">
            {[42, 54, 48, 66, 58, 72, 68, 80, 88, 74, 90, 97].map((height, index) => (
              <div
                key={index}
                role="img"
                aria-label={`Week ${index + 1}: ${height}%`}
                className={`min-w-0 flex-1 ${index > 8 ? 'bg-brand' : 'bg-brand/25'}`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-graphite"><span>Week 01</span><span>Week 12</span></div>
        </section>
        <section aria-label="Recent activity">
          <h3 className="text-sm font-semibold">Recent activity</h3>
          <ul className="mt-2 divide-y divide-ink/10 dark:divide-white/10">
            {[
              'Attendance submitted',
              'New student enrolled',
              'Grades published',
            ].map((item) => (
              <li key={item} className="flex min-h-10 items-center gap-2 py-2 text-xs">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function RecordList({ rows, headers }: { rows: string[][]; headers: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-ink/10 text-graphite dark:border-white/10">
            {headers.map((header) => <th key={header} scope="col" className="px-3 py-2 font-medium">{header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/10 dark:divide-white/10">
          {rows.map((row) => (
            <tr key={row.join('-')}>
              {row.map((value, index) => (
                <td key={`${index}-${value}`} className={`max-w-44 px-3 py-3 ${index === row.length - 1 ? 'font-medium' : ''}`}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionContent({ section }: { section: string }) {
  if (section === 'Overview') return <OverviewContent />
  if (section === 'Students') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-graphite">Student directory <span className="tabular-nums">· 1,248 records</span></p>
        <RecordList headers={['Student', 'Admission ID', 'Class', 'Status']} rows={studentRows} />
      </div>
    )
  }
  if (section === 'Attendance') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-graphite">Today · Grade 7A</p>
          <p className="text-sm font-semibold tabular-nums">28 of 30 present</p>
        </div>
        <RecordList
          headers={['Student', 'Class', 'Attendance']}
          rows={[
            ['Ayaan Abdi', '7A', 'Present'],
            ['Hassan Ahmed', '7A', 'Present'],
            ['Maryan Ali', '7A', 'Late'],
          ]}
        />
      </div>
    )
  }
  if (section === 'Academics') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-graphite">Term 2 assessment results</p>
        <RecordList
          headers={['Student', 'Subject', 'Score', 'Grade']}
          rows={[
            ['Ayaan Abdi', 'Mathematics', '87 / 100', 'B+'],
            ['Hassan Ahmed', 'Science', '92 / 100', 'A'],
            ['Maryan Ali', 'English', '78 / 100', 'B'],
          ]}
        />
      </div>
    )
  }
  if (section === 'Messages') {
    return (
      <ul className="divide-y divide-ink/10 dark:divide-white/10">
        {[
          ['Amina Yusuf · Grade 7A', 'Conference confirmed for Saturday.', '9:42'],
          ['Hassan Ali · Grade 6B', 'Thank you for the attendance update.', 'Yesterday'],
          ['Staff group', 'Term calendar has been shared.', 'Sep 24'],
        ].map(([sender, message, time]) => (
          <li key={sender} className="flex min-w-0 items-start gap-3 py-4">
            <ChatText className="mt-1 h-4 w-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{sender}</p>
              <p className="mt-1 break-words text-xs text-graphite">{message}</p>
            </div>
            <time className="shrink-0 text-xs text-graphite">{time}</time>
          </li>
        ))}
      </ul>
    )
  }
  if (section === 'Teachers') {
    return (
      <RecordList
        headers={['Teacher', 'Subject', 'Classes', 'Status']}
        rows={[
          ['Fadumo Hassan', 'Mathematics', '6A, 7A', 'Active'],
          ['Omar Ahmed', 'Science', '6B, 8A', 'Active'],
          ['Asha Mohamed', 'English', '7A, 8B', 'Active'],
        ]}
      />
    )
  }
  if (section === 'Fees') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-graphite">Current term · Outstanding balance <strong className="font-semibold text-ink dark:text-white">$12,480</strong></p>
        <RecordList
          headers={['Student', 'Fee', 'Due date', 'Status']}
          rows={[
            ['Ayaan Abdi', 'Tuition · $420', 'Oct 01', 'Part paid'],
            ['Hassan Ahmed', 'Tuition · $420', 'Oct 01', 'Paid'],
            ['Maryan Ali', 'Transport · $80', 'Oct 05', 'Due'],
          ]}
        />
      </div>
    )
  }
  if (section === 'Timetable') {
    return (
      <RecordList
        headers={['Time', 'Class', 'Group', 'Room']}
        rows={classSchedule}
      />
    )
  }
  return (
    <div className="max-w-xl divide-y divide-ink/10 dark:divide-white/10">
      {[
        ['School profile', 'Nom Cloud Academy'],
        ['Academic year', '2026–2027 · Active'],
        ['Parent portal', 'Enabled'],
        ['Notifications', 'Email and in-app'],
      ].map(([label, value]) => (
        <div key={label} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
          <span className="text-graphite">{label}</span><span className="font-medium">{value}</span>
        </div>
      ))}
    </div>
  )
}

export default function AdministratorWorkspacePreview({ interactive = false }: { interactive?: boolean }) {
  const [activeSection, setActiveSection] = useState('Overview')
  const ActiveIcon = sections.find((section) => section.label === activeSection)?.icon ?? SquaresFour

  return (
    <BrowserFrame className="w-full">
      <div className={`flex min-h-[390px] bg-white text-ink dark:bg-[#202320] dark:text-white sm:min-h-[430px] ${interactive ? '' : 'pointer-events-none cursor-default select-none'}`}>
        <aside className="hidden w-48 shrink-0 border-r border-ink/10 bg-white px-3 py-4 dark:border-white/10 dark:bg-[#202320] md:block">
          <div className="mb-5 flex items-center gap-2 px-2">
            <img src="/logo-512.png" alt="Nom Cloud" className="h-8 w-8 shrink-0 object-contain" />
            <span className="min-w-0 text-sm font-semibold">Nom Cloud</span>
          </div>
          <nav aria-label="Administrator workspace preview" className="space-y-1">
            {sections.map(({ label, icon: Icon }) => (
              interactive ? (
                <button
                  key={label}
                  type="button"
                  aria-pressed={activeSection === label}
                  onClick={() => setActiveSection(label)}
                  className={`flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
                    activeSection === label
                      ? 'bg-brand/10 text-brand'
                      : 'text-graphite hover:bg-ink/[0.04] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </button>
              ) : (
                <div
                  key={label}
                  aria-current={activeSection === label ? 'page' : undefined}
                  className={`flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium ${
                    activeSection === label ? 'bg-brand/10 text-brand' : 'text-graphite'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </div>
              )
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 border-b border-ink/10 pb-3 dark:border-white/10">
            <div className="flex min-w-0 items-center gap-2">
              <img src="/logo-512.png" alt="" className="h-7 w-7 shrink-0 object-contain md:hidden" />
              <ActiveIcon className="hidden h-4 w-4 shrink-0 text-brand md:block" />
              <h2 className="truncate text-sm font-semibold">{activeSection}</h2>
              <span className="hidden text-xs text-graphite sm:inline">· Nom Cloud Academy</span>
            </div>
            <div aria-label="Notifications" className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink/10 dark:border-white/10">
              <Bell className="h-4 w-4" />
            </div>
          </div>

          <nav aria-label="Preview sections" className="mt-3 flex gap-1 overflow-x-auto pb-2 md:hidden">
            {sections.map(({ label }) => (
              interactive ? (
                <button
                  key={label}
                  type="button"
                  aria-pressed={activeSection === label}
                  onClick={() => setActiveSection(label)}
                  className={`min-h-10 shrink-0 whitespace-nowrap px-3 text-xs font-medium ${
                    activeSection === label
                      ? 'bg-brand/10 text-brand'
                      : 'text-graphite hover:bg-ink/[0.04] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  {label}
                </button>
              ) : (
                <span
                  key={label}
                  aria-current={activeSection === label ? 'page' : undefined}
                  className={`min-h-10 shrink-0 whitespace-nowrap px-3 py-3 text-xs font-medium ${
                    activeSection === label ? 'bg-brand/10 text-brand' : 'text-graphite'
                  }`}
                >
                  {label}
                </span>
              )
            ))}
          </nav>

          <div className="pt-4">
            <SectionContent section={activeSection} />
          </div>
        </main>
      </div>
    </BrowserFrame>
  )
}
