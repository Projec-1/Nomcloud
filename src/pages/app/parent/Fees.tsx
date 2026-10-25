import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarBlank,
  CaretDown,
  ChartLineUp,
  CheckCircle,
  Clock,
  CreditCard,
  DownloadSimple,
  MagnifyingGlass,
  Printer,
  Wallet,
} from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { useSelectedChild } from '@/hooks/useSelectedChild'
import { useChildrenFees } from '@/hooks/useFinance'
import PageHeader from '@/components/ui/PageHeader'
import ChildSwitcher from '@/components/dashboard/ChildSwitcher'
import ResourceGate from '@/components/ui/ResourceGate'
import Badge from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Loader'
import { paymentMethodLabel, type FeePaymentView, type FeeRecordView, type FeeStatus } from '@/services/financeService'
import { formatDate, formatMoney } from '@/utils/format'
import { DEFAULT_TIME_ZONE, todayInTimeZone } from '@/utils/schoolCalendar'
import { schoolLogoUrl } from '@/services/storageService'
import PaymentJourney from '@/components/finance/PaymentJourney'
import { loadFeeDemoReceipts, loadPendingFeeDemoTransactions, type PendingFeeDemoTransaction } from '@/services/feePaymentDemoService'
import PaymentReceiptDocument, { type PaymentReceiptDetails } from '@/components/finance/PaymentReceiptDocument'
import { downloadPaymentReceiptPdf } from '@/utils/paymentReceiptPdf'
import { printPaymentReceipt } from '@/utils/printPaymentReceipt'

type ChartRange = '7d' | '30d' | '6m' | 'year'
type FeeFilter = 'all' | 'paid' | 'partial' | 'pending' | 'unpaid' | 'overdue'

const statusTone: Record<FeeStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'neutral',
  overdue: 'danger',
}

const ranges: ChartRange[] = ['7d', '30d', '6m', 'year']

function FeesLoadingSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-ink/[0.07] bg-white p-4 dark:border-white/10 dark:bg-[#202328]">
            <Skeleton className="mb-3 h-3 w-20" />
            <Skeleton className="h-6 w-28 max-w-full" />
            <Skeleton className="mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 rounded-2xl border border-ink/[0.07] bg-white p-4 dark:border-white/10 dark:bg-[#202328]">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-36 max-w-full" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
            <div className="hidden w-24 sm:block"><Skeleton className="h-4 w-full" /></div>
            <div className="w-20"><Skeleton className="h-8 w-full" /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function paymentStatusKey(fee: FeeRecordView, today: string) {
  if (fee.status === 'unpaid') return fee.dueDate > today ? 'parent.fees.status.pending' : 'parent.fees.status.unpaid'
  return `parent.fees.status.${fee.status}`
}

function getActivityBuckets(payments: Pick<FeePaymentView, 'amount' | 'paidOn'>[], range: ChartRange) {
  const now = new Date()
  const monthly = range === '6m' || range === 'year'
  const count = range === '7d' ? 7 : range === '30d' ? 30 : range === '6m' ? 6 : now.getMonth() + 1
  const start = new Date(now)
  if (range === 'year') {
    start.setMonth(0, 1)
  } else if (monthly) {
    start.setDate(1)
    start.setMonth(start.getMonth() - count + 1)
  } else {
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - count + 1)
  }

  const buckets = Array.from({ length: count }, (_, index) => {
    const date = new Date(start)
    if (monthly) date.setMonth(date.getMonth() + index)
    else date.setDate(date.getDate() + index)
    const key = monthly
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { key, date, amount: 0 }
  })
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))

  for (const payment of payments) {
    const date = new Date(payment.paidOn)
    if (Number.isNaN(date.getTime()) || date < start || date > now) continue
    const key = monthly
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const bucket = bucketByKey.get(key)
    if (bucket) bucket.amount += payment.amount
  }
  return buckets
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`
    const previous = points[index - 1]
    const midpoint = (previous.x + point.x) / 2
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`
  }, '')
}

function FeeActivityChart({
  payments,
  range,
  currency,
  t,
}: {
  payments: Pick<FeePaymentView, 'amount' | 'paidOn'>[]
  range: ChartRange
  currency: string
  t: (key: string) => string
}) {
  const buckets = getActivityBuckets(payments, range)
  const max = Math.max(1, ...buckets.map((bucket) => bucket.amount))
  const points = buckets.map((bucket, index) => ({
    ...bucket,
    x: buckets.length === 1 ? 320 : 24 + (index / (buckets.length - 1)) * 592,
    y: 176 - (bucket.amount / max) * 146,
  }))
  const line = smoothPath(points.map(({ x, y }) => ({ x, y })))
  const area = points.length ? `${line} L ${points[points.length - 1].x} 190 L ${points[0].x} 190 Z` : ''
  const labelOptions: Intl.DateTimeFormatOptions = range === 'year' || range === '6m'
    ? { month: 'short' }
    : { month: 'short', day: 'numeric' }
  const hasPayments = buckets.some((bucket) => bucket.amount > 0)

  return (
    <div>
      <div className="relative h-56 w-full">
        {!hasPayments ? (
          <div className="flex h-full items-center justify-center text-sm text-graphite">{t('parent.fees.chart.noActivity')}</div>
        ) : (
          <svg
            className="h-full w-full overflow-visible"
            viewBox="0 0 640 200"
            preserveAspectRatio="none"
            role="group"
            aria-label={t('parent.fees.chart.activity')}
          >
            <defs>
              <linearGradient id="fee-activity-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#FF5A1F" stopOpacity=".2" />
                <stop offset="100%" stopColor="#FF5A1F" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[34, 82, 130, 178].map((y) => <line key={y} x1="24" x2="616" y1={y} y2={y} stroke="currentColor" className="text-ink/5 dark:text-white/10" strokeDasharray="3 5" />)}
            <path d={area} fill="url(#fee-activity-fill)" />
            <path d={line} fill="none" stroke="#FF5A1F" strokeWidth="3" strokeLinecap="round" />
            {points.map((point) => (
              <circle
                key={point.key}
                cx={point.x}
                cy={point.y}
                r="5"
                fill="#fff"
                stroke="#FF5A1F"
                strokeWidth="2.5"
                tabIndex={0}
                role="img"
                aria-label={`${new Intl.DateTimeFormat(undefined, labelOptions).format(point.date)} · ${formatMoney(point.amount, currency, true)}`}
                className="cursor-help outline-none focus-visible:stroke-ink"
              >
                <title>{`${new Intl.DateTimeFormat(undefined, labelOptions).format(point.date)} · ${formatMoney(point.amount, currency, true)}`}</title>
              </circle>
            ))}
          </svg>
        )}
      </div>
      <div className="mt-2 flex justify-between px-1 text-[11px] text-graphite">
        <span>{new Intl.DateTimeFormat(undefined, labelOptions).format(buckets[0].date)}</span>
        {buckets.length > 7 && <span>{new Intl.DateTimeFormat(undefined, labelOptions).format(buckets[Math.floor((buckets.length - 1) / 2)].date)}</span>}
        <span>{new Intl.DateTimeFormat(undefined, labelOptions).format(buckets[buckets.length - 1].date)}</span>
      </div>
    </div>
  )
}

function Metric({
  title,
  value,
  icon: Icon,
  color,
  caption,
}: {
  title: string
  value: string
  icon: typeof Wallet
  color: string
  caption?: string
}) {
  return (
    <div className="rounded-2xl border border-ink/[0.07] bg-white p-3.5 dark:border-white/10 dark:bg-[#202328] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-graphite sm:text-sm">{title}</p>
          <p className="mt-2 break-words text-lg font-semibold tracking-tight text-ink tabular-nums dark:text-white sm:text-xl">{value}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9" style={{ backgroundColor: `${color}14`, color }}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" weight="duotone" />
        </span>
      </div>
      {caption && <p className="mt-2 text-[11px] text-graphite">{caption}</p>}
    </div>
  )
}

export default function ParentFees() {
  const { profile, school } = useAuth()
  const { t } = useLanguage()
  const { children, selectedChild, selectChild, state: childrenState } = useSelectedChild()
  const { state: feesState } = useChildrenFees(children.map((child) => child.id))
  const feesDisplayState = feesState.status === 'empty'
    ? { status: 'ready' as const, data: [] as FeeRecordView[] }
    : feesState
  const today = todayInTimeZone(school?.timezone ?? DEFAULT_TIME_ZONE)
  const [search, setSearch] = useState('')
  const [studentFilter, setStudentFilter] = useState('all')
  const [termFilter, setTermFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<FeeFilter>('all')
  const [expandedFeeId, setExpandedFeeId] = useState<string | null>(null)
  const [chartRange, setChartRange] = useState<ChartRange>('30d')
  const [demoRefresh, setDemoRefresh] = useState(0)
  const [demoReceiptsByFee, setDemoReceiptsByFee] = useState<Record<string, PaymentReceiptDetails[]>>({})
  const [pendingDemoByFee, setPendingDemoByFee] = useState<Record<string, PendingFeeDemoTransaction[]>>({})
  const [demoReceiptsError, setDemoReceiptsError] = useState('')
  const [receiptForPrint, setReceiptForPrint] = useState<PaymentReceiptDetails | null>(null)

  const studentsById = useMemo(() => new Map(children.map((child) => [child.id, child])), [children])
  const selectedChildId = selectedChild?.id
  const feeRecords = feesState.status === 'ready' ? feesState.data : []
  useEffect(() => {
    const refresh = () => setDemoRefresh((revision) => revision + 1)
    window.addEventListener('nomcloud:fee-demo-payment', refresh)
    return () => window.removeEventListener('nomcloud:fee-demo-payment', refresh)
  }, [])
  useEffect(() => {
    if (!school?.id || feesState.status !== 'ready') return
    try {
      const next = Object.fromEntries(feeRecords.map((fee) => [
        fee.id,
        loadFeeDemoReceipts(school.id, fee.id),
      ]))
      const pending = Object.fromEntries(feeRecords.map((fee) => [
        fee.id,
        loadPendingFeeDemoTransactions(school.id, fee.id),
      ]))
      setDemoReceiptsByFee(next)
      setPendingDemoByFee(pending)
      setDemoReceiptsError('')
    } catch (error) {
      setDemoReceiptsError(error instanceof Error ? error.message : t('fees.checkout.demoStorageError'))
    }
  }, [school?.id, feesState.status, feeRecords, demoRefresh, t])
  useEffect(() => {
    if (selectedChildId) setStudentFilter(selectedChildId)
  }, [selectedChildId])
  useEffect(() => {
    if (!receiptForPrint) return
    const clear = () => setReceiptForPrint(null)
    window.addEventListener('afterprint', clear, { once: true })
    const timer = window.setTimeout(() => {
      try {
        printPaymentReceipt(receiptForPrint.reference)
      } finally {
        if (!window.matchMedia('print').matches) clear()
      }
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', clear)
    }
  }, [receiptForPrint])

  const filterRecords = <T extends FeeRecordView>(records: T[]): T[] => records.filter((fee) => {
    const matchesStudent = studentFilter === 'all' || fee.studentId === studentFilter
    const matchesTerm = termFilter === 'all' || fee.termName === termFilter
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'pending' && fee.status === 'unpaid' && fee.dueDate > today)
      || (statusFilter === 'unpaid' && fee.status === 'unpaid' && fee.dueDate <= today)
      || fee.status === statusFilter
    const student = studentsById.get(fee.studentId)
    const query = search.trim().toLocaleLowerCase()
    const matchesSearch = !query || [fee.studentName, student?.className ?? '', fee.category, fee.termName]
      .some((value) => value.toLocaleLowerCase().includes(query))
    return matchesStudent && matchesTerm && matchesStatus && matchesSearch
  })

  if (!selectedChild) {
    return (
      <div>
        <PageHeader title={t('parent.fees.title')} description={t('parent.fees.description')} />
        <ResourceGate
          state={childrenState}
          empty={{ icon: Wallet, title: t('parent.fees.noChildren'), description: t('parent.fees.contactSchool') }}
          deniedHint={t('parent.fees.access')}
        >
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  const feeReceiptDetails = (
    payment: FeePaymentView,
    category: string,
    studentName: string,
    originalAmount: number,
    registrationNumber?: string,
    totalPaid?: number,
    remainingBalance?: number,
  ): PaymentReceiptDetails => ({
    schoolName: school?.name ?? 'Nom Cloud School',
    schoolLogoUrl: schoolLogoUrl(school?.logo_path ?? null),
    schoolAddress: school?.address,
    schoolPhone: school?.phone,
    schoolEmail: school?.email,
    reference: payment.reference,
    studentName,
    registrationNumber,
    payerName: profile?.full_name ?? t('common.parentGuardian'),
    category,
    originalAmount,
    amountPaid: payment.amount,
    totalPaid,
    remainingBalance,
    currency: payment.currency,
    method: paymentMethodLabel(payment.method),
    paidOn: payment.paidOn,
    providerReference: payment.reference,
    status: 'recorded',
  })

  const paymentSummaryAtTime = (fee: FeeRecordView, payment: FeePaymentView) => {
    if (fee.payments.filter((entry) => entry.paidOn === payment.paidOn).length !== 1) return {}
    const previouslyPaid = fee.payments
      .filter((entry) => entry.paidOn < payment.paidOn)
      .reduce((sum, entry) => sum + entry.amount, 0)
    const totalPaid = previouslyPaid + payment.amount
    return {
      totalPaid,
      remainingBalance: Math.max(0, fee.amount - totalPaid),
    }
  }

  const handleDownloadReceipt = (
    payment: FeePaymentView,
    category: string,
    studentName: string,
    originalAmount: number,
    registrationNumber?: string,
    totalPaid?: number,
    remainingBalance?: number,
  ) => {
    downloadPaymentReceiptPdf(feeReceiptDetails(payment, category, studentName, originalAmount, registrationNumber, totalPaid, remainingBalance), t)
  }

  const handleDownloadDemoReceipt = (receipt: PaymentReceiptDetails) => {
    downloadPaymentReceiptPdf({
      ...receipt,
      schoolLogoUrl: schoolLogoUrl(school?.logo_path ?? null),
      schoolAddress: school?.address,
      schoolPhone: school?.phone,
      schoolEmail: school?.email,
    }, t)
  }

  return (
    <div>
      <PageHeader
        title={t('parent.fees.title')}
        description={t('parent.fees.description')}
        actions={
          <ChildSwitcher
            children={children}
            selectedId={selectedChild.id}
            onSelect={(id) => {
              selectChild(id)
              setStudentFilter(id)
            }}
            classLabel={(child) => child.className ?? ''}
          />
        }
      />

      <ResourceGate
        state={feesDisplayState}
        empty={{ icon: Wallet, title: t('parent.fees.noRecords'), description: t('parent.fees.noRecordsDescription') }}
        deniedHint={t('parent.fees.access')}
        loading={<FeesLoadingSkeleton />}
      >
        {(allRecords) => {
          const recordsWithDemo = allRecords.map((fee) => {
            const demoReceipts = demoReceiptsByFee[fee.id] ?? []
            const pendingDemoTransactions = pendingDemoByFee[fee.id] ?? []
            return {
              ...fee,
              demoReceipts,
              pendingDemoTransactions,
            }
          })
          const records = filterRecords(recordsWithDemo)
          const currency = school?.currency ?? allRecords[0]?.currency ?? 'USD'
          const overviewRecords = recordsWithDemo.filter((fee) =>
            (studentFilter === 'all' || fee.studentId === studentFilter)
            && (termFilter === 'all' || fee.termName === termFilter),
          )
          const totalDue = overviewRecords.reduce((sum, fee) => sum + fee.amount, 0)
          const totalPaid = overviewRecords.reduce((sum, fee) => sum + fee.amountPaid, 0)
          const balance = overviewRecords.reduce((sum, fee) => sum + fee.balance, 0)
          const overdue = overviewRecords.filter((fee) => fee.status === 'overdue').reduce((sum, fee) => sum + fee.balance, 0)
          const firstOutstanding = overviewRecords.find((fee) => fee.balance > 0)
          const terms = Array.from(new Set(allRecords.map((fee) => fee.termName))).sort()
          const payments = overviewRecords.flatMap((fee) => [
            ...fee.payments,
          ])
          const grouped = Array.from(
            overviewRecords.reduce((groups, fee) => {
              const current = groups.get(fee.category) ?? { total: 0, paid: 0 }
              current.total += fee.amount
              current.paid += fee.amountPaid
              groups.set(fee.category, current)
              return groups
            }, new Map<string, { total: number; paid: number }>()),
          ).sort((a, b) => b[1].total - a[1].total).slice(0, 6)
          const paidPercent = totalDue > 0 ? Math.min(100, (totalPaid / totalDue) * 100) : 0

          return (
            <>
              {demoReceiptsError && (
                <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/[0.04] p-3 text-sm text-red-700 dark:text-red-300">
                  {demoReceiptsError}
                </p>
              )}
              <section aria-label={t('parent.fees.overview')} className="mb-8">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-white">{t('parent.fees.overview')}</h2>
                    <p className="mt-1 text-sm text-graphite">{t('parent.fees.overviewPeriod')}</p>
                  </div>
                  {firstOutstanding && (
                    <PaymentJourney
                      kind="fee"
                      schoolId={school?.id ?? 'school'}
                      schoolName={school?.name ?? 'Nom Cloud School'}
                      schoolLogoUrl={schoolLogoUrl(school?.logo_path ?? null)}
                      schoolAddress={school?.address}
                      schoolPhone={school?.phone}
                      schoolEmail={school?.email}
                      subjectName={firstOutstanding.studentName}
                      payerName={profile?.full_name ?? profile?.email ?? ''}
                      description={firstOutstanding.category}
                      amount={firstOutstanding.balance}
                      originalAmount={firstOutstanding.amount}
                      alreadyPaid={firstOutstanding.amountPaid}
                      currency={firstOutstanding.currency}
                      dueDate={firstOutstanding.dueDate}
                      registrationNumber={firstOutstanding.studentAdmissionNo}
                      storageId={firstOutstanding.id}
                      allowPartial
                      pendingDemo={pendingDemoByFee[firstOutstanding.id]?.[0]}
                    >
                      {(openCheckout, processing) => (
                        <button
                          type="button"
                          onClick={openCheckout}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                          <CreditCard className="h-4 w-4" /> {processing ? t('fees.checkout.processingDemo') : pendingDemoByFee[firstOutstanding.id]?.length ? t('fees.checkout.checkStatus') : t('fees.checkout.payNow')}
                        </button>
                      )}
                    </PaymentJourney>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                  <Metric title={t('parent.fees.total')} value={formatMoney(totalDue, currency)} icon={Wallet} color="#0071E3" caption={t('parent.fees.totalCaption')} />
                  <Metric title={t('parent.fees.paid')} value={formatMoney(totalPaid, currency)} icon={CheckCircle} color="#34A853" caption={t('parent.fees.confirmedCaption')} />
                  <Metric title={t('parent.fees.balance')} value={formatMoney(balance, currency)} icon={ArrowDownRight} color={balance > 0 ? '#FF5A1F' : '#34A853'} caption={t('parent.fees.outstandingCaption')} />
                  <Metric title={t('parent.fees.overdue')} value={formatMoney(overdue, currency)} icon={Clock} color="#D93025" caption={t('parent.fees.overdueCaption')} />
                </div>
              </section>

              <section className="mb-10" aria-label={t('parent.fees.listTitle')}>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-white">{t('parent.fees.listTitle')}</h2>
                    <p className="mt-1 text-sm text-graphite">{t('parent.fees.feeCount', { count: records.length })}</p>
                  </div>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-ink/[0.07] bg-white p-3 dark:border-white/10 dark:bg-[#202328] sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
                  <label className="relative col-span-2 block xl:col-span-1">
                    <span className="mb-1.5 block text-xs font-medium text-graphite">{t('parent.fees.search')}</span>
                    <MagnifyingGlass className="pointer-events-none absolute start-3 top-[2.35rem] h-4 w-4 text-graphite" />
                    <input className="input ps-9" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('parent.fees.searchPlaceholder')} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium text-graphite">{t('parent.fees.student')}</span>
                    <select className="input" value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}>
                      <option value="all">{t('parent.fees.allStudents')}</option>
                      {children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium text-graphite">{t('parent.fees.academicPeriod')}</span>
                    <select className="input" value={termFilter} onChange={(event) => setTermFilter(event.target.value)}>
                      <option value="all">{t('parent.fees.allPeriods')}</option>
                      {terms.map((term) => <option key={term} value={term}>{term}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium text-graphite">{t('parent.fees.paymentStatus')}</span>
                    <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FeeFilter)}>
                      <option value="all">{t('parent.fees.allStatuses')}</option>
                      <option value="paid">{t('parent.fees.status.paid')}</option>
                      <option value="partial">{t('parent.fees.status.partial')}</option>
                      <option value="pending">{t('parent.fees.status.pending')}</option>
                      <option value="unpaid">{t('parent.fees.status.unpaid')}</option>
                      <option value="overdue">{t('parent.fees.status.overdue')}</option>
                    </select>
                  </label>
                </div>

                {records.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ink/15 px-6 py-12 text-center dark:border-white/15">
                    <MagnifyingGlass className="mx-auto h-6 w-6 text-graphite" />
                    <p className="mt-3 font-medium text-ink dark:text-white">{allRecords.length === 0 ? t('parent.fees.noRecords') : t('parent.fees.noFilterResults')}</p>
                    {allRecords.length === 0
                      ? <p className="mt-1 text-sm text-graphite">{t('parent.fees.noRecordsDescription')}</p>
                      : <button type="button" className="mt-3 text-sm font-medium text-brand hover:underline" onClick={() => { setSearch(''); setStudentFilter('all'); setTermFilter('all'); setStatusFilter('all') }}>
                        {t('parent.fees.clearFilters')}
                      </button>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {records.map((fee) => {
                      const student = studentsById.get(fee.studentId)
                      const expanded = expandedFeeId === fee.id
                      return (
                        <article key={fee.id} className="overflow-hidden rounded-2xl border border-ink/[0.07] bg-white shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-[#202328]">
                          <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-3 text-start"
                              aria-expanded={expanded}
                              onClick={() => setExpandedFeeId(expanded ? null : fee.id)}
                            >
                              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fee.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600' : fee.status === 'overdue' ? 'bg-red-500/10 text-red-600' : 'bg-brand/10 text-brand'}`}>
                                {fee.status === 'paid' ? <CheckCircle className="h-5 w-5" /> : <CalendarBlank className="h-5 w-5" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-ink dark:text-white">{fee.category}</span>
                                  <Badge tone={statusTone[fee.status]}>{t(paymentStatusKey(fee, today))}</Badge>
                                </span>
                                <span className="mt-1 block truncate text-xs text-graphite">{fee.studentName} · {student?.className ?? t('common.class')} · {fee.termName}</span>
                              </span>
                              <CaretDown className={`h-4 w-4 shrink-0 text-graphite transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                            <div className="ms-auto flex items-center gap-4 sm:ms-0">
                              <div className="text-end">
                                <p className="font-semibold tabular-nums text-ink dark:text-white">{formatMoney(fee.balance, fee.currency, true)}</p>
                                <p className="mt-0.5 text-[11px] text-graphite">{t('parent.fees.remaining')}</p>
                              </div>
                              {fee.balance > 0 ? (
                                <PaymentJourney
                                  kind="fee"
                                  schoolId={school?.id ?? 'school'}
                                  schoolName={school?.name ?? 'Nom Cloud School'}
                                  schoolLogoUrl={schoolLogoUrl(school?.logo_path ?? null)}
                                  schoolAddress={school?.address}
                                  schoolPhone={school?.phone}
                                  schoolEmail={school?.email}
                                  subjectName={fee.studentName}
                                  payerName={profile?.full_name ?? profile?.email ?? ''}
                                  description={fee.category}
                                  amount={fee.balance}
                                  originalAmount={fee.amount}
                                  alreadyPaid={fee.amountPaid}
                                  currency={fee.currency}
                                  dueDate={fee.dueDate}
                                  registrationNumber={fee.studentAdmissionNo}
                                  storageId={fee.id}
                                  allowPartial
                                  pendingDemo={fee.pendingDemoTransactions[0]}
                                >
                                  {(openCheckout, processing) => (
                                    <button
                                      type="button"
                                      onClick={openCheckout}
                                      className="min-h-11 whitespace-nowrap rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                    >
                                      {processing ? t('fees.checkout.processingDemo') : fee.pendingDemoTransactions.length ? t('fees.checkout.resumeStatus') : t('fees.checkout.payNow')}
                                    </button>
                                  )}
                                </PaymentJourney>
                              ) : fee.balance <= 0 ? (
                                <Badge tone="success">{t('parent.fees.status.paid')}</Badge>
                              ) : null}
                            </div>
                          </div>
                          {expanded && (
                            <div className="border-t border-ink/[0.06] bg-ink/[0.015] p-4 dark:border-white/10 dark:bg-white/[0.025] sm:p-5">
                              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                                {[
                                  [t('parent.fees.student'), fee.studentName],
                                  [t('parent.fees.class'), student?.className ?? '—'],
                                  [t('parent.fees.academicPeriod'), fee.termName],
                                  [t('parent.fees.dueDate'), formatDate(fee.dueDate)],
                                  [t('parent.fees.originalAmount'), formatMoney(fee.amount, fee.currency, true)],
                                  [t('parent.fees.paid'), formatMoney(fee.amountPaid, fee.currency, true)],
                                  [t('parent.fees.remaining'), formatMoney(fee.balance, fee.currency, true)],
                                ].map(([label, value]) => (
                                  <div key={label}>
                                    <dt className="text-xs text-graphite">{label}</dt>
                                    <dd className="mt-1 text-sm font-medium text-ink dark:text-white">{value}</dd>
                                  </div>
                                ))}
                              </dl>
                              {(fee.payments.length > 0 || fee.demoReceipts.length > 0) && (
                                <div className="mt-5 border-t border-ink/[0.06] pt-4 dark:border-white/10">
                                  <h3 className="mb-2 text-xs font-semibold text-graphite">{t('parent.fees.paymentsReceived')}</h3>
                                  <div className="space-y-2">
                                    {fee.payments.map((payment) => {
                                      const summary = paymentSummaryAtTime(fee, payment)
                                      return (
                                      <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-white/5">
                                        <div>
                                          <p className="text-sm font-medium text-ink dark:text-white">{formatMoney(payment.amount, payment.currency, true)}</p>
                                          <p className="text-xs text-graphite">
                                            {['cash', 'mobile_money', 'evc_plus', 'edahab', 'bank_transfer', 'card'].includes(payment.method)
                                              ? t(`parent.fees.method.${payment.method}`)
                                              : paymentMethodLabel(payment.method)} · {payment.reference} · {formatDate(payment.paidOn)}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button type="button" onClick={() => handleDownloadReceipt(payment, fee.category, fee.studentName, fee.amount, student?.admissionNo, summary.totalPaid, summary.remainingBalance)} className="min-h-11 rounded-lg px-3 text-xs font-medium text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white">
                                            {t('parent.fees.receipt')}
                                          </button>
                                          <button type="button" onClick={() => setReceiptForPrint(feeReceiptDetails(payment, fee.category, fee.studentName, fee.amount, student?.admissionNo, summary.totalPaid, summary.remainingBalance))} className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white">
                                            <Printer className="h-3.5 w-3.5" /> {t('parent.fees.print')}
                                          </button>
                                        </div>
                                      </div>
                                      )
                                    })}
                                    {fee.demoReceipts.map((demoReceipt) => (
                                      <div key={demoReceipt.providerReference} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-50/70 px-3 py-2.5 dark:bg-amber-950/10">
                                        <div>
                                          <p className="text-sm font-medium text-ink dark:text-white">{formatMoney(demoReceipt.amountPaid, demoReceipt.currency, true)}</p>
                                          <p className="text-xs text-graphite">
                                            {demoReceipt.method} · {demoReceipt.reference} · {formatDate(demoReceipt.paidOn)} · {t('fees.checkout.simulatedPayment')}
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleDownloadDemoReceipt(demoReceipt)}
                                            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                                          >
                                            <DownloadSimple className="h-3.5 w-3.5" /> {t('fees.checkout.downloadPdf')}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setReceiptForPrint({
                                              ...demoReceipt,
                                              schoolLogoUrl: schoolLogoUrl(school?.logo_path ?? null),
                                              schoolAddress: school?.address,
                                              schoolPhone: school?.phone,
                                              schoolEmail: school?.email,
                                            })}
                                            className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                                          >
                                            <Printer className="h-3.5 w-3.5" /> {t('parent.fees.print')}
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
                {balance > 0 && <p className="mt-4 text-xs text-graphite">{school?.is_demo ? t('fees.checkout.testModeDescription') : t('parent.fees.paymentOffice')}</p>}
              </section>

              <section aria-label={t('parent.fees.analytics')} className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-white">{t('parent.fees.analytics')}</h2>
                    <p className="mt-1 text-sm text-graphite">{t('parent.fees.analyticsDescription')}</p>
                  </div>
                  <div className="flex flex-wrap rounded-xl border border-ink/[0.07] bg-white p-1 dark:border-white/10 dark:bg-[#202328]" role="group" aria-label={t('parent.fees.chart.timeRange')}>
                    {ranges.map((range) => (
                      <button
                        key={range}
                        type="button"
                        aria-pressed={chartRange === range}
                        onClick={() => setChartRange(range)}
                        className={`min-h-11 rounded-lg px-2.5 text-xs font-medium transition-colors sm:px-3 ${chartRange === range ? 'bg-brand text-white' : 'text-graphite hover:bg-ink/5 dark:hover:bg-white/10'}`}
                      >
                        {t(`parent.fees.chart.range.${range}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 xl:grid-cols-5">
                  <div className="rounded-2xl border border-ink/[0.07] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#202328] xl:col-span-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink dark:text-white">{t('parent.fees.chart.activity')}</h3>
                        <p className="mt-1 text-xs text-graphite">{t('parent.fees.chart.confirmedOnly')}</p>
                      </div>
                      <ChartLineUp className="h-5 w-5 text-brand" />
                    </div>
                    <FeeActivityChart payments={payments} range={chartRange} currency={currency} t={t} />
                  </div>
                  <div className="rounded-2xl border border-ink/[0.07] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#202328] xl:col-span-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink dark:text-white">{t('parent.fees.chart.paidVsOutstanding')}</h3>
                        <p className="mt-1 text-xs text-graphite">{t('parent.fees.chart.collectedShare', { percent: Math.round(paidPercent) })}</p>
                      </div>
                      <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="mt-7 h-3 overflow-hidden rounded-full bg-brand/10" role="img" aria-label={`${t('parent.fees.paid')}: ${formatMoney(totalPaid, currency, true)}; ${t('parent.fees.balance')}: ${formatMoney(balance, currency, true)}`}>
                      <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${paidPercent}%` }} />
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-4">
                      <div>
                        <span className="flex items-center gap-2 text-xs text-graphite"><span className="h-2 w-2 rounded-full bg-brand" />{t('parent.fees.paid')}</span>
                        <p className="mt-1 font-semibold tabular-nums text-ink dark:text-white">{formatMoney(totalPaid, currency, true)}</p>
                      </div>
                      <div>
                        <span className="flex items-center gap-2 text-xs text-graphite"><span className="h-2 w-2 rounded-full bg-brand/15" />{t('parent.fees.balance')}</span>
                        <p className="mt-1 font-semibold tabular-nums text-ink dark:text-white">{formatMoney(balance, currency, true)}</p>
                      </div>
                    </div>
                    <div className="mt-6 border-t border-ink/[0.06] pt-4 dark:border-white/10">
                      <div className="flex justify-between text-xs text-graphite"><span>{t('parent.fees.total')}</span><span className="font-medium tabular-nums">{formatMoney(totalDue, currency, true)}</span></div>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-ink/[0.07] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#202328]">
                  <div className="mb-5">
                    <h3 className="font-semibold text-ink dark:text-white">{t('parent.fees.chart.breakdown')}</h3>
                    <p className="mt-1 text-xs text-graphite">{t('parent.fees.chart.breakdownDescription')}</p>
                  </div>
                  {grouped.length === 0 ? (
                    <p className="py-6 text-center text-sm text-graphite">{t('parent.fees.chart.noBreakdown')}</p>
                  ) : (
                    <div className="space-y-4">
                      {grouped.map(([category, amounts]) => {
                        const share = totalDue > 0 ? Math.min(100, (amounts.total / Math.max(1, ...grouped.map(([, item]) => item.total))) * 100) : 0
                        const paidShare = amounts.total > 0 ? (amounts.paid / amounts.total) * 100 : 0
                        return (
                          <div key={category}>
                            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                              <span className="font-medium text-ink dark:text-white">{category}</span>
                              <span className="text-xs tabular-nums text-graphite">{formatMoney(amounts.paid, currency, true)} {t('parent.fees.chart.paidOf')} {formatMoney(amounts.total, currency, true)}</span>
                            </div>
                            <div className="h-2.5 max-w-full overflow-hidden rounded-full bg-ink/5 dark:bg-white/10" style={{ width: `${Math.max(share, 12)}%` }} title={`${t('parent.fees.chart.paid')}: ${formatMoney(amounts.paid, currency, true)} · ${t('parent.fees.balance')}: ${formatMoney(amounts.total - amounts.paid, currency, true)}`}>
                              <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${paidShare}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
            </>
          )
        }}
      </ResourceGate>

      {receiptForPrint && <PaymentReceiptDocument details={receiptForPrint} />}
    </div>
  )
}
