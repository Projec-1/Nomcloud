/**
 * Sample data for the Operator Center screens that have no backend yet.
 *
 * Every screen that reads from this file renders a visible "Prototype data"
 * notice, so an operator can never mistake these values for real records. The
 * shapes deliberately mirror the tables these sections will eventually read, so
 * connecting a section later means replacing the imports here with a service
 * call rather than rewriting the screen.
 *
 * Nothing in this file is written to Supabase. Where a real query already
 * exists (schools, audit logs, operator grants, contact messages) the screen
 * reads that instead and this file is not involved.
 */

export interface SampleSchool {
  id: string
  name: string
  region: string
  plan: string
}

export const sampleSchools: SampleSchool[] = [
  { id: 'SCH-1042', name: 'Riverside Academy', region: 'Nairobi', plan: 'Growth' },
  { id: 'SCH-1043', name: 'Al-Fajr Secondary School', region: 'Mombasa', plan: 'Enterprise' },
  { id: 'SCH-1044', name: 'Sunrise Primary School', region: 'Kisumu', plan: 'Starter' },
  { id: 'SCH-1045', name: 'Greenfield High School', region: 'Nakuru', plan: 'Growth' },
  { id: 'SCH-1046', name: 'Hillside Montessori', region: 'Nairobi', plan: 'Starter' },
  { id: 'SCH-1047', name: 'Lakeview Academy', region: 'Eldoret', plan: 'Growth' },
  { id: 'SCH-1048', name: 'Northgate Secondary School', region: 'Thika', plan: 'Enterprise' },
  { id: 'SCH-1049', name: 'Harmony International School', region: 'Nairobi', plan: 'Growth' },
]

export interface SampleOperator {
  name: string
  email: string
  team: string
  role: string
}

export const sampleOperators: SampleOperator[] = [
  { name: 'Leila Hassan', email: 'leila@nom.cloud', team: 'Platform operations', role: 'Founder / Super admin' },
  { name: 'Amina Yusuf', email: 'amina@nom.cloud', team: 'School success', role: 'Operations lead' },
  { name: 'Daniel Otieno', email: 'daniel@nom.cloud', team: 'Billing', role: 'Finance operator' },
  { name: 'Grace Wanjiru', email: 'grace@nom.cloud', team: 'Security', role: 'Security reviewer' },
  { name: 'Tom Bwire', email: 'tom@nom.cloud', team: 'Support', role: 'Support operator' },
]

/** Co-signers offered by the two-person rule dialog. */
export const approverNames = sampleOperators.map((operator) => operator.name)

export const DAY_MS = 86_400_000

export function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

export function daysAgo(days: number, hour = 9): string {
  const date = new Date(Date.now() - days * DAY_MS)
  date.setHours(hour, 12, 0, 0)
  return date.toISOString()
}

export function daysAhead(days: number, hour = 1): string {
  const date = new Date(Date.now() + days * DAY_MS)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

/**
 * A tiny deterministic generator. The sample series must look the same on every
 * render — a figure that changes when a filter is toggled reads as real data.
 */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state += 0x6d2b79f5
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const random = seeded(20261014)

function buildSeries(start: number, driftPerDay: number, noise: number, days: number): number[] {
  let current = start
  return Array.from({ length: days }, () => {
    current += driftPerDay + (random() - 0.5) * 2 * noise
    return Math.max(0, Math.round(current))
  })
}

export const TREND_DAYS = 90

export const trendLabels: string[] = Array.from({ length: TREND_DAYS }, (_, index) => {
  const date = new Date(Date.now() - (TREND_DAYS - 1 - index) * DAY_MS)
  return `${date.getDate()} ${date.toLocaleString('en', { month: 'short' })}`
})

export const analyticsSeries = {
  schools: buildSeries(78, 0.29, 1.1, TREND_DAYS),
  activeSchools: buildSeries(70, 0.3, 0.9, TREND_DAYS),
  students: buildSeries(34_800, 152, 260, TREND_DAYS),
  teachers: buildSeries(2_980, 10.8, 22, TREND_DAYS),
  mrr: buildSeries(31_400, 112, 240, TREND_DAYS),
}

export type TrendWindow = 'Last 7 days' | 'Last 30 days' | 'Last 90 days'

export const trendWindows: TrendWindow[] = ['Last 7 days', 'Last 30 days', 'Last 90 days']

export function windowSize(window: TrendWindow): number {
  if (window === 'Last 7 days') return 7
  if (window === 'Last 30 days') return 30
  return TREND_DAYS
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const analyticsSnapshot = {
  schools: { total: 104, active: 96, trialing: 6, suspended: 2, openedThisMonth: 9, closedThisMonth: 2 },
  people: { students: 48_126, teachers: 3_912, parents: 62_840, administrators: 214 },
  revenue: { mrr: 41_250, failedPayments: 14, overdueSubscriptions: 6, collectedThisMonth: 38_640, refunded: 420 },
  lifecycle: { activation: 0.78, retention90: 0.94, churn: 0.021, onboardingDays: 4.6 },
  planDistribution: [
    { plan: 'Starter', schools: 41, mrr: 8_180 },
    { plan: 'Growth', schools: 44, mrr: 17_600 },
    { plan: 'Enterprise', schools: 19, mrr: 15_470 },
  ],
  regions: [
    { region: 'Nairobi', schools: 41, students: 19_840, mrr: 16_820 },
    { region: 'Mombasa', schools: 18, students: 8_120, mrr: 7_140 },
    { region: 'Kisumu', schools: 12, students: 5_460, mrr: 4_080 },
    { region: 'Nakuru', schools: 11, students: 5_010, mrr: 4_360 },
    { region: 'Eldoret', schools: 9, students: 3_940, mrr: 3_510 },
    { region: 'Thika', schools: 8, students: 3_210, mrr: 3_180 },
    { region: 'Other', schools: 5, students: 2_546, mrr: 2_160 },
  ],
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export type ActivityKind = 'School' | 'User' | 'Billing' | 'Delivery' | 'Integration' | 'Security'

export interface ActivityEvent {
  id: string
  at: string
  kind: ActivityKind
  school: string
  actor: string
  title: string
  summary: string
  target: string
  outcome: 'Completed' | 'Failed' | 'Warning'
  details: Array<[string, string]>
}

export const activityEvents: ActivityEvent[] = [
  {
    id: 'EVT-98241', at: hoursAgo(0.4), kind: 'School', school: 'Harmony International School', actor: 'Leila Hassan',
    title: 'School application approved', summary: 'Registration information verified and the school account was created.',
    target: 'SCH-1049', outcome: 'Completed',
    details: [['Application', 'APP-2291'], ['Plan assigned', 'Growth'], ['Onboarding email', 'Queued']],
  },
  {
    id: 'EVT-98240', at: hoursAgo(1.1), kind: 'Delivery', school: 'Riverside Academy', actor: 'System',
    title: 'Invitation email bounced', summary: 'Mailbox does not exist. The invitation stays pending until the address is corrected.',
    target: 'teacher.a@riverside.example', outcome: 'Failed',
    details: [['Template', 'Teacher invitation'], ['Provider', 'Email provider'], ['Provider code', '550 5.1.1']],
  },
  {
    id: 'EVT-98239', at: hoursAgo(2.3), kind: 'Billing', school: 'Lakeview Academy', actor: 'System',
    title: 'Subscription payment failed', summary: 'Card declined. A retry is scheduled and the school has been notified.',
    target: 'INV-2214', outcome: 'Failed',
    details: [['Amount', '$480.00'], ['Attempt', '2 of 4'], ['Next retry', 'In 18 hours']],
  },
  {
    id: 'EVT-98238', at: hoursAgo(3.6), kind: 'User', school: 'Sunrise Primary School', actor: 'Amina Yusuf',
    title: 'Administrator invited', summary: 'A second administrator invitation was sent to the school owner.',
    target: 'admin@sunrise.example', outcome: 'Completed',
    details: [['Role', 'Administrator'], ['Expires', 'In 6 days']],
  },
  {
    id: 'EVT-98237', at: hoursAgo(5.2), kind: 'Integration', school: 'Al-Fajr Secondary School', actor: 'System',
    title: 'Payment provider webhook failed', summary: 'The provider returned a 500. The event is queued for retry.',
    target: 'webhook/payments', outcome: 'Failed',
    details: [['Event', 'payment.completed'], ['Attempt', '1 of 5'], ['Response', '500 Internal Server Error']],
  },
  {
    id: 'EVT-98236', at: hoursAgo(6.8), kind: 'School', school: 'Greenfield High School', actor: 'Daniel Otieno',
    title: 'School subscription upgraded', summary: 'Moved from Starter to Growth. Proration applied to the next invoice.',
    target: 'SCH-1045', outcome: 'Completed',
    details: [['From', 'Starter'], ['To', 'Growth'], ['Effective', 'Start of next cycle']],
  },
  {
    id: 'EVT-98235', at: hoursAgo(9.1), kind: 'Security', school: 'Northgate Secondary School', actor: 'Grace Wanjiru',
    title: 'Operator session revoked', summary: 'Session ended after a suspicious sign-in attempt on the same account.',
    target: 'OP-3391', outcome: 'Completed',
    details: [['Sessions revoked', '2'], ['Reason', 'Unrecognised device'], ['Re-authentication', 'Required']],
  },
  {
    id: 'EVT-98234', at: hoursAgo(11.5), kind: 'User', school: 'Hillside Montessori', actor: 'System',
    title: 'Teacher account deactivated', summary: 'The school ended this teacher\'s employment and removed access.',
    target: 'teacher.k@hillside.example', outcome: 'Completed',
    details: [['Changed by', 'School administrator'], ['Records', 'Teaching history retained']],
  },
  {
    id: 'EVT-98233', at: hoursAgo(14.2), kind: 'Delivery', school: 'Riverside Academy', actor: 'System',
    title: 'SMS batch delivered', summary: 'Fee reminders reached 412 guardians. 6 numbers were unreachable.',
    target: 'campaign/fees-oct', outcome: 'Warning',
    details: [['Sent', '418'], ['Delivered', '412'], ['Unreachable', '6']],
  },
  {
    id: 'EVT-98232', at: hoursAgo(19.4), kind: 'Billing', school: 'Sunrise Primary School', actor: 'Daniel Otieno',
    title: 'Credit applied to account', summary: 'A service credit was applied after the September delivery delay.',
    target: 'SCH-1044', outcome: 'Completed',
    details: [['Amount', '$120.00'], ['Authorised by', 'Daniel Otieno'], ['Applies to', 'Next invoice']],
  },
  {
    id: 'EVT-98231', at: hoursAgo(22.9), kind: 'Integration', school: 'Lakeview Academy', actor: 'System',
    title: 'Credential check succeeded', summary: 'The messaging provider accepted the rotated credential.',
    target: 'integration/messaging', outcome: 'Completed',
    details: [['Rotated', '3 days ago'], ['Next check', 'In 21 hours']],
  },
  {
    id: 'EVT-98230', at: hoursAgo(27.3), kind: 'School', school: 'Al-Fajr Secondary School', actor: 'Amina Yusuf',
    title: 'School suspended', summary: 'Account suspended pending verification of ownership documents.',
    target: 'SCH-1043', outcome: 'Warning',
    details: [['Reason', 'Ownership documents pending'], ['Operators notified', '3']],
  },
  {
    id: 'EVT-98229', at: hoursAgo(31.7), kind: 'Security', school: 'Nom Cloud', actor: 'System',
    title: 'Repeated failed sign-ins', summary: 'Eight failed attempts on one operator account from a single address.',
    target: 'OP-3391', outcome: 'Warning',
    details: [['Attempts', '8'], ['Window', '9 minutes'], ['Action', 'Flagged for review']],
  },
  {
    id: 'EVT-98228', at: hoursAgo(36.2), kind: 'Delivery', school: 'Greenfield High School', actor: 'System',
    title: 'Statement email opened', summary: 'The administrator opened the October statement email.',
    target: 'statement/2026-10', outcome: 'Completed',
    details: [['Recipient', 'Administrator'], ['Sent', '2 days ago']],
  },
  {
    id: 'EVT-98227', at: hoursAgo(41.8), kind: 'User', school: 'Northgate Secondary School', actor: 'System',
    title: 'Bulk teacher import completed', summary: 'A 74-row spreadsheet was imported with no rejected rows.',
    target: 'import/teachers', outcome: 'Completed',
    details: [['Rows', '74'], ['Rejected', '0'], ['Imported by', 'Administrator']],
  },
  {
    id: 'EVT-98226', at: hoursAgo(49.5), kind: 'Integration', school: 'Nom Cloud', actor: 'Leila Hassan',
    title: 'Webhook endpoint added', summary: 'A delivery endpoint was configured for billing events.',
    target: 'webhook/billing', outcome: 'Completed',
    details: [['Events', 'invoice.paid, invoice.failed'], ['Verification', 'Signed payloads']],
  },
  {
    id: 'EVT-98225', at: hoursAgo(56.1), kind: 'Billing', school: 'Hillside Montessori', actor: 'System',
    title: 'Overdue subscription flagged', summary: 'Payment is 12 days past due. Access remains open during the grace period.',
    target: 'SCH-1046', outcome: 'Warning',
    details: [['Amount', '$210.00'], ['Days overdue', '12'], ['Grace ends', 'In 2 days']],
  },
  {
    id: 'EVT-98224', at: hoursAgo(63.4), kind: 'School', school: 'Riverside Academy', actor: 'Amina Yusuf',
    title: 'Onboarding checklist completed', summary: 'All six onboarding steps are complete for this school.',
    target: 'SCH-1042', outcome: 'Completed',
    details: [['Steps', '6 of 6'], ['Completed in', '3 days']],
  },
]

// ---------------------------------------------------------------------------
// Audit investigation queue (the audit table itself reads real audit_logs)
// ---------------------------------------------------------------------------

export interface AuditFlag {
  id: string
  at: string
  severity: 'High' | 'Medium' | 'Low'
  rule: string
  actor: string
  target: string
  status: 'New' | 'Investigating' | 'Closed'
  before: string
  after: string
  evidence: Array<[string, string]>
}

export const auditFlags: AuditFlag[] = [
  {
    id: 'FLG-4410', at: hoursAgo(3.1), severity: 'High', rule: 'Operator changed billing settings outside their team',
    actor: 'tom@nom.cloud', target: 'SCH-1045 · subscription', status: 'New',
    before: 'Plan: Starter', after: 'Plan: Growth',
    evidence: [['Team', 'Support'], ['Approval record', 'None'], ['Session', 'OP-3402'], ['IP address', 'unspecified']],
  },
  {
    id: 'FLG-4409', at: hoursAgo(9.4), severity: 'High', rule: 'Mass export of student records',
    actor: 'daniel@nom.cloud', target: 'SCH-1042 · students', status: 'New',
    before: 'Exports this month: 2', after: 'Exports this month: 9',
    evidence: [['Records exported', '18,420'], ['Time window', '4 minutes'], ['Destination', 'CSV download']],
  },
  {
    id: 'FLG-4408', at: hoursAgo(21.7), severity: 'Medium', rule: 'Privileged access used after expiry was requested',
    actor: 'grace@nom.cloud', target: 'Billing · refunds', status: 'Investigating',
    before: 'Access expires in 2 days', after: 'Refund issued', evidence: [['Refund', '$120.00'], ['Approved by', 'Self']],
  },
  {
    id: 'FLG-4407', at: hoursAgo(38.2), severity: 'Medium', rule: 'Suspension without a recorded reason',
    actor: 'amina@nom.cloud', target: 'SCH-1043', status: 'Investigating',
    before: 'Status: Active', after: 'Status: Suspended',
    evidence: [['Reason field', 'Empty'], ['Schools affected', '1'], ['Notice sent', 'Yes']],
  },
  {
    id: 'FLG-4406', at: hoursAgo(52.9), severity: 'Low', rule: 'Sign-in from a new country',
    actor: 'tom@nom.cloud', target: 'Operator session', status: 'Closed',
    before: 'Known locations: 1', after: 'Known locations: 2',
    evidence: [['Location', 'New region'], ['Resolution', 'Confirmed travel'], ['Closed by', 'Grace Wanjiru']],
  },
  {
    id: 'FLG-4405', at: hoursAgo(74.4), severity: 'Low', rule: 'Failed sign-ins above threshold',
    actor: 'unknown', target: 'OP-3391', status: 'Closed',
    before: 'Failed attempts: 2', after: 'Failed attempts: 8',
    evidence: [['Window', '9 minutes'], ['Resolution', 'Session revoked'], ['Closed by', 'Grace Wanjiru']],
  },
]

export const auditPolicy = {
  retentionDays: 730,
  deletionPermission: 'Founder only, with a written reason and a second operator co-signature',
  writeMode: 'Append-only. Records are never updated or removed by an operator action.',
  coverage: [
    ['Recorded today', 'Login events and platform sign-outs'],
    ['Not yet recorded', 'Before/after values, permission changes, billing adjustments, school approvals'],
  ] as Array<[string, string]>,
}

// ---------------------------------------------------------------------------
// System health
// ---------------------------------------------------------------------------

export type ServiceStatus = 'Operational' | 'Degraded' | 'Outage'

export interface HealthService {
  id: string
  name: string
  category: string
  status: ServiceStatus
  availability: number
  p95Ms: number
  errorRate: number
  requestsPerMin: number
  lastCheckedAt: string
  monitored: boolean
}

export const healthServices: HealthService[] = [
  { id: 'svc-api', name: 'Platform API', category: 'Backend', status: 'Operational', availability: 99.97, p95Ms: 214, errorRate: 0.3, requestsPerMin: 1_840, lastCheckedAt: hoursAgo(0.02), monitored: false },
  { id: 'svc-db', name: 'Primary database', category: 'Data', status: 'Operational', availability: 99.99, p95Ms: 42, errorRate: 0.1, requestsPerMin: 6_210, lastCheckedAt: hoursAgo(0.02), monitored: false },
  { id: 'svc-auth', name: 'Authentication', category: 'Identity', status: 'Degraded', availability: 99.61, p95Ms: 918, errorRate: 2.4, requestsPerMin: 410, lastCheckedAt: hoursAgo(0.05), monitored: false },
  { id: 'svc-storage', name: 'File storage', category: 'Data', status: 'Operational', availability: 99.94, p95Ms: 186, errorRate: 0.2, requestsPerMin: 260, lastCheckedAt: hoursAgo(0.08), monitored: false },
  { id: 'svc-email', name: 'Email delivery', category: 'Messaging', status: 'Operational', availability: 99.82, p95Ms: 1_420, errorRate: 0.9, requestsPerMin: 94, lastCheckedAt: hoursAgo(0.12), monitored: false },
  { id: 'svc-sms', name: 'SMS delivery', category: 'Messaging', status: 'Degraded', availability: 98.4, p95Ms: 4_100, errorRate: 6.1, requestsPerMin: 38, lastCheckedAt: hoursAgo(0.12), monitored: false },
  { id: 'svc-jobs', name: 'Background jobs', category: 'Workers', status: 'Operational', availability: 99.9, p95Ms: 640, errorRate: 0.4, requestsPerMin: 12, lastCheckedAt: hoursAgo(0.2), monitored: false },
  { id: 'svc-payments', name: 'Payment provider link', category: 'Integrations', status: 'Outage', availability: 96.2, p95Ms: 6_800, errorRate: 18.6, requestsPerMin: 21, lastCheckedAt: hoursAgo(0.3), monitored: false },
]

export interface HealthIncident {
  id: string
  title: string
  severity: 'Critical' | 'Major' | 'Minor'
  status: 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved'
  services: string[]
  startedAt: string
  resolvedAt: string | null
  impact: string
  owner: string
  updates: Array<{ at: string; note: string; by: string }>
}

export const healthIncidents: HealthIncident[] = [
  {
    id: 'INC-2291', title: 'Payment provider link returning errors', severity: 'Critical', status: 'Identified',
    services: ['Payment provider link', 'Platform API'], startedAt: hoursAgo(3.4), resolvedAt: null,
    impact: 'Fee payments started by guardians fail before the provider is reached. 62 attempts affected.',
    owner: 'Leila Hassan',
    updates: [
      { at: hoursAgo(3.4), note: 'Error rate crossed the 10% threshold and paged the on-call operator.', by: 'Monitoring' },
      { at: hoursAgo(2.1), note: 'Failures confirmed to come from the provider, not from Nom Cloud.', by: 'Leila Hassan' },
      { at: hoursAgo(0.6), note: 'Provider acknowledged the incident. Retries are queued and will drain automatically.', by: 'Leila Hassan' },
    ],
  },
  {
    id: 'INC-2288', title: 'Slower authentication responses', severity: 'Minor', status: 'Monitoring',
    services: ['Authentication'], startedAt: hoursAgo(9.2), resolvedAt: null,
    impact: 'Sign-in takes about 2 seconds longer than usual. No sign-ins have failed.',
    owner: 'Amina Yusuf',
    updates: [
      { at: hoursAgo(9.2), note: 'p95 response time rose above 800ms.', by: 'Monitoring' },
      { at: hoursAgo(6.5), note: 'Cause traced to a slow identity query under load.', by: 'Amina Yusuf' },
      { at: hoursAgo(1.2), note: 'Query fixed. Watching for a full hour before resolving.', by: 'Amina Yusuf' },
    ],
  },
  {
    id: 'INC-2284', title: 'SMS delivery delays to one network', severity: 'Minor', status: 'Resolved',
    services: ['SMS delivery'], startedAt: daysAgo(2, 8), resolvedAt: daysAgo(1, 17),
    impact: 'Fee reminders to one mobile network were delayed by up to three hours.',
    owner: 'Tom Bwire',
    updates: [
      { at: daysAgo(2, 8), note: 'Delivery receipts stopped arriving for one network.', by: 'Monitoring' },
      { at: daysAgo(1, 17), note: 'Network restored its gateway. Queue drained and the incident was closed.', by: 'Tom Bwire' },
    ],
  },
]

export const healthHistory = {
  labels: Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.now() - (13 - index) * DAY_MS)
    return `${date.getDate()} ${date.toLocaleString('en', { month: 'short' })}`
  }),
  availability: [99.98, 99.99, 99.97, 99.95, 99.99, 99.99, 99.96, 99.9, 99.99, 99.98, 99.97, 99.94, 99.62, 98.81],
  errorRate: [0.12, 0.09, 0.14, 0.18, 0.1, 0.08, 0.16, 0.31, 0.11, 0.13, 0.15, 0.22, 0.94, 2.31],
}

export interface MonitoringSource {
  id: string
  name: string
  kind: string
  status: 'Connected' | 'Not connected'
  detail: string
}

export const monitoringSources: MonitoringSource[] = [
  { id: 'mon-supabase', name: 'Database and API health', kind: 'Supabase', status: 'Not connected', detail: 'Project health endpoint and database metrics' },
  { id: 'mon-hosting', name: 'Frontend delivery', kind: 'Hosting platform', status: 'Not connected', detail: 'Deployment status, build failures, edge response times' },
  { id: 'mon-uptime', name: 'Availability checks', kind: 'Uptime monitor', status: 'Not connected', detail: 'External checks against the platform endpoints' },
  { id: 'mon-errors', name: 'Application errors', kind: 'Error tracking', status: 'Not connected', detail: 'Grouped exceptions with release and school context' },
  { id: 'mon-delivery', name: 'Email and SMS delivery', kind: 'Provider webhooks', status: 'Not connected', detail: 'Bounces, failures and delivery receipts' },
]

export interface AlertThreshold {
  id: string
  metric: string
  comparison: 'above' | 'below'
  value: number
  unit: string
  channel: string
  enabled: boolean
}

export const alertThresholds: AlertThreshold[] = [
  { id: 'thr-1', metric: 'API error rate', comparison: 'above', value: 2, unit: '%', channel: 'Email + on-call', enabled: true },
  { id: 'thr-2', metric: 'API p95 response time', comparison: 'above', value: 800, unit: 'ms', channel: 'Email', enabled: true },
  { id: 'thr-3', metric: 'Service availability', comparison: 'below', value: 99.9, unit: '%', channel: 'Email + SMS', enabled: true },
  { id: 'thr-4', metric: 'Failed sign-ins', comparison: 'above', value: 20, unit: 'per hour', channel: 'Security queue', enabled: true },
  { id: 'thr-5', metric: 'Background job failures', comparison: 'above', value: 3, unit: 'per run', channel: 'Email', enabled: false },
]

// ---------------------------------------------------------------------------
// Maintenance and change control
// ---------------------------------------------------------------------------

export interface MaintenanceWindow {
  id: string
  title: string
  scope: string
  startsAt: string
  endsAt: string
  status: 'Scheduled' | 'In progress' | 'Completed' | 'Cancelled'
  notifySchools: boolean
  owner: string
  changes: string[]
}

export const maintenanceWindows: MaintenanceWindow[] = [
  {
    id: 'MW-118', title: 'Database index rebuild', scope: 'All schools', startsAt: daysAhead(3, 2), endsAt: daysAhead(3, 4),
    status: 'Scheduled', notifySchools: true, owner: 'Leila Hassan',
    changes: ['Rebuild attendance indexes', 'Queries stay online, no sign-out required'],
  },
  {
    id: 'MW-117', title: 'Payment provider credential rotation', scope: 'All schools', startsAt: daysAhead(9, 3), endsAt: daysAhead(9, 4),
    status: 'Scheduled', notifySchools: true, owner: 'Daniel Otieno',
    changes: ['Rotate provider credentials', 'Pause new payment attempts for 20 minutes'],
  },
  {
    id: 'MW-116', title: 'Reporting engine upgrade', scope: 'Selected schools (4)', startsAt: daysAgo(6, 2), endsAt: daysAgo(6, 5),
    status: 'Completed', notifySchools: true, owner: 'Amina Yusuf',
    changes: ['Upgrade report generation', 'No visible change expected'],
  },
  {
    id: 'MW-115', title: 'Scheduled maintenance cancelled', scope: 'All schools', startsAt: daysAgo(12, 1), endsAt: daysAgo(12, 3),
    status: 'Cancelled', notifySchools: false, owner: 'Leila Hassan',
    changes: ['Cancelled after the provider incident was resolved'],
  },
]

export interface Deployment {
  id: string
  version: string
  stage: 'Awaiting approval' | 'Staged' | 'Rolled out' | 'Rolled back'
  owner: string
  scheduledFor: string
  summary: string
  checks: Array<{ name: string; status: 'Passed' | 'Failed' | 'Pending' }>
  rollbackOf?: string
}

export const deployments: Deployment[] = [
  {
    id: 'DEP-774', version: '2026.10.14-1', stage: 'Awaiting approval', owner: 'Leila Hassan', scheduledFor: daysAhead(1, 1),
    summary: 'School application workflow: information-requested state and re-approval path.',
    checks: [
      { name: 'Type check', status: 'Passed' },
      { name: 'Database migration dry run', status: 'Passed' },
      { name: 'Reviewer sign-off', status: 'Pending' },
    ],
  },
  {
    id: 'DEP-773', version: '2026.10.11-2', stage: 'Staged', owner: 'Amina Yusuf', scheduledFor: daysAhead(2, 1),
    summary: 'Staged for internal schools only before a network-wide rollout.',
    checks: [
      { name: 'Type check', status: 'Passed' },
      { name: 'Rollout group', status: 'Passed' },
      { name: 'Rollback plan', status: 'Passed' },
    ],
  },
  {
    id: 'DEP-772', version: '2026.10.08-4', stage: 'Rolled out', owner: 'Leila Hassan', scheduledFor: daysAgo(6, 1),
    summary: 'Invitation role identity check.',
    checks: [
      { name: 'Type check', status: 'Passed' },
      { name: 'Post-rollout check', status: 'Passed' },
    ],
  },
  {
    id: 'DEP-771', version: '2026.10.06-1', stage: 'Rolled back', owner: 'Grace Wanjiru', scheduledFor: daysAgo(8, 1),
    summary: 'Rolled back after delivery failures appeared in two schools.',
    checks: [
      { name: 'Type check', status: 'Passed' },
      { name: 'Failure rate after rollout', status: 'Failed' },
    ],
    rollbackOf: '2026.10.05-3',
  },
]

export interface BackgroundJob {
  id: string
  name: string
  schedule: string
  lastRunAt: string
  status: 'Succeeded' | 'Failed' | 'Running'
  durationMs: number
  attempts: number
  lastError: string | null
}

export const backgroundJobs: BackgroundJob[] = [
  { id: 'JOB-31', name: 'Subscription renewal check', schedule: 'Daily at 01:00', lastRunAt: hoursAgo(9), status: 'Succeeded', durationMs: 12_400, attempts: 1, lastError: null },
  { id: 'JOB-32', name: 'Failed payment retry', schedule: 'Every 6 hours', lastRunAt: hoursAgo(2), status: 'Failed', durationMs: 8_900, attempts: 3, lastError: 'Payment provider link unavailable' },
  { id: 'JOB-33', name: 'Email outbox flush', schedule: 'Every 5 minutes', lastRunAt: hoursAgo(0.1), status: 'Succeeded', durationMs: 1_180, attempts: 1, lastError: null },
  { id: 'JOB-34', name: 'Overdue subscription sweep', schedule: 'Daily at 06:00', lastRunAt: hoursAgo(5), status: 'Succeeded', durationMs: 4_200, attempts: 1, lastError: null },
  { id: 'JOB-35', name: 'Audit retention prune', schedule: 'Weekly on Sunday', lastRunAt: daysAgo(3, 3), status: 'Failed', durationMs: 640, attempts: 2, lastError: 'Retention window not configured on this environment' },
  { id: 'JOB-36', name: 'Backup verification', schedule: 'Daily at 04:00', lastRunAt: hoursAgo(6), status: 'Succeeded', durationMs: 32_600, attempts: 1, lastError: null },
]

export const maintenanceMode = {
  enabled: false,
  message: 'Nom Cloud is under scheduled maintenance. Sign-in is available; some reports may be delayed.',
  changedAt: daysAgo(12, 3),
  changedBy: 'Leila Hassan',
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

export interface SecuritySignal {
  id: string
  at: string
  kind: 'Suspicious sign-in' | 'Failed sign-ins' | 'Data access' | 'Privacy incident' | 'Configuration'
  severity: 'High' | 'Medium' | 'Low'
  actor: string
  school: string
  source: string
  status: 'New' | 'Investigating' | 'Contained' | 'Closed'
  summary: string
  evidence: Array<[string, string]>
  sessionIds: string[]
}

export const securitySignals: SecuritySignal[] = [
  {
    id: 'SEC-3320', at: hoursAgo(1.4), kind: 'Suspicious sign-in', severity: 'High', actor: 'tom@nom.cloud',
    school: 'Nom Cloud', source: 'Identity provider', status: 'New',
    summary: 'Operator signed in from a country they have never used, on an unrecognised device.',
    evidence: [['Location', 'Unrecognised country'], ['Device', 'New browser'], ['MFA', 'Not challenged']],
    sessionIds: ['OP-3402'],
  },
  {
    id: 'SEC-3319', at: hoursAgo(4.8), kind: 'Failed sign-ins', severity: 'Medium', actor: 'unknown',
    school: 'Nom Cloud', source: 'Identity provider', status: 'Investigating',
    summary: 'Eight failed attempts against one operator account within nine minutes.',
    evidence: [['Attempts', '8'], ['Window', '9 minutes'], ['Accounts targeted', '1']],
    sessionIds: [],
  },
  {
    id: 'SEC-3318', at: hoursAgo(9.4), kind: 'Data access', severity: 'High', actor: 'daniel@nom.cloud',
    school: 'Riverside Academy', source: 'Application audit', status: 'New',
    summary: '18,420 student records exported in four minutes by an operator outside the school\'s team.',
    evidence: [['Records', '18,420'], ['Destination', 'CSV download'], ['Approval', 'None recorded']],
    sessionIds: ['OP-3391'],
  },
  {
    id: 'SEC-3317', at: hoursAgo(26.5), kind: 'Configuration', severity: 'Medium', actor: 'System',
    school: 'Nom Cloud', source: 'Configuration check', status: 'Investigating',
    summary: 'One operator account has no multi-factor authentication and can approve billing changes.',
    evidence: [['Accounts', '1'], ['Capability', 'Billing approvals'], ['Owner', 'Billing team']],
    sessionIds: [],
  },
  {
    id: 'SEC-3316', at: hoursAgo(38.2), kind: 'Privacy incident', severity: 'High', actor: 'amina@nom.cloud',
    school: 'Sunrise Primary School', source: 'Operator report', status: 'Contained',
    summary: 'A fee reminder was sent to a guardian whose contact details were out of date, exposing an amount to the wrong number.',
    evidence: [['Recipients affected', '1'], ['Data exposed', 'Balance and student name'], ['Notice', 'School informed']],
    sessionIds: [],
  },
  {
    id: 'SEC-3315', at: hoursAgo(52.9), kind: 'Suspicious sign-in', severity: 'Low', actor: 'tom@nom.cloud',
    school: 'Nom Cloud', source: 'Identity provider', status: 'Closed',
    summary: 'Sign-in from a new country, later confirmed as travel.',
    evidence: [['Confirmed by', 'Grace Wanjiru'], ['Action', 'None required']],
    sessionIds: ['OP-3388'],
  },
]

export interface OperatorSession {
  id: string
  operator: string
  device: string
  location: string
  startedAt: string
  lastSeenAt: string
  current: boolean
}

export const operatorSessions: OperatorSession[] = [
  { id: 'OP-3402', operator: 'tom@nom.cloud', device: 'Chrome · Windows', location: 'Unrecognised country', startedAt: hoursAgo(1.4), lastSeenAt: hoursAgo(0.1), current: true },
  { id: 'OP-3401', operator: 'leila@nom.cloud', device: 'Safari · macOS', location: 'Nairobi, KE', startedAt: hoursAgo(6.2), lastSeenAt: hoursAgo(0.05), current: true },
  { id: 'OP-3391', operator: 'daniel@nom.cloud', device: 'Chrome · Windows', location: 'Nairobi, KE', startedAt: hoursAgo(11.8), lastSeenAt: hoursAgo(0.6), current: true },
  { id: 'OP-3388', operator: 'tom@nom.cloud', device: 'Chrome · Android', location: 'Mombasa, KE', startedAt: hoursAgo(53), lastSeenAt: hoursAgo(20), current: false },
  { id: 'OP-3380', operator: 'amina@nom.cloud', device: 'Firefox · Windows', location: 'Kisumu, KE', startedAt: daysAgo(2, 7), lastSeenAt: daysAgo(2, 12), current: false },
]

export const accessReviews: Array<{ id: string; scope: string; owner: string; dueAt: string; status: string; findings: number }> = [
  { id: 'AR-88', scope: 'Elevated operator access', owner: 'Grace Wanjiru', dueAt: daysAhead(4, 9), status: 'In progress', findings: 2 },
  { id: 'AR-87', scope: 'Billing capabilities', owner: 'Daniel Otieno', dueAt: daysAhead(11, 9), status: 'Scheduled', findings: 0 },
  { id: 'AR-86', scope: 'Student data access', owner: 'Amina Yusuf', dueAt: daysAgo(5, 9), status: 'Overdue', findings: 3 },
  { id: 'AR-85', scope: 'Integration credentials', owner: 'Leila Hassan', dueAt: daysAgo(18, 9), status: 'Completed', findings: 1 },
]

export const securityChecks: Array<{ id: string; control: string; status: 'Passing' | 'Attention' | 'Failing'; detail: string }> = [
  { id: 'chk-1', control: 'Database access rules on student records', status: 'Passing', detail: 'Reads are scoped to the school and role' },
  { id: 'chk-2', control: 'Multi-factor authentication for operators', status: 'Attention', detail: '1 of 5 operator accounts has none' },
  { id: 'chk-3', control: 'Platform access grants reviewed', status: 'Attention', detail: 'Oldest review is 5 days overdue' },
  { id: 'chk-4', control: 'Integration secrets stored outside the app', status: 'Passing', detail: 'Credentials live in configuration, not in a table' },
  { id: 'chk-5', control: 'Audit writes for privileged actions', status: 'Attention', detail: 'Only sign-in events are recorded today' },
]

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export const permissionRoles: Array<{ id: string; name: string; description: string; members: number; level: 'Standard' | 'Elevated' | 'Restricted' }> = [
  { id: 'role-founder', name: 'Founder / Super admin', description: 'Every capability, including security and deletion', members: 1, level: 'Elevated' },
  { id: 'role-operations', name: 'Operations lead', description: 'Schools, people, applications and support', members: 2, level: 'Standard' },
  { id: 'role-finance', name: 'Finance operator', description: 'Plans, invoices, payments and adjustments', members: 1, level: 'Standard' },
  { id: 'role-security', name: 'Security reviewer', description: 'Investigations, sessions and access reviews', members: 1, level: 'Elevated' },
  { id: 'role-support', name: 'Support operator', description: 'Read-only school records and help requests', members: 1, level: 'Restricted' },
]

export const permissionCapabilities = [
  'View school records',
  'Edit school records',
  'Approve school applications',
  'Suspend or reactivate a school',
  'View student data',
  'Export student data',
  'View billing',
  'Change billing and issue credits',
  'View security signals',
  'Revoke sessions and contain incidents',
  'Manage operators and permissions',
  'Delete records',
] as const

export type PermissionLevel = 'Allow' | 'Approval required' | 'Deny'

export const permissionMatrix: Record<string, Record<string, PermissionLevel>> = {
  'role-founder': {
    'View school records': 'Allow', 'Edit school records': 'Allow', 'Approve school applications': 'Allow',
    'Suspend or reactivate a school': 'Allow', 'View student data': 'Allow', 'Export student data': 'Approval required',
    'View billing': 'Allow', 'Change billing and issue credits': 'Allow', 'View security signals': 'Allow',
    'Revoke sessions and contain incidents': 'Allow', 'Manage operators and permissions': 'Allow', 'Delete records': 'Approval required',
  },
  'role-operations': {
    'View school records': 'Allow', 'Edit school records': 'Allow', 'Approve school applications': 'Allow',
    'Suspend or reactivate a school': 'Approval required', 'View student data': 'Allow', 'Export student data': 'Approval required',
    'View billing': 'Allow', 'Change billing and issue credits': 'Deny', 'View security signals': 'Deny',
    'Revoke sessions and contain incidents': 'Deny', 'Manage operators and permissions': 'Deny', 'Delete records': 'Deny',
  },
  'role-finance': {
    'View school records': 'Allow', 'Edit school records': 'Deny', 'Approve school applications': 'Deny',
    'Suspend or reactivate a school': 'Deny', 'View student data': 'Deny', 'Export student data': 'Deny',
    'View billing': 'Allow', 'Change billing and issue credits': 'Approval required', 'View security signals': 'Deny',
    'Revoke sessions and contain incidents': 'Deny', 'Manage operators and permissions': 'Deny', 'Delete records': 'Deny',
  },
  'role-security': {
    'View school records': 'Allow', 'Edit school records': 'Deny', 'Approve school applications': 'Deny',
    'Suspend or reactivate a school': 'Approval required', 'View student data': 'Approval required', 'Export student data': 'Approval required',
    'View billing': 'Deny', 'Change billing and issue credits': 'Deny', 'View security signals': 'Allow',
    'Revoke sessions and contain incidents': 'Allow', 'Manage operators and permissions': 'Approval required', 'Delete records': 'Deny',
  },
  'role-support': {
    'View school records': 'Allow', 'Edit school records': 'Deny', 'Approve school applications': 'Deny',
    'Suspend or reactivate a school': 'Deny', 'View student data': 'Deny', 'Export student data': 'Deny',
    'View billing': 'Deny', 'Change billing and issue credits': 'Deny', 'View security signals': 'Deny',
    'Revoke sessions and contain incidents': 'Deny', 'Manage operators and permissions': 'Deny', 'Delete records': 'Deny',
  },
}

export interface PrivilegedGrant {
  id: string
  operator: string
  role: string
  scope: string
  grantedBy: string
  grantedAt: string
  expiresAt: string
  reason: string
  status: 'Active' | 'Expiring soon' | 'Expired' | 'Revoked'
}

export const privilegedGrants: PrivilegedGrant[] = [
  { id: 'GR-204', operator: 'grace@nom.cloud', role: 'Security reviewer', scope: 'Billing refunds', grantedBy: 'Leila Hassan', grantedAt: daysAgo(1, 10), expiresAt: daysAhead(2, 10), reason: 'Investigating a refund dispute', status: 'Active' },
  { id: 'GR-203', operator: 'daniel@nom.cloud', role: 'Finance operator', scope: 'School suspension', grantedBy: 'Leila Hassan', grantedAt: daysAgo(4, 9), expiresAt: daysAhead(1, 9), reason: 'Non-payment follow-up', status: 'Expiring soon' },
  { id: 'GR-202', operator: 'amina@nom.cloud', role: 'Operations lead', scope: 'Student data export', grantedBy: 'Leila Hassan', grantedAt: daysAgo(7, 9), expiresAt: daysAhead(0.5, 9), reason: 'Regional reporting request', status: 'Active' },
  { id: 'GR-198', operator: 'tom@nom.cloud', role: 'Support operator', scope: 'School record editing', grantedBy: 'Amina Yusuf', grantedAt: daysAgo(21, 9), expiresAt: daysAgo(14, 9), reason: 'Onboarding migration support', status: 'Expired' },
]

export const approvalPolicies: Array<{ id: string; action: string; rule: string; approvers: string; enabled: boolean }> = [
  { id: 'pol-1', action: 'Suspend a school', rule: 'Second operator approval', approvers: 'Founder + Operations lead', enabled: true },
  { id: 'pol-2', action: 'Export student data', rule: 'Second operator approval', approvers: 'Founder + Security reviewer', enabled: true },
  { id: 'pol-3', action: 'Issue a credit above $500', rule: 'Second operator approval', approvers: 'Founder + Finance operator', enabled: true },
  { id: 'pol-4', action: 'Rotate integration credentials', rule: 'Second operator approval', approvers: 'Founder + Operations lead', enabled: true },
  { id: 'pol-5', action: 'Delete records', rule: 'Founder only, with written reason', approvers: 'Founder', enabled: true },
  { id: 'pol-6', action: 'Enable maintenance mode', rule: 'Notify affected schools first', approvers: 'Any operator', enabled: false },
]

// ---------------------------------------------------------------------------
// Operators (workload and account security; access grants read real data)
// ---------------------------------------------------------------------------

export interface OperatorProfile {
  email: string
  name: string
  team: string
  role: string
  status: 'Active' | 'Deactivated'
  mfa: 'Enabled' | 'Not enabled'
  lastLoginAt: string
  assigned: number
  overdue: number
  closedThisWeek: number
  cases: string[]
}

export const operatorProfiles: OperatorProfile[] = [
  { email: 'leila@nom.cloud', name: 'Leila Hassan', team: 'Platform operations', role: 'Founder / Super admin', status: 'Active', mfa: 'Enabled', lastLoginAt: hoursAgo(0.2), assigned: 6, overdue: 0, closedThisWeek: 14, cases: ['INC-2291', 'FLG-4410', 'APP-2291'] },
  { email: 'amina@nom.cloud', name: 'Amina Yusuf', team: 'School success', role: 'Operations lead', status: 'Active', mfa: 'Enabled', lastLoginAt: hoursAgo(3.5), assigned: 11, overdue: 2, closedThisWeek: 26, cases: ['INC-2288', 'AR-86', 'FLG-4407'] },
  { email: 'daniel@nom.cloud', name: 'Daniel Otieno', team: 'Billing', role: 'Finance operator', status: 'Active', mfa: 'Enabled', lastLoginAt: hoursAgo(11.8), assigned: 8, overdue: 4, closedThisWeek: 19, cases: ['INV-2214', 'FLG-4409', 'MW-117'] },
  { email: 'grace@nom.cloud', name: 'Grace Wanjiru', team: 'Security', role: 'Security reviewer', status: 'Active', mfa: 'Enabled', lastLoginAt: hoursAgo(20.4), assigned: 5, overdue: 1, closedThisWeek: 9, cases: ['SEC-3320', 'FLG-4408', 'AR-88'] },
  { email: 'tom@nom.cloud', name: 'Tom Bwire', team: 'Support', role: 'Support operator', status: 'Active', mfa: 'Not enabled', lastLoginAt: hoursAgo(1.4), assigned: 14, overdue: 5, closedThisWeek: 31, cases: ['SEC-3320', 'MW-116', 'FLG-4406'] },
]

export const operatorTeams: Array<{ id: string; name: string; lead: string; members: number; focus: string }> = [
  { id: 'team-ops', name: 'Platform operations', lead: 'Leila Hassan', members: 2, focus: 'Incidents, releases and platform changes' },
  { id: 'team-success', name: 'School success', lead: 'Amina Yusuf', members: 2, focus: 'Onboarding, applications and school health' },
  { id: 'team-finance', name: 'Billing', lead: 'Daniel Otieno', members: 1, focus: 'Subscriptions, invoices and adjustments' },
  { id: 'team-security', name: 'Security', lead: 'Grace Wanjiru', members: 1, focus: 'Investigations, reviews and incident response' },
]

export const operatorLoginHistory: Record<string, Array<{ at: string; result: string; location: string; device: string }>> = {
  'tom@nom.cloud': [
    { at: hoursAgo(1.4), result: 'Succeeded', location: 'Unrecognised country', device: 'Chrome · Windows' },
    { at: hoursAgo(11.2), result: 'Failed', location: 'Unrecognised country', device: 'Chrome · Windows' },
    { at: hoursAgo(13.6), result: 'Failed', location: 'Unrecognised country', device: 'Chrome · Windows' },
    { at: daysAgo(1.2, 9), result: 'Succeeded', location: 'Mombasa, KE', device: 'Chrome · Android' },
  ],
  default: [
    { at: hoursAgo(3.5), result: 'Succeeded', location: 'Kisumu, KE', device: 'Firefox · Windows' },
    { at: daysAgo(1, 8), result: 'Succeeded', location: 'Kisumu, KE', device: 'Firefox · Windows' },
    { at: daysAgo(2, 8), result: 'Succeeded', location: 'Kisumu, KE', device: 'Firefox · Windows' },
  ],
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export interface FeatureFlag {
  id: string
  key: string
  name: string
  description: string
  status: 'Enabled' | 'Disabled' | 'Beta' | 'Coming soon'
  rolloutPercent: number
  plans: string[]
  scope: string
  owner: string
  adoptionPercent: number | null
  openErrors: number
  updatedAt: string
  enforcement: 'Enforced in backend' | 'UI only'
  history: Array<{ at: string; actor: string; change: string }>
}

export const featureFlags: FeatureFlag[] = [
  {
    id: 'FF-20', key: 'online_fee_payments', name: 'Online fee payments', description: 'Guardians pay fees from the parent workspace.',
    status: 'Enabled', rolloutPercent: 100, plans: ['Growth', 'Enterprise'], scope: 'All schools', owner: 'Daniel Otieno',
    adoptionPercent: 68, openErrors: 0, updatedAt: daysAgo(6, 11), enforcement: 'Enforced in backend',
    history: [
      { at: daysAgo(6, 11), actor: 'Daniel Otieno', change: 'Rollout raised from 50% to 100%' },
      { at: daysAgo(20, 9), actor: 'Daniel Otieno', change: 'Enabled for Growth and Enterprise plans' },
    ],
  },
  {
    id: 'FF-19', key: 'bulk_report_exports', name: 'Bulk report exports', description: 'Export attendance and academic reports as spreadsheets.',
    status: 'Beta', rolloutPercent: 25, plans: ['Growth', 'Enterprise'], scope: '4 schools in the pilot group', owner: 'Amina Yusuf',
    adoptionPercent: 22, openErrors: 3, updatedAt: daysAgo(2, 15), enforcement: 'UI only',
    history: [
      { at: daysAgo(2, 15), actor: 'Amina Yusuf', change: 'Pilot widened from 2 to 4 schools' },
      { at: daysAgo(9, 10), actor: 'Amina Yusuf', change: 'Feature created and enabled for the pilot group' },
    ],
  },
  {
    id: 'FF-18', key: 'attendance_automation', name: 'Attendance automation', description: 'Automatic absence notices from attendance records.',
    status: 'Disabled', rolloutPercent: 0, plans: [], scope: 'No schools', owner: 'Amina Yusuf',
    adoptionPercent: null, openErrors: 0, updatedAt: daysAgo(14, 9), enforcement: 'UI only',
    history: [{ at: daysAgo(14, 9), actor: 'Leila Hassan', change: 'Disabled after delivery failures' }],
  },
  {
    id: 'FF-17', key: 'mobile_money_settlement', name: 'Mobile money settlement', description: 'Settle fee payments through mobile money providers.',
    status: 'Beta', rolloutPercent: 10, plans: ['Enterprise'], scope: '2 schools', owner: 'Daniel Otieno',
    adoptionPercent: 5, openErrors: 1, updatedAt: daysAgo(4, 12), enforcement: 'Enforced in backend',
    history: [
      { at: daysAgo(4, 12), actor: 'Daniel Otieno', change: 'Rollout raised from 5% to 10%' },
      { at: daysAgo(16, 9), actor: 'Daniel Otieno', change: 'Staged for Enterprise only' },
    ],
  },
  {
    id: 'FF-16', key: 'timetable_builder', name: 'Timetable builder', description: 'Build and publish the school timetable.',
    status: 'Coming soon', rolloutPercent: 0, plans: [], scope: 'Not started', owner: 'Amina Yusuf',
    adoptionPercent: null, openErrors: 0, updatedAt: daysAgo(30, 9), enforcement: 'UI only',
    history: [{ at: daysAgo(30, 9), actor: 'Amina Yusuf', change: 'Registered for a later release' }],
  },
  {
    id: 'FF-15', key: 'guardian_messaging', name: 'Guardian messaging', description: 'Two-way messaging between teachers and guardians.',
    status: 'Enabled', rolloutPercent: 100, plans: ['Starter', 'Growth', 'Enterprise'], scope: 'All schools', owner: 'Amina Yusuf',
    adoptionPercent: 81, openErrors: 0, updatedAt: daysAgo(45, 9), enforcement: 'Enforced in backend',
    history: [{ at: daysAgo(45, 9), actor: 'Leila Hassan', change: 'Enabled for every plan' }],
  },
]

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export interface Integration {
  id: string
  provider: string
  category: 'Email' | 'SMS' | 'Payments' | 'Mobile money' | 'Storage' | 'Analytics'
  status: 'Connected' | 'Degraded' | 'Disconnected'
  credentialStatus: 'Active' | 'Expiring soon' | 'Missing'
  credentialLabel: string
  lastCheckedAt: string
  note: string
}

export const integrations: Integration[] = [
  { id: 'INT-1', provider: 'Email delivery provider', category: 'Email', status: 'Connected', credentialStatus: 'Active', credentialLabel: 'API key · ends 4f2a', lastCheckedAt: hoursAgo(0.5), note: 'Transactional email for invitations, statements and notices.' },
  { id: 'INT-2', provider: 'SMS gateway', category: 'SMS', status: 'Degraded', credentialStatus: 'Expiring soon', credentialLabel: 'API key · ends 91bd', lastCheckedAt: hoursAgo(1.2), note: 'Delivery receipts slow for one network.' },
  { id: 'INT-3', provider: 'Card payments provider', category: 'Payments', status: 'Degraded', credentialStatus: 'Active', credentialLabel: 'Secret key · ends 7c03', lastCheckedAt: hoursAgo(0.3), note: 'Provider incident open — see System Health.' },
  { id: 'INT-4', provider: 'Mobile money provider', category: 'Mobile money', status: 'Connected', credentialStatus: 'Active', credentialLabel: 'Merchant id · ends 22e8', lastCheckedAt: hoursAgo(2.4), note: 'Pilot for Enterprise schools.' },
  { id: 'INT-5', provider: 'File storage provider', category: 'Storage', status: 'Connected', credentialStatus: 'Active', credentialLabel: 'Service key · ends 8ba1', lastCheckedAt: hoursAgo(4), note: 'School documents and exports.' },
  { id: 'INT-6', provider: 'Product analytics', category: 'Analytics', status: 'Disconnected', credentialStatus: 'Missing', credentialLabel: 'Not configured', lastCheckedAt: daysAgo(9, 9), note: 'No events are being sent.' },
]

export interface WebhookEndpoint {
  id: string
  provider: string
  path: string
  events: string[]
  status: 'Healthy' | 'Failing' | 'Paused'
  failureRate: number
  lastDeliveryAt: string
}

export const webhookEndpoints: WebhookEndpoint[] = [
  { id: 'WH-1', provider: 'Card payments provider', path: '/functions/settle-fee-payment', events: ['payment.completed', 'payment.failed'], status: 'Failing', failureRate: 34, lastDeliveryAt: hoursAgo(0.4) },
  { id: 'WH-2', provider: 'SMS gateway', path: '/functions/delivery-receipts', events: ['message.delivered', 'message.undelivered'], status: 'Healthy', failureRate: 2, lastDeliveryAt: hoursAgo(0.9) },
  { id: 'WH-3', provider: 'Email delivery provider', path: '/functions/email-events', events: ['email.bounced', 'email.opened'], status: 'Healthy', failureRate: 0, lastDeliveryAt: hoursAgo(0.2) },
  { id: 'WH-4', provider: 'Mobile money provider', path: '/functions/mobile-money-callback', events: ['collection.completed'], status: 'Paused', failureRate: 0, lastDeliveryAt: daysAgo(3, 14) },
]

export interface WebhookDelivery {
  id: string
  endpointId: string
  event: string
  at: string
  statusCode: number
  attempts: number
  outcome: 'Delivered' | 'Failed' | 'Queued for retry'
  error: string | null
  payload: string
}

export const webhookDeliveries: WebhookDelivery[] = [
  { id: 'DL-9921', endpointId: 'WH-1', event: 'payment.completed', at: hoursAgo(0.4), statusCode: 500, attempts: 3, outcome: 'Failed', error: 'Payment provider link unavailable', payload: '{"event":"payment.completed","amount":480,"currency":"USD"}' },
  { id: 'DL-9920', endpointId: 'WH-1', event: 'payment.failed', at: hoursAgo(1.1), statusCode: 500, attempts: 2, outcome: 'Failed', error: 'Payment provider link unavailable', payload: '{"event":"payment.failed","reason":"card_declined"}' },
  { id: 'DL-9919', endpointId: 'WH-2', event: 'message.delivered', at: hoursAgo(0.9), statusCode: 200, attempts: 1, outcome: 'Delivered', error: null, payload: '{"event":"message.delivered","to":"+254…"}' },
  { id: 'DL-9918', endpointId: 'WH-3', event: 'email.bounced', at: hoursAgo(1.1), statusCode: 200, attempts: 1, outcome: 'Delivered', error: null, payload: '{"event":"email.bounced","code":"550"}' },
  { id: 'DL-9917', endpointId: 'WH-1', event: 'payment.completed', at: hoursAgo(2.6), statusCode: 504, attempts: 5, outcome: 'Failed', error: 'Gateway timeout', payload: '{"event":"payment.completed","amount":210,"currency":"USD"}' },
  { id: 'DL-9916', endpointId: 'WH-2', event: 'message.undelivered', at: hoursAgo(3.4), statusCode: 200, attempts: 1, outcome: 'Delivered', error: null, payload: '{"event":"message.undelivered","code":"absent-subscriber"}' },
  { id: 'DL-9915', endpointId: 'WH-1', event: 'payment.completed', at: hoursAgo(5.8), statusCode: 0, attempts: 4, outcome: 'Queued for retry', error: 'Connection reset by peer', payload: '{"event":"payment.completed","amount":120,"currency":"USD"}' },
]

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const billingPlans: Array<{
  id: string
  name: string
  monthly: number
  annual: number
  limitStudents: number
  limitTeachers: number
  storageGb: number
  schools: number
  features: string[]
}> = [
  { id: 'plan-starter', name: 'Starter', monthly: 199, annual: 1_990, limitStudents: 300, limitTeachers: 25, storageGb: 20, schools: 41, features: ['Students and guardians', 'Attendance', 'Fees and receipts'] },
  { id: 'plan-growth', name: 'Growth', monthly: 400, annual: 4_000, limitStudents: 1_500, limitTeachers: 120, storageGb: 120, schools: 44, features: ['Everything in Starter', 'Online fee payments', 'Bulk report exports (beta)'] },
  { id: 'plan-enterprise', name: 'Enterprise', monthly: 820, annual: 8_200, limitStudents: 6_000, limitTeachers: 500, storageGb: 500, schools: 19, features: ['Everything in Growth', 'Mobile money settlement (beta)', 'Priority support'] },
]

export interface SchoolSubscription {
  id: string
  school: string
  plan: string
  status: 'Active' | 'Trialing' | 'Past due' | 'Cancelled'
  startedAt: string
  renewsAt: string
  mrr: number
  seatsUsed: number
}

export const schoolSubscriptions: SchoolSubscription[] = [
  { id: 'SUB-9001', school: 'Riverside Academy', plan: 'Growth', status: 'Active', startedAt: daysAgo(120, 9), renewsAt: daysAhead(11, 1), mrr: 400, seatsUsed: 412 },
  { id: 'SUB-9002', school: 'Al-Fajr Secondary School', plan: 'Enterprise', status: 'Active', startedAt: daysAgo(210, 9), renewsAt: daysAhead(4, 1), mrr: 820, seatsUsed: 1_640 },
  { id: 'SUB-9003', school: 'Sunrise Primary School', plan: 'Starter', status: 'Active', startedAt: daysAgo(330, 9), renewsAt: daysAhead(21, 1), mrr: 199, seatsUsed: 268 },
  { id: 'SUB-9004', school: 'Greenfield High School', plan: 'Growth', status: 'Active', startedAt: daysAgo(64, 9), renewsAt: daysAhead(26, 1), mrr: 400, seatsUsed: 588 },
  { id: 'SUB-9005', school: 'Hillside Montessori', plan: 'Starter', status: 'Past due', startedAt: daysAgo(150, 9), renewsAt: daysAgo(12, 1), mrr: 199, seatsUsed: 143 },
  { id: 'SUB-9006', school: 'Lakeview Academy', plan: 'Growth', status: 'Past due', startedAt: daysAgo(96, 9), renewsAt: daysAgo(2, 1), mrr: 400, seatsUsed: 496 },
  { id: 'SUB-9007', school: 'Northgate Secondary School', plan: 'Enterprise', status: 'Trialing', startedAt: daysAgo(9, 9), renewsAt: daysAhead(21, 1), mrr: 0, seatsUsed: 1_120 },
  { id: 'SUB-9008', school: 'Harmony International School', plan: 'Growth', status: 'Active', startedAt: daysAgo(1, 9), renewsAt: daysAhead(29, 1), mrr: 400, seatsUsed: 96 },
]

export interface BillingInvoice {
  id: string
  school: string
  plan: string
  issuedAt: string
  dueAt: string
  paidAt: string | null
  amount: number
  status: 'Paid' | 'Open' | 'Overdue' | 'Void'
}

export const billingInvoices: BillingInvoice[] = [
  { id: 'INV-2214', school: 'Lakeview Academy', plan: 'Growth', issuedAt: daysAgo(2, 6), dueAt: daysAhead(5, 23), paidAt: null, amount: 400, status: 'Overdue' },
  { id: 'INV-2213', school: 'Hillside Montessori', plan: 'Starter', issuedAt: daysAgo(12, 6), dueAt: daysAgo(5, 23), paidAt: null, amount: 199, status: 'Overdue' },
  { id: 'INV-2212', school: 'Greenfield High School', plan: 'Growth', issuedAt: daysAgo(8, 6), dueAt: daysAhead(6, 23), paidAt: daysAgo(4, 10), amount: 400, status: 'Paid' },
  { id: 'INV-2211', school: 'Al-Fajr Secondary School', plan: 'Enterprise', issuedAt: daysAgo(14, 6), dueAt: daysAgo(2, 23), paidAt: daysAgo(3, 11), amount: 820, status: 'Paid' },
  { id: 'INV-2210', school: 'Riverside Academy', plan: 'Growth', issuedAt: daysAgo(20, 6), dueAt: daysAgo(9, 23), paidAt: daysAgo(9, 14), amount: 400, status: 'Paid' },
  { id: 'INV-2209', school: 'Sunrise Primary School', plan: 'Starter', issuedAt: daysAgo(22, 6), dueAt: daysAgo(11, 23), paidAt: null, amount: 199, status: 'Open' },
  { id: 'INV-2208', school: 'Northgate Secondary School', plan: 'Enterprise', issuedAt: daysAgo(9, 6), dueAt: daysAhead(21, 23), paidAt: null, amount: 0, status: 'Open' },
]

export interface BillingPayment {
  id: string
  invoiceId: string
  school: string
  amount: number
  method: 'Card' | 'Mobile money' | 'Bank transfer'
  at: string
  status: 'Succeeded' | 'Failed' | 'Refunded'
  failureReason: string | null
}

export const billingPayments: BillingPayment[] = [
  { id: 'PAY-5510', invoiceId: 'INV-2214', school: 'Lakeview Academy', amount: 400, method: 'Card', at: hoursAgo(2.3), status: 'Failed', failureReason: 'Card declined by issuer' },
  { id: 'PAY-5509', invoiceId: 'INV-2214', school: 'Lakeview Academy', amount: 400, method: 'Card', at: hoursAgo(26.1), status: 'Failed', failureReason: 'Card declined by issuer' },
  { id: 'PAY-5508', invoiceId: 'INV-2212', school: 'Greenfield High School', amount: 400, method: 'Mobile money', at: daysAgo(4, 10), status: 'Succeeded', failureReason: null },
  { id: 'PAY-5507', invoiceId: 'INV-2211', school: 'Al-Fajr Secondary School', amount: 820, method: 'Bank transfer', at: daysAgo(3, 11), status: 'Succeeded', failureReason: null },
  { id: 'PAY-5506', invoiceId: 'INV-2210', school: 'Riverside Academy', amount: 400, method: 'Card', at: daysAgo(9, 14), status: 'Succeeded', failureReason: null },
  { id: 'PAY-5505', invoiceId: 'INV-2205', school: 'Hillside Montessori', amount: 199, method: 'Card', at: daysAgo(11, 9), status: 'Refunded', failureReason: 'Duplicate charge' },
]

export const billingAdjustments: Array<{ id: string; school: string; kind: 'Discount' | 'Service credit' | 'Manual adjustment'; amount: number; reason: string; authorizedBy: string; at: string }> = [
  { id: 'ADJ-311', school: 'Sunrise Primary School', kind: 'Service credit', amount: -120, reason: 'Delivery delay in September', authorizedBy: 'Daniel Otieno', at: hoursAgo(19.4) },
  { id: 'ADJ-310', school: 'Greenfield High School', kind: 'Discount', amount: -40, reason: 'Annual commitment discount', authorizedBy: 'Daniel Otieno', at: daysAgo(8, 9) },
  { id: 'ADJ-309', school: 'Hillside Montessori', kind: 'Manual adjustment', amount: 199, reason: 'Reversed duplicate charge', authorizedBy: 'Leila Hassan', at: daysAgo(11, 9) },
]

// ---------------------------------------------------------------------------
// Backups and recovery
// ---------------------------------------------------------------------------

export interface BackupJob {
  id: string
  type: 'Database' | 'File storage' | 'Configuration'
  schedule: string
  retentionDays: number
  lastRunAt: string
  lastStatus: 'Succeeded' | 'Failed'
  sizeGb: number
  location: string
  restoreTestId: string | null
}

export const backupJobs: BackupJob[] = [
  { id: 'BK-1', type: 'Database', schedule: 'Daily at 02:00', retentionDays: 35, lastRunAt: hoursAgo(7.5), lastStatus: 'Succeeded', sizeGb: 6.4, location: 'Primary region', restoreTestId: 'RT-44' },
  { id: 'BK-2', type: 'File storage', schedule: 'Daily at 03:00', retentionDays: 35, lastRunAt: hoursAgo(6.5), lastStatus: 'Succeeded', sizeGb: 42.8, location: 'Primary region', restoreTestId: null },
  { id: 'BK-3', type: 'Configuration', schedule: 'On every change', retentionDays: 90, lastRunAt: daysAgo(1, 16), lastStatus: 'Failed', sizeGb: 0.02, location: 'Version control', restoreTestId: 'RT-42' },
]

export const backupRuns: Array<{ id: string; jobId: string; startedAt: string; finishedAt: string | null; status: 'Succeeded' | 'Failed' | 'Running'; sizeGb: number; note: string }> = [
  { id: 'RUN-8841', jobId: 'BK-1', startedAt: hoursAgo(7.6), finishedAt: hoursAgo(7.5), status: 'Succeeded', sizeGb: 6.4, note: 'Verified by checksum' },
  { id: 'RUN-8840', jobId: 'BK-2', startedAt: hoursAgo(6.7), finishedAt: hoursAgo(6.5), status: 'Succeeded', sizeGb: 42.8, note: 'Verified by checksum' },
  { id: 'RUN-8839', jobId: 'BK-3', startedAt: daysAgo(1, 16), finishedAt: daysAgo(1, 16), status: 'Failed', sizeGb: 0, note: 'Snapshot refused by the file lock held by a running job' },
  { id: 'RUN-8838', jobId: 'BK-1', startedAt: daysAgo(1, 2), finishedAt: daysAgo(1, 2), status: 'Succeeded', sizeGb: 6.3, note: 'Verified by checksum' },
  { id: 'RUN-8837', jobId: 'BK-2', startedAt: daysAgo(2, 3), finishedAt: daysAgo(2, 3), status: 'Succeeded', sizeGb: 42.4, note: 'Verified by checksum' },
  { id: 'RUN-8836', jobId: 'BK-1', startedAt: daysAgo(3, 2), finishedAt: daysAgo(3, 2), status: 'Succeeded', sizeGb: 6.2, note: 'Verified by checksum' },
]

export const restoreTests: Array<{ id: string; jobId: string; at: string; operator: string; target: string; result: 'Passed' | 'Failed' | 'Not run'; durationMin: number; recordsChecked: number; notes: string }> = [
  { id: 'RT-44', jobId: 'BK-1', at: daysAgo(5, 11), operator: 'Leila Hassan', target: 'Staging project', result: 'Passed', durationMin: 38, recordsChecked: 128_400, notes: 'Row counts and a sample of fee records matched the source.' },
  { id: 'RT-43', jobId: 'BK-1', at: daysAgo(12, 11), operator: 'Amina Yusuf', target: 'Staging project', result: 'Passed', durationMin: 41, recordsChecked: 121_900, notes: 'Restored and re-ran the application workflow checks.' },
  { id: 'RT-42', jobId: 'BK-3', at: daysAgo(20, 11), operator: 'Grace Wanjiru', target: 'Recovery checklist', result: 'Failed', durationMin: 15, recordsChecked: 0, notes: 'Two steps referenced credentials that had already been rotated.' },
  { id: 'RT-41', jobId: 'BK-2', at: daysAgo(27, 11), operator: 'Tom Bwire', target: 'Staging project', result: 'Not run', durationMin: 0, recordsChecked: 0, notes: 'Scheduled but cancelled when the maintenance window was shortened.' },
]

export const recoveryObjectives = {
  rpoMinutes: 60,
  rtoMinutes: 240,
  retentionDays: 35,
  lastReviewedAt: daysAgo(5, 11),
  owner: 'Leila Hassan',
  offsite: 'Not configured',
}

export const recoveryChecklist: Array<{ id: string; step: string; owner: string; status: 'Ready' | 'Needs work' }> = [
  { id: 'rc-1', step: 'Confirm the incident and declare a recovery start time', owner: 'On-call operator', status: 'Ready' },
  { id: 'rc-2', step: 'Notify affected schools with the impact and expected duration', owner: 'School success', status: 'Ready' },
  { id: 'rc-3', step: 'Select the last verified recovery point', owner: 'Platform operations', status: 'Ready' },
  { id: 'rc-4', step: 'Restore the database into an isolated project first', owner: 'Platform operations', status: 'Needs work' },
  { id: 'rc-5', step: 'Validate row counts and a sample of financial records', owner: 'Finance', status: 'Needs work' },
  { id: 'rc-6', step: 'Re-point the application and confirm sign-in', owner: 'Platform operations', status: 'Ready' },
  { id: 'rc-7', step: 'Record the recovery, duration and data loss window', owner: 'Founder', status: 'Ready' },
]

// ---------------------------------------------------------------------------
// Data (records center)
// ---------------------------------------------------------------------------

export const dataJobs: Array<{ id: string; kind: 'Export' | 'Import' | 'Deletion request' | 'Access request'; scope: string; requestedBy: string; at: string; status: 'Completed' | 'Running' | 'Pending' | 'Rejected'; records: number; expiresAt: string | null; note: string }> = [
  { id: 'DJ-771', kind: 'Export', scope: 'Student records · Riverside Academy', requestedBy: 'daniel@nom.cloud', at: hoursAgo(9.4), status: 'Completed', records: 18_420, expiresAt: daysAhead(6, 9), note: 'Flagged by the audit rule for mass export' },
  { id: 'DJ-770', kind: 'Deletion request', scope: 'Guardian contact records · Hillside Montessori', requestedBy: 'School administrator', at: daysAgo(2, 10), status: 'Pending', records: 12, expiresAt: null, note: 'Awaiting founder authorisation and a written reason' },
  { id: 'DJ-769', kind: 'Import', scope: 'Teacher roster · Northgate Secondary School', requestedBy: 'School administrator', at: daysAgo(2, 8), status: 'Completed', records: 74, expiresAt: null, note: 'No rejected rows' },
  { id: 'DJ-768', kind: 'Access request', scope: 'Incident review · platform audit logs', requestedBy: 'grace@nom.cloud', at: daysAgo(4, 15), status: 'Completed', records: 512, expiresAt: daysAhead(26, 9), note: 'Scoped to sign-in events for one operator' },
  { id: 'DJ-767', kind: 'Export', scope: 'Billing history · All schools', requestedBy: 'leila@nom.cloud', at: daysAgo(7, 12), status: 'Completed', records: 3_140, expiresAt: daysAgo(0.5, 12), note: 'Link expired' },
  { id: 'DJ-766', kind: 'Deletion request', scope: 'Draft school application · unknown applicant', requestedBy: 'Applicant', at: daysAgo(9, 9), status: 'Rejected', records: 1, expiresAt: null, note: 'Retained under the application retention window' },
]

// ---------------------------------------------------------------------------
// People directory
// ---------------------------------------------------------------------------

export const peopleDirectory: Array<{ id: string; name: string; email: string; role: 'Administrator' | 'Teacher' | 'Parent' | 'Operator'; school: string; status: 'Active' | 'Invited' | 'Deactivated'; joinedAt: string; lastActiveAt: string }> = [
  { id: 'PP-1', name: 'Naomi Kariuki', email: 'naomi@riverside.example', role: 'Administrator', school: 'Riverside Academy', status: 'Active', joinedAt: daysAgo(120, 9), lastActiveAt: hoursAgo(0.6) },
  { id: 'PP-2', name: 'Yusuf Ali', email: 'yusuf@alfajr.example', role: 'Administrator', school: 'Al-Fajr Secondary School', status: 'Active', joinedAt: daysAgo(210, 9), lastActiveAt: hoursAgo(2.4) },
  { id: 'PP-3', name: 'Grace Mbeki', email: 'grace@sunrise.example', role: 'Teacher', school: 'Sunrise Primary School', status: 'Active', joinedAt: daysAgo(94, 9), lastActiveAt: hoursAgo(5.1) },
  { id: 'PP-4', name: 'Peter Njoroge', email: 'peter@greenfield.example', role: 'Teacher', school: 'Greenfield High School', status: 'Invited', joinedAt: daysAgo(3, 9), lastActiveAt: daysAgo(3, 9) },
  { id: 'PP-5', name: 'Fatuma Noor', email: 'fatuma@hillside.example', role: 'Parent', school: 'Hillside Montessori', status: 'Active', joinedAt: daysAgo(64, 9), lastActiveAt: hoursAgo(21.5) },
  { id: 'PP-6', name: 'Brenda Achieng', email: 'brenda@lakeview.example', role: 'Parent', school: 'Lakeview Academy', status: 'Active', joinedAt: daysAgo(41, 9), lastActiveAt: daysAgo(1, 18) },
  { id: 'PP-7', name: 'Kevin Mutua', email: 'kevin@northgate.example', role: 'Teacher', school: 'Northgate Secondary School', status: 'Deactivated', joinedAt: daysAgo(180, 9), lastActiveAt: daysAgo(11, 9) },
  { id: 'PP-8', name: 'Halima Abdi', email: 'halima@harmony.example', role: 'Administrator', school: 'Harmony International School', status: 'Active', joinedAt: daysAgo(1, 9), lastActiveAt: hoursAgo(1.2) },
  { id: 'PP-9', name: 'Angela Wambui', email: 'angela@riverside.example', role: 'Parent', school: 'Riverside Academy', status: 'Invited', joinedAt: hoursAgo(20), lastActiveAt: hoursAgo(20) },
  { id: 'PP-10', name: 'Samuel Kimani', email: 'samuel@sunrise.example', role: 'Parent', school: 'Sunrise Primary School', status: 'Active', joinedAt: daysAgo(150, 9), lastActiveAt: daysAgo(2, 7) },
  { id: 'PP-11', name: 'Leila Hassan', email: 'leila@nom.cloud', role: 'Operator', school: 'Nom Cloud', status: 'Active', joinedAt: daysAgo(400, 9), lastActiveAt: hoursAgo(0.2) },
  { id: 'PP-12', name: 'Tom Bwire', email: 'tom@nom.cloud', role: 'Operator', school: 'Nom Cloud', status: 'Active', joinedAt: daysAgo(90, 9), lastActiveAt: hoursAgo(1.4) },
]

// ---------------------------------------------------------------------------
// Communications
// ---------------------------------------------------------------------------

export const platformAnnouncements: Array<{
  id: string
  title: string
  audience: string
  channel: 'In-app' | 'Email' | 'SMS'
  status: 'Draft' | 'Scheduled' | 'Sending' | 'Sent' | 'Partially failed'
  sentAt: string | null
  recipients: number
  delivered: number
  failed: number
  author: string
  body: string
}> = [
  {
    id: 'ANN-61', title: 'Payment provider incident', audience: 'Administrators of 62 affected schools', channel: 'Email',
    status: 'Sent', sentAt: hoursAgo(1.2), recipients: 62, delivered: 61, failed: 1, author: 'Leila Hassan',
    body: 'Fee payments started between 06:00 and 09:00 may have failed. No money left any account. We will retry automatically.',
  },
  {
    id: 'ANN-60', title: 'Scheduled maintenance on Saturday', audience: 'All school administrators', channel: 'Email',
    status: 'Scheduled', sentAt: daysAhead(2, 6), recipients: 104, delivered: 0, failed: 0, author: 'Amina Yusuf',
    body: 'Reporting will be unavailable for two hours on Saturday from 02:00. Teaching and attendance stay online.',
  },
  {
    id: 'ANN-59', title: 'October fee statement is ready', audience: 'Guardians on Growth and Enterprise plans', channel: 'In-app',
    status: 'Sent', sentAt: daysAgo(3, 8), recipients: 18_400, delivered: 17_980, failed: 420, author: 'Daniel Otieno',
    body: 'Your school published the October statement. Open the Fees page to see the balance and download a receipt.',
  },
  {
    id: 'ANN-58', title: 'New report export is in beta', audience: 'Pilot schools (4)', channel: 'In-app',
    status: 'Partially failed', sentAt: daysAgo(5, 10), recipients: 4, delivered: 3, failed: 1, author: 'Amina Yusuf',
    body: 'Bulk report exports are available in your workspace. Tell us what to improve before the wider rollout.',
  },
  {
    id: 'ANN-57', title: 'Draft · pricing change notice', audience: 'All school administrators', channel: 'Email',
    status: 'Draft', sentAt: null, recipients: 0, delivered: 0, failed: 0, author: 'Leila Hassan',
    body: 'Growth plan pricing changes on 1 January. Existing subscriptions keep the current price until renewal.',
  },
]
