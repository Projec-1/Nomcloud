/**
 * One-off codemod for School Applications.
 *
 * The screen was written for a forced dark background (it lived inside its own
 * `dark` wrapper), so it used light-on-dark utilities only. Now that it renders
 * inside the shared Operator Control Center shell it has to follow the global
 * theme, so every dark-only utility gains a light-mode counterpart.
 *
 * Each token is rewritten exactly once, in a single pass, so a class produced
 * for dark mode is never re-processed.
 */
const fs = require('node:fs')

const file = 'src/pages/platform/ApplicationsManagement.tsx'

/** base token -> [light-mode class, dark-mode class] */
const MAP = {
  // Text
  'text-white': ['text-ink', 'text-white'],
  'text-slate-100': ['text-ink', 'text-white'],
  'text-slate-200': ['text-ink', 'text-slate-200'],
  'text-slate-300': ['text-graphite', 'text-slate-300'],
  'text-slate-400': ['text-graphite', 'text-slate-400'],
  'text-rose-100': ['text-red-700', 'text-rose-100'],
  'text-rose-200': ['text-red-700', 'text-rose-200'],
  'text-emerald-100': ['text-emerald-700', 'text-emerald-100'],
  'text-emerald-200': ['text-emerald-700', 'text-emerald-200'],
  'text-emerald-300': ['text-emerald-600', 'text-emerald-300'],
  'text-amber-50': ['text-amber-700', 'text-amber-50'],
  'text-amber-50/80': ['text-amber-700/80', 'text-amber-50/80'],
  'text-amber-100': ['text-amber-700', 'text-amber-100'],
  'text-amber-100/80': ['text-amber-700/90', 'text-amber-100/80'],
  'text-amber-200': ['text-amber-700', 'text-amber-200'],
  'text-blue-200': ['text-blue-700', 'text-blue-200'],
  'text-violet-200': ['text-violet-700', 'text-violet-200'],
  'text-orange-100': ['text-brand', 'text-orange-100'],
  'text-orange-200': ['text-brand', 'text-orange-200'],

  // Surfaces
  'bg-white/10': ['bg-ink/5', 'bg-white/10'],
  'bg-white/[0.03]': ['bg-ink/[0.03]', 'bg-white/[0.03]'],
  'bg-white/[0.02]': ['bg-ink/[0.02]', 'bg-white/[0.02]'],
  'bg-white/[0.035]': ['bg-ink/[0.035]', 'bg-white/[0.035]'],
  'bg-white/[0.04]': ['bg-ink/[0.035]', 'bg-white/[0.04]'],
  'bg-white/[0.06]': ['bg-ink/[0.05]', 'bg-white/[0.06]'],
  'bg-white/[0.08]': ['bg-ink/[0.06]', 'bg-white/[0.08]'],
  'bg-[#1b1d21]': ['bg-white', 'bg-[#1b1d21]'],
  'bg-[#202328]': ['bg-white', 'bg-[#202328]'],
  'bg-[#25282d]': ['bg-white', 'bg-[#25282d]'],
  'bg-[#282b30]': ['bg-white', 'bg-[#282b30]'],
  'bg-slate-400': ['bg-graphite', 'bg-slate-400'],

  // Tinted alerts and badges
  'bg-rose-300/5': ['bg-red-500/[0.06]', 'bg-rose-300/5'],
  'bg-rose-300/10': ['bg-red-500/10', 'bg-rose-300/10'],
  'bg-emerald-300/5': ['bg-emerald-500/[0.06]', 'bg-emerald-300/5'],
  'bg-emerald-300/10': ['bg-emerald-500/10', 'bg-emerald-300/10'],
  'bg-amber-300/5': ['bg-amber-500/[0.06]', 'bg-amber-300/5'],
  'bg-amber-300/10': ['bg-amber-500/10', 'bg-amber-300/10'],
  'bg-blue-300/10': ['bg-blue-500/10', 'bg-blue-300/10'],
  'bg-violet-300/10': ['bg-violet-500/10', 'bg-violet-300/10'],
  'bg-slate-300/10': ['bg-slate-400/10', 'bg-slate-300/10'],

  // Borders and dividers
  'border-white/10': ['border-ink/10', 'border-white/10'],
  'border-white/15': ['border-ink/15', 'border-white/15'],
  'border-white/30': ['border-ink/25', 'border-white/30'],
  'border-white/[0.07]': ['border-ink/[0.07]', 'border-white/[0.07]'],
  'border-[#202328]': ['border-white', 'border-[#202328]'],
  'border-rose-300/30': ['border-red-500/25', 'border-rose-300/30'],
  'border-rose-300/40': ['border-red-500/30', 'border-rose-300/40'],
  'border-emerald-300/25': ['border-emerald-500/25', 'border-emerald-300/25'],
  'border-emerald-300/30': ['border-emerald-500/25', 'border-emerald-300/30'],
  'border-emerald-300/40': ['border-emerald-500/30', 'border-emerald-300/40'],
  'border-amber-300/25': ['border-amber-500/25', 'border-amber-300/25'],
  'border-amber-300/30': ['border-amber-500/25', 'border-amber-300/30'],
  'border-amber-300/40': ['border-amber-500/30', 'border-amber-300/40'],
  'border-blue-300/40': ['border-blue-500/30', 'border-blue-300/40'],
  'border-violet-300/40': ['border-violet-500/30', 'border-violet-300/40'],
  'border-slate-300/30': ['border-slate-400/30', 'border-slate-300/30'],
  'divide-white/10': ['divide-ink/10', 'divide-white/10'],
  'divide-white/[0.07]': ['divide-ink/[0.06]', 'divide-white/[0.07]'],
}

const TOKEN = /(^|[\s"'={(`])((?:[a-zA-Z-]+:)*!?(?:[a-zA-Z-]+:)*)((?:text|bg|border|divide|placeholder|ring|shadow|from|to|via)-[A-Za-z0-9./#\[\]%_-]+)/g

let source = fs.readFileSync(file, 'utf8')
const before = source
const unhandled = new Set()
let rewritten = 0

source = source.replace(TOKEN, (match, lead, prefix, base) => {
  const entry = MAP[base]
  if (!entry) {
    if (/(white|slate|#[0-9a-fA-F]{3,8})/.test(base)) unhandled.add(base)
    return match
  }
  rewritten += 1
  const parts = prefix.split(':')
  const variants = parts.filter((part) => part && part !== '!')
  const important = parts.includes('!') ? '!' : ''
  const light = `${important}${variants.join(':')}${variants.length ? ':' : ''}${entry[0]}`
  const dark = `${important}${['dark', ...variants].join(':')}:${entry[1]}`
  return `${lead}${light} ${dark}`
})

// Date pickers no longer force a dark colour scheme.
source = source.replace(/ ?\[color-scheme:dark\]/g, '')

// Dialogs follow the global theme instead of forcing dark.
source = source.replace(/^[ \t]*darkMode\r?\n/gm, '')

// The list header now uses the shared section header so its typography matches
// every other Operator Control Center screen.
const headerStart = source.indexOf('      <header className="flex flex-wrap items-end justify-between gap-4">')
const headerEndMarker = '      </header>'
const headerEnd = source.indexOf(headerEndMarker)
if (headerStart === -1 || headerEnd === -1) {
  console.error('List header not found; skipping the header swap.')
} else {
  const replacement = [
    '      <SectionHeader',
    '        eyebrow="Network onboarding"',
    '        title="School applications"',
    '        description="Review submissions, verify school details, and move each application forward."',
    '        action={',
    '          <p className="rounded-xl border border-ink/[0.07] bg-white px-3 py-2 text-xs font-semibold tabular-nums text-graphite dark:border-white/[0.08] dark:bg-white/[0.04]">',
    '            {statusCounts.all} active application{statusCounts.all === 1 ? \'\' : \'s\'}',
    '          </p>',
    '        }',
    '      />',
  ].join('\r\n')
  source = `${source.slice(0, headerStart)}${replacement}${source.slice(headerEnd + headerEndMarker.length)}`
}

if (!source.includes("import { SectionHeader } from './operator/PrototypeKit'")) {
  source = source.replace(
    "import { errorMessage } from '@/utils/errorMessage'",
    "import { errorMessage } from '@/utils/errorMessage'\nimport { SectionHeader } from './operator/PrototypeKit'",
  )
}

fs.writeFileSync(file, source)
console.log(`Rewrote ${rewritten} utility tokens in ${file}.`)
console.log(`Changed: ${source !== before}`)
if (unhandled.size) {
  console.log('Tokens that look themed but are not in the map (review these):')
  for (const token of [...unhandled].sort()) console.log(`  - ${token}`)
} else {
  console.log('No unhandled themed tokens left.')
}
