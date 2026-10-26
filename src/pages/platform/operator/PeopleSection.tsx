import { useMemo, useState } from 'react'
import { Buildings, IdentificationCard, Users, UserSwitch } from '@phosphor-icons/react'
import type { School } from '@/pages/platform/types'
import { KpiTile, Panel, SearchBox, SectionHeader } from './PrototypeKit'

export default function PeopleSection({
  schools,
  loading,
  onSchool,
}: {
  schools: School[]
  loading: boolean
  onSchool: (school: School) => void
}) {
  const [query, setQuery] = useState('')
  const visibleSchools = useMemo(() => schools.filter((school) =>
    `${school.name} ${school.admin} ${school.email} ${school.phone} ${school.location}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  ), [query, schools])
  const contactCount = schools.filter((school) =>
    (school.email.trim() && school.email !== '—') || (school.phone.trim() && school.phone !== '—'),
  ).length

  return <>
    <SectionHeader
      eyebrow="Network directory"
      title="People"
      description="School administrator and organization contact details from the school records already available to this workspace."
    />
    <div className="grid gap-4 md:grid-cols-3">
      <KpiTile label="Schools loaded" value={loading ? '…' : schools.length.toLocaleString()} detail="From the platform school query" icon={Buildings} />
      <KpiTile label="Schools with contact details" value={loading ? '…' : contactCount.toLocaleString()} detail="Email or phone present" icon={IdentificationCard} />
      <KpiTile label="Network-wide people" value="Not available" detail="No all-members directory read" icon={Users} tone="warning" />
    </div>
    <Panel title="School contacts" description="This is not a directory of every teacher, guardian, or membership. Open a school to inspect its available record." className="mt-6">
      <SearchBox value={query} onChange={setQuery} placeholder="Search school or contact…" label="Search school contacts" />
      {loading ? <p role="status" className="py-6 text-sm text-graphite">Loading school contact records…</p>
        : visibleSchools.length ? <ul className="mt-4 divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
          {visibleSchools.map((school) => <li key={school.id}>
            <button type="button" onClick={() => onSchool(school)} className="flex min-h-20 w-full items-start gap-3 py-4 text-left hover:bg-ink/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/[0.03]">
              <span className="mt-0.5 rounded-xl bg-brand/10 p-2.5 text-brand"><Buildings className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{school.name}</span>
                <span className="mt-1 block text-xs text-graphite">Administrator: {school.admin}</span>
                <span className="mt-1 block break-all text-xs text-graphite">{school.email} · {school.phone}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-brand">Open school</span>
            </button>
          </li>)}
        </ul> : <p className="py-6 text-sm text-graphite">{schools.length ? 'No school contacts match this search.' : 'No school contact records are available.'}</p>}
    </Panel>
    <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-graphite"><UserSwitch className="mt-0.5 h-4 w-4 shrink-0" />Role changes and a complete people directory remain unavailable until a narrowly scoped, server-authorized workflow exists.</p>
  </>
}
