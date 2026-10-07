import { useMemo } from 'react'
import { Wallet } from '@phosphor-icons/react'
import PageHeader from '@/components/ui/PageHeader'
import ResourceGate from '@/components/ui/ResourceGate'
import AdminSectionInsights from '@/components/dashboard/AdminSectionInsights'
import { useFinance } from '@/hooks/useFinance'
import { formatMoney } from '@/utils/format'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { DEFAULT_TIME_ZONE, todayInTimeZone } from '@/utils/schoolCalendar'

export default function AdminFeeInsights() {
  const { school } = useAuth()
  const { state, records, currency } = useFinance()
  const { lang } = useLanguage()

  const months = useMemo(() => {
    const now = new Date(`${todayInTimeZone(school?.timezone ?? DEFAULT_TIME_ZONE)}T12:00:00`)
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const collected = records.reduce(
        (sum, record) => sum + record.payments.filter((payment) => payment.paidOn.startsWith(key)).reduce((total, payment) => total + payment.amount, 0),
        0,
      )
      const expected = records.reduce((sum, record) => sum + (record.dueDate.startsWith(key) ? record.amount : 0), 0)
      return {
        key,
        label: new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric' }).format(date),
        collected,
        expected,
      }
    })
  }, [lang, records, school?.timezone])

  const totals = useMemo(() => {
    const expected = records.reduce((sum, record) => sum + record.amount, 0)
    const collected = records.reduce((sum, record) => sum + record.amountPaid, 0)
    const overdueRecords = records.filter((record) => record.status === 'overdue')
    return {
      expected,
      collected,
      outstanding: Math.max(0, expected - collected),
      overdue: overdueRecords.reduce((sum, record) => sum + record.balance, 0),
      overdueCount: overdueRecords.length,
    }
  }, [records])
  const overdueByMonth = months.map((month) => ({
    label: month.label,
    value: records
      .filter((record) => record.status === 'overdue' && record.dueDate.startsWith(month.key))
      .reduce((sum, record) => sum + record.balance, 0),
  }))

  const last = months[months.length - 1]
  const previous = months[months.length - 2]
  const change = previous.collected === 0
    ? null
    : Math.round(((last.collected - previous.collected) / previous.collected) * 100)
  return (
    <div>
      <PageHeader
        title="Fee insights"
        description={`${school?.name ?? 'School'} · Based on recorded fees and payments`}
      />
      <ResourceGate
        state={state}
        empty={{ icon: Wallet, title: 'No fee data yet', description: 'Insights will appear after fees and payments are recorded.' }}
        deniedHint="Fee insights are available to school finance administrators."
      >
        {() => (
          <>
            <AdminSectionInsights
              metrics={[
                { label: 'Expected', value: formatMoney(totals.expected, currency) },
                {
                  label: 'Collected',
                  value: formatMoney(totals.collected, currency),
                  change: change === null ? undefined : {
                    value: `${Math.abs(change)}% vs previous month`,
                    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
                    positive: change >= 0,
                  },
                },
                { label: 'Outstanding', value: formatMoney(totals.outstanding, currency) },
                {
                  label: 'Collection rate',
                  value: totals.expected ? `${Math.round((totals.collected / totals.expected) * 100)}%` : '—',
                  progress: totals.expected ? (totals.collected / totals.expected) * 100 : 0,
                },
                { label: 'Overdue balance', value: formatMoney(totals.overdue, currency), detail: `${totals.overdueCount} overdue records` },
              ]}
              charts={[
                {
                  kind: 'line',
                  title: 'Monthly collection · expected vs paid',
                  categories: months.map((month) => month.label),
                  series: [
                    { label: 'Expected', values: months.map((month) => month.expected), tone: 'brand' },
                    { label: 'Collected', values: months.map((month) => month.collected), tone: 'positive' },
                  ],
                  formatValue: (value) => formatMoney(value, currency),
                },
                {
                  kind: 'donut',
                  title: 'Paid vs outstanding',
                  segments: [
                    { label: 'Collected', value: totals.collected, tone: 'positive' },
                    { label: 'Outstanding', value: totals.outstanding, tone: 'warning' },
                  ],
                  formatValue: (value) => formatMoney(value, currency),
                },
              ]}
              insight="Expected totals use fee due dates; collections use recorded payment dates."
            />
          </>
        )}
      </ResourceGate>
    </div>
  )
}
