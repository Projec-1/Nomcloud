import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  ArrowUp,
  ArrowsIn,
  ArrowsOut,
  CalendarCheck,
  ChartBar,
  Check,
  File,
  Image as ImageIcon,
  Microphone,
  Paperclip,
  Plus,
  Sparkle,
  Stop,
  Users,
  Wallet,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import {
  demoAdminAIService,
  type AdminAIActionPreview,
  type AdminAIReport,
  type AdminAIResponse,
} from '@/services/adminAIService'

interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly 0: { readonly transcript: string }
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number
  readonly results: ArrayLike<SpeechRecognitionResult>
}

interface SpeechRecognitionErrorEvent {
  readonly error: string
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike
}

interface BrowserSpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

interface LocalAttachment {
  id: string
  file: File
  previewUrl?: string
}

interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
  attachments?: { name: string; type: string; previewUrl?: string }[]
  report?: AdminAIReport
  action?: AdminAIActionPreview
  actionStatus?: 'confirmed' | 'cancelled'
  error?: string
}

const MAX_ATTACHMENTS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024
const makeId = () => crypto.randomUUID()
const adminAIService = demoAdminAIService

const suggestions = [
  { title: 'adminAI.suggestion.attendance', prompt: 'adminAI.suggestion.attendancePrompt', icon: CalendarCheck },
  { title: 'adminAI.suggestion.fees', prompt: 'adminAI.suggestion.feesPrompt', icon: Wallet },
  { title: 'adminAI.suggestion.records', prompt: 'adminAI.suggestion.recordsPrompt', icon: Users },
  { title: 'adminAI.suggestion.academic', prompt: 'adminAI.suggestion.academicPrompt', icon: ChartBar },
]

function AIReportCard({ report }: { report: AdminAIReport }) {
  const { t } = useLanguage()
  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-ink/10 bg-white dark:border-white/10 dark:bg-white/[0.03]" aria-label={`${t('adminAI.report.sample')}: ${report.title}`}>
      <div className="flex items-center justify-between gap-2 border-b border-ink/5 px-3 py-2.5 dark:border-white/10">
        <h3 className="text-sm font-semibold text-ink dark:text-white">{report.title}</h3>
        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-800 dark:text-amber-200">{t('adminAI.report.sample')}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-ink/5 dark:bg-white/10">
        {report.metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 bg-white p-3 dark:bg-[#202328]">
            <p className="text-xs text-graphite">{metric.label}</p>
            <p className="mt-1 truncate text-lg font-semibold tabular-nums text-ink dark:text-white">{metric.value}</p>
            <p className="mt-0.5 text-[10px] text-graphite">{metric.note}</p>
          </div>
        ))}
      </div>
      {report.breakdown.length > 0 && (
        <div className="space-y-2.5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-graphite">{t('adminAI.report.breakdown')}</p>
          {report.breakdown.map((item) => (
            <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_1.5fr_2rem] items-center gap-2 text-xs">
              <span className="truncate text-ink dark:text-white/90">{item.label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }} />
              </div>
              <span className="text-right tabular-nums text-graphite">{item.value}%</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ActionPreview({
  action,
  status,
  onStatusChange,
}: {
  action: AdminAIActionPreview
  status?: AssistantMessage['actionStatus']
  onStatusChange: (status: 'confirmed' | 'cancelled') => void
}) {
  const { t } = useLanguage()
  return (
    <section className="mt-3 rounded-xl border border-brand/20 bg-brand/[0.04] p-3 dark:bg-brand/[0.08]" aria-label={t('adminAI.action.title')}>
      <div className="flex items-center gap-2 text-xs font-semibold text-ink dark:text-white">
        <Sparkle className="h-4 w-4 text-brand" aria-hidden="true" /> {t('adminAI.action.title')}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-ink dark:text-white">{action.title}</h3>
      <p className="mt-1.5 text-sm leading-5 text-ink dark:text-white/90">{action.message}</p>
      <p className="mt-2 text-xs text-graphite"><span className="font-semibold">{t('adminAI.action.audience')}:</span> {action.audience}</p>
      <p className="mt-2 text-xs text-graphite">{t('adminAI.action.review')}</p>
      {status ? (
        <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-ink dark:bg-black/10 dark:text-white" role="status">
          {t(status === 'confirmed' ? 'adminAI.action.confirmed' : 'adminAI.action.cancelled')}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onStatusChange('confirmed')} className="min-h-10 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            {t('adminAI.action.confirm')}
          </button>
          <button type="button" onClick={() => onStatusChange('cancelled')} className="min-h-10 rounded-lg border border-ink/10 px-3 text-xs font-medium text-ink hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:border-white/10 dark:text-white dark:hover:bg-white/10">
            {t('adminAI.action.cancel')}
          </button>
        </div>
      )}
    </section>
  )
}

export default function AdminAIAssistant() {
  const { school } = useAuth()
  const { lang, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [copyState, setCopyState] = useState<{ id: string; error?: boolean } | null>(null)
  const [expanded, setExpanded] = useState(true)
  const panelRef = useRef<HTMLElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const openedOnce = useRef(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceBaseDraft = useRef('')
  const previewUrls = useRef(new Map<string, string>())
  const isDemo = adminAIService.mode === 'demo'
  const isArabic = lang === 'ar'

  useEffect(() => () => {
    recognitionRef.current?.stop()
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current.clear()
  }, [])

  useEffect(() => {
    if (!open) {
      if (openedOnce.current) launcherRef.current?.focus()
      return
    }
    openedOnce.current = true
    composerRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    if (window.innerWidth < 768) document.body.style.overflow = 'hidden'

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open || !transcriptRef.current) return
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [open, messages.length, isLoading])

  const removeAttachment = (id: string) => {
    const url = previewUrls.current.get(id)
    if (url) URL.revokeObjectURL(url)
    previewUrls.current.delete(id)
    setAttachments((current) => current.filter((item) => item.id !== id))
  }

  const addAttachments = (files: FileList | null) => {
    if (!files) return
    setAttachmentError('')
    const selected = Array.from(files)
    const availableSlots = MAX_ATTACHMENTS - attachments.length
    if (selected.length > availableSlots) setAttachmentError(t('adminAI.attachments.limit'))
    const next: LocalAttachment[] = []
    for (const file of selected.slice(0, availableSlots)) {
      if (file.size > MAX_FILE_SIZE) {
        setAttachmentError(t('adminAI.attachments.tooLarge'))
        continue
      }
      const id = makeId()
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      if (previewUrl) previewUrls.current.set(id, previewUrl)
      next.push({ id, file, previewUrl })
    }
    setAttachments((current) => [...current, ...next])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const startVoiceInput = () => {
    setVoiceError('')
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const SpeechRecognition = (window as BrowserSpeechWindow).SpeechRecognition
      ?? (window as BrowserSpeechWindow).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceError(t('adminAI.voice.unsupported'))
      return
    }
    try {
      const recognition = new SpeechRecognition()
      recognition.lang = lang === 'ar' ? 'ar' : lang === 'so' ? 'so' : 'en-US'
      recognition.interimResults = true
      voiceBaseDraft.current = draft
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join('')
        if (transcript) {
          const prefix = voiceBaseDraft.current
          setDraft(`${prefix}${prefix && !prefix.endsWith(' ') ? ' ' : ''}${transcript}`)
        }
      }
      recognition.onerror = (event) => {
        setVoiceError(t(event.error === 'not-allowed' ? 'adminAI.voice.permissionDenied' : 'adminAI.voice.error'))
        setIsListening(false)
        recognitionRef.current = null
      }
      recognition.onend = () => {
        setIsListening(false)
        recognitionRef.current = null
      }
      recognitionRef.current = recognition
      setIsListening(true)
      recognition.start()
    } catch {
      setIsListening(false)
      setVoiceError(t('adminAI.voice.error'))
      recognitionRef.current = null
    }
  }

  const submitMessage = async (event?: FormEvent) => {
    event?.preventDefault()
    const prompt = draft.trim()
    if ((!prompt && attachments.length === 0) || isLoading) return

    const attachmentSnapshot = attachments.map(({ file, previewUrl }) => ({
      name: file.name,
      type: file.type,
      previewUrl,
    }))
    const attachmentNames = attachments.map(({ file }) => file.name)
    const userMessage: AssistantMessage = {
      id: makeId(),
      role: 'user',
      text: prompt,
      attachments: attachmentSnapshot,
      createdAt: Date.now(),
    }
    setMessages((current) => [...current, userMessage])
    setDraft('')
    setAttachmentError('')
    if (composerRef.current) composerRef.current.style.height = 'auto'
    setAttachments([])
    setIsLoading(true)
    try {
      const response: AdminAIResponse = await adminAIService.sendMessage(prompt || t('adminAI.attachments.messageOnly'), lang, attachmentNames)
      setMessages((current) => [...current, {
        id: makeId(),
        role: 'assistant',
        text: response.text,
        report: response.report,
        action: response.action,
        createdAt: Date.now(),
      }])
    } catch (error) {
      setMessages((current) => [...current, {
        id: makeId(),
        role: 'assistant',
        text: '',
        error: error instanceof Error ? error.message : t('adminAI.responseError'),
        createdAt: Date.now(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submitMessage()
    }
  }

  const setActionStatus = (messageId: string, status: 'confirmed' | 'cancelled') => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, actionStatus: status } : message))
  }

  const copyResponse = async (message: AssistantMessage) => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopyState({ id: message.id })
    } catch {
      setCopyState({ id: message.id, error: true })
    }
  }

  const resetChat = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current.clear()
    setMessages([])
    setDraft('')
    setAttachmentError('')
    setVoiceError('')
    setCopyState(null)
  }

  const closePanel = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
    setOpen(false)
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          ref={launcherRef}
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[70] flex min-h-14 items-center gap-3 rounded-2xl border border-ink/10 bg-white px-3 py-2.5 shadow-[0_8px_30px_rgba(24,24,27,0.16)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(24,24,27,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-white/10 dark:bg-[#202328] dark:shadow-[0_8px_30px_rgba(0,0,0,0.38)]"
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))', right: 'calc(1.25rem + env(safe-area-inset-right))' }}
          aria-label={t('adminAI.open')}
          aria-haspopup="dialog"
          aria-expanded="false"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/[0.07]">
            <img src="/logo-512.png" alt="" className="h-8 w-8 object-contain" />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold leading-5 text-ink dark:text-white">Nom Cloud AI</span>
            <span className="block text-[11px] leading-4 text-graphite">{t('adminAI.demo')}</span>
          </span>
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-[79] bg-ink/35 backdrop-blur-[2px] md:hidden" onClick={closePanel} aria-hidden="true" />
          <section
            ref={panelRef}
            role="dialog"
            aria-modal={window.innerWidth < 768}
            aria-labelledby="admin-ai-panel-title"
            className={`fixed inset-0 z-[80] flex h-[100dvh] w-full flex-col overflow-hidden border border-ink/10 bg-white shadow-[0_18px_64px_rgba(24,24,27,0.22)] dark:border-white/10 dark:bg-[#202328] md:inset-auto md:bottom-4 md:right-4 md:h-[min(820px,calc(100dvh-2rem))] md:min-w-[380px] md:rounded-2xl ${expanded ? 'md:w-[min(40vw,580px)]' : 'md:w-[min(34vw,420px)]'}`}
          >
            <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-ink/5 px-4 py-3.5 dark:border-white/10 sm:px-5" style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/[0.07]">
                  <img src="/logo-512.png" alt="" className="h-8 w-8 object-contain" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="admin-ai-panel-title" className="text-sm font-semibold text-ink dark:text-white">Nom Cloud AI</h2>
                    {isDemo && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">{t('adminAI.demo')}</span>}
                  </div>
                  <p className="truncate text-xs text-graphite">{school?.name || t('adminAI.subtitle')}</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button type="button" onClick={resetChat} className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-graphite hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/10" aria-label={t('adminAI.newConversation')} title={t('adminAI.newConversation')}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('adminAI.newConversation')}</span>
                </button>
                <button type="button" onClick={() => setExpanded((value) => !value)} className="hidden h-10 w-10 items-center justify-center rounded-lg text-graphite hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand md:flex" aria-label={expanded ? t('adminAI.collapse') : t('adminAI.expand')}>
                  {expanded ? <ArrowsIn className="h-4 w-4" aria-hidden="true" /> : <ArrowsOut className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button type="button" onClick={closePanel} className="flex h-10 w-10 items-center justify-center rounded-lg text-graphite hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/10" aria-label={t('adminAI.close')}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            {isDemo && (
              <div className="flex flex-shrink-0 items-start gap-2 border-b border-amber-500/15 bg-amber-500/[0.05] px-4 py-2.5 text-xs leading-5 text-ink dark:text-white/90 sm:px-5">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                <p>{t('adminAI.demoNotice')}</p>
              </div>
            )}

            <div ref={transcriptRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" aria-label={t('adminAI.chat')} aria-live="polite">
              {messages.length === 0 ? (
                <div className="flex min-h-full flex-col justify-center">
                  <div className="mb-5">
                    <h3 className="text-xl font-semibold tracking-tight text-ink dark:text-white sm:text-2xl">{t('adminAI.welcome')}</h3>
                    <p className="mt-2 text-sm leading-6 text-graphite">{t('adminAI.welcomeDetail')}</p>
                  </div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-graphite">{t('adminAI.suggestions')}</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map(({ title, prompt, icon: Icon }) => (
                      <button key={title} type="button" onClick={() => {
                        setDraft(t(prompt))
                        composerRef.current?.focus()
                      }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:border-brand/30 hover:bg-brand/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:border-white/10 dark:text-white dark:hover:bg-white/[0.04]">
                        <Icon className="h-4 w-4 flex-shrink-0 text-brand" aria-hidden="true" />
                        {t(title)}
                      </button>
                    ))}
                  </div>
                  {isDemo && <p className="mt-5 text-xs text-graphite">{t('adminAI.composer.note')}</p>}
                </div>
              ) : messages.map((message) => (
                <article key={message.id} className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role === 'assistant' && (
                    <img src="/logo-512.png" alt="" className="mt-1 h-7 w-7 flex-shrink-0 object-contain" />
                  )}
                  <div className={`min-w-0 max-w-[92%] ${message.role === 'user' ? 'rounded-2xl rounded-br-md bg-brand/[0.08] px-3.5 py-3 dark:bg-brand/15' : 'flex-1 py-1'}`}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-graphite">
                      <span className="font-semibold text-ink dark:text-white">{message.role === 'user' ? t('dash.role.admin') : 'Nom Cloud AI'}</span>
                      <time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' })}</time>
                      {message.role === 'assistant' && isDemo && <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-800 dark:text-amber-200">{t('adminAI.sampleOnly')}</span>}
                    </div>
                    {message.error ? (
                      <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3 text-sm text-red-700 dark:text-red-300">
                        {message.error}
                        <button type="button" onClick={() => {
                          const previousUser = messages.slice(0, messages.findIndex((item) => item.id === message.id)).reverse().find((item) => item.role === 'user')
                          if (!previousUser) return
                          setMessages((current) => current.filter((item) => item.id !== message.id))
                          setDraft(previousUser.text)
                          composerRef.current?.focus()
                        }} className="mt-2 block min-h-10 font-semibold underline">{t('adminAI.retry')}</button>
                      </div>
                    ) : (
                      <>
                        {message.text && <p dir={isArabic ? 'rtl' : 'auto'} className="whitespace-pre-wrap text-sm leading-6 text-ink dark:text-white/90">{message.text}</p>}
                        {message.attachments?.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.attachments.map((attachment, index) => (
                              <div key={`${message.id}-${index}`} className="flex max-w-full items-center gap-2 rounded-lg border border-ink/10 bg-white/70 p-2 dark:border-white/10 dark:bg-black/10">
                                {attachment.previewUrl
                                  ? <img src={attachment.previewUrl} alt={attachment.name} className="h-10 w-10 rounded-md object-cover" />
                                  : <File className="h-5 w-5 flex-shrink-0 text-graphite" aria-hidden="true" />}
                                <span className="max-w-40 truncate text-xs text-ink dark:text-white">{attachment.name}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {message.report && <AIReportCard report={message.report} />}
                        {message.action && <ActionPreview action={message.action} status={message.actionStatus} onStatusChange={(status) => setActionStatus(message.id, status)} />}
                        {message.role === 'assistant' && message.text && (
                          <button type="button" onClick={() => void copyResponse(message)} className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[11px] text-graphite hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/10">
                            {copyState?.id === message.id && !copyState.error ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <span className="sr-only">{t('adminAI.copy')}</span>}
                            {copyState?.id === message.id ? t(copyState.error ? 'adminAI.copyError' : 'adminAI.copyDone') : t('adminAI.copy')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2.5 text-xs text-graphite" role="status">
                  <img src="/logo-512.png" alt="" className="h-7 w-7 object-contain" />
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" aria-hidden="true" />
                    {t('adminAI.composer.generating')}
                  </span>
                </div>
              )}
            </div>

            <form onSubmit={(event) => void submitMessage(event)} className="flex-shrink-0 border-t border-ink/5 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-white/10 dark:bg-[#202328] sm:px-4">
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map(({ id, file, previewUrl }) => (
                    <div key={id} className="relative flex max-w-[48%] items-center gap-2 rounded-xl border border-ink/10 bg-mist p-2 dark:border-white/10 dark:bg-white/[0.04]">
                      {previewUrl
                        ? <img src={previewUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                        : <File className="h-5 w-5 flex-shrink-0 text-graphite" aria-hidden="true" />}
                      <span className="max-w-36 truncate text-xs text-ink dark:text-white">{file.name}</span>
                      <button type="button" onClick={() => removeAttachment(id)} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-graphite hover:bg-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/10" aria-label={`${t('adminAI.attachments.remove')}: ${file.name}`}>
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {attachmentError && <p className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">{attachmentError}</p>}
              {voiceError && <p className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">{voiceError}</p>}
              {isListening && <p className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-brand" role="status"><span className="h-2 w-2 animate-pulse rounded-full bg-brand" />{t('adminAI.voice.listening')}</p>}
              {isDemo && <p className="mb-2 text-[10px] leading-4 text-graphite">{t('adminAI.attachments.localOnly')} {t('adminAI.voice.localOnly')}</p>}
              <div className="rounded-2xl border border-ink/10 bg-mist/70 p-2 focus-within:border-brand/35 focus-within:ring-2 focus-within:ring-brand/10 dark:border-white/10 dark:bg-white/[0.035]">
                <label htmlFor="admin-ai-chat-composer" className="sr-only">{t('adminAI.composer.label')}</label>
                <textarea
                  id="admin-ai-chat-composer"
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  onInput={(event) => {
                    const target = event.currentTarget
                    target.style.height = 'auto'
                    target.style.height = `${Math.min(target.scrollHeight, 112)}px`
                  }}
                  rows={2}
                  maxLength={4000}
                  placeholder={t('adminAI.composer.placeholder')}
                  dir={isArabic ? 'rtl' : 'auto'}
                  disabled={isLoading}
                  className="max-h-28 min-h-12 w-full resize-none bg-transparent px-2 py-2 text-sm leading-5 text-ink placeholder:text-graphite/80 focus:outline-none dark:text-white"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => addAttachments(event.target.files)} aria-label={t('adminAI.attachments.choose')} />
                    <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => addAttachments(event.target.files)} aria-label={t('adminAI.attachments.image')} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading || attachments.length >= MAX_ATTACHMENTS} className="flex h-10 w-10 items-center justify-center rounded-lg text-graphite hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40 dark:hover:bg-white/10" aria-label={t('adminAI.attachments.choose')} title={t('adminAI.attachments.choose')}>
                      <Paperclip className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => imageInputRef.current?.click()} disabled={isLoading || attachments.length >= MAX_ATTACHMENTS} className="flex h-10 w-10 items-center justify-center rounded-lg text-graphite hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40 dark:hover:bg-white/10" aria-label={t('adminAI.attachments.image')} title={t('adminAI.attachments.image')}>
                      <ImageIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={startVoiceInput} disabled={isLoading} className={`flex h-10 w-10 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40 ${isListening ? 'bg-brand/10 text-brand' : 'text-graphite hover:bg-white dark:hover:bg-white/10'}`} aria-label={isListening ? t('adminAI.voice.stop') : t('adminAI.voice.start')} aria-pressed={isListening} title={isListening ? t('adminAI.voice.stop') : t('adminAI.voice.start')}>
                      {isListening ? <Stop className="h-4 w-4" aria-hidden="true" /> : <Microphone className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-[10px] tabular-nums text-graphite sm:inline">{draft.length}/4000</span>
                    <button type="submit" disabled={(!draft.trim() && attachments.length === 0) || isLoading} className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-45" aria-label={t('adminAI.composer.send')} title={t('adminAI.composer.send')}>
                      <ArrowUp className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </section>
        </>
      )}
    </>
  )
}
