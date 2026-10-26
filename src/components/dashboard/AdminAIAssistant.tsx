import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  ArrowUp,
  ArrowsIn,
  ArrowsOut,
  CalendarCheck,
  Check,
  ChatCircleDots,
  ClockCounterClockwise,
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

interface AssistantConversation {
  id: string
  title: string
  updatedAt: number
  messages: AssistantMessage[]
}

const MAX_ATTACHMENTS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024
const makeId = () => crypto.randomUUID()
const adminAIService = demoAdminAIService
const supportedDocumentExtensions = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'])

const suggestions = [
  { title: 'adminAI.suggestion.attendance', prompt: 'adminAI.suggestion.attendancePrompt', icon: CalendarCheck },
  { title: 'adminAI.suggestion.fees', prompt: 'adminAI.suggestion.feesPrompt', icon: Wallet },
  { title: 'adminAI.suggestion.records', prompt: 'adminAI.suggestion.recordsPrompt', icon: Users },
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
  const { displayName } = useAuth()
  const { lang, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [conversations, setConversations] = useState<AssistantConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [copyState, setCopyState] = useState<{ id: string; error?: boolean } | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const openedOnce = useRef(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const attachmentMenuRef = useRef<HTMLDivElement>(null)
  const attachmentMenuButtonRef = useRef<HTMLButtonElement>(null)
  const imageMenuItemRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceBaseDraft = useRef('')
  const activeConversationIdRef = useRef<string | null>(null)
  const previewUrls = useRef(new Map<string, string>())
  const isDemo = adminAIService.mode === 'demo'
  const isArabic = lang === 'ar'
  const messages = conversations.find(({ id }) => id === activeConversationId)?.messages ?? []
  const adminFirstName = displayName.trim().split(/\s+/)[0]
  const localHour = new Date().getHours()
  const greetingKey = localHour < 12 ? 'adminAI.greeting.morning' : localHour < 18 ? 'adminAI.greeting.afternoon' : 'adminAI.greeting.evening'
  const greetingParts = t(adminFirstName ? greetingKey : `${greetingKey}Fallback`).split('{name}')

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
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (attachmentMenuOpen) {
          setAttachmentMenuOpen(false)
          attachmentMenuButtonRef.current?.focus()
        } else if (showHistory) {
          setShowHistory(false)
        } else {
          setIsExpanded(false)
          setOpen(false)
        }
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
  }, [attachmentMenuOpen, open, showHistory])

  useEffect(() => {
    if (!attachmentMenuOpen) return
    imageMenuItemRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && !attachmentMenuRef.current?.contains(target) && !attachmentMenuButtonRef.current?.contains(target)) {
        setAttachmentMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [attachmentMenuOpen])

  useEffect(() => {
    if (!open || !transcriptRef.current) return
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [activeConversationId, open, messages.length, isLoading, showHistory])

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
    const availableSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length)
    if (selected.length > availableSlots) setAttachmentError(t('adminAI.attachments.limit'))
    const next: LocalAttachment[] = []
    for (const file of selected.slice(0, availableSlots)) {
      if (file.size > MAX_FILE_SIZE) {
        setAttachmentError(t('adminAI.attachments.tooLarge'))
        continue
      }
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      const isImage = file.type.startsWith('image/')
      const isDocument = supportedDocumentExtensions.has(extension)
      if (!isImage && !isDocument) {
        setAttachmentError(t('adminAI.attachments.unsupportedType'))
        continue
      }
      const id = makeId()
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined
      if (previewUrl) previewUrls.current.set(id, previewUrl)
      next.push({ id, file, previewUrl })
    }
    setAttachments((current) => [...current, ...next])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (imageInputRef.current) imageInputRef.current.value = ''
    setAttachmentMenuOpen(false)
    attachmentMenuButtonRef.current?.focus()
  }

  const appendMessage = (message: AssistantMessage) => {
    let conversationId = activeConversationIdRef.current
    if (!conversationId) {
      conversationId = makeId()
      activeConversationIdRef.current = conversationId
      setActiveConversationId(conversationId)
    }
    const id = conversationId
    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === id)
      const nextMessages = [...(existing?.messages ?? []), message]
      const firstUserMessage = nextMessages.find((item) => item.role === 'user')
      const titleSource = firstUserMessage?.text || firstUserMessage?.attachments?.[0]?.name || t('adminAI.newConversation')
      const conversation: AssistantConversation = {
        id,
        title: titleSource.length > 56 ? `${titleSource.slice(0, 53)}…` : titleSource,
        updatedAt: message.createdAt,
        messages: nextMessages,
      }
      return [conversation, ...current.filter((item) => item.id !== id)]
    })
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
    appendMessage(userMessage)
    setDraft('')
    setAttachmentError('')
    if (composerRef.current) composerRef.current.style.height = 'auto'
    setAttachments([])
    setIsLoading(true)
    const conversationId = activeConversationIdRef.current
    try {
      const response: AdminAIResponse = await adminAIService.sendMessage(prompt || t('adminAI.attachments.messageOnly'), lang, attachmentNames)
      if (activeConversationIdRef.current !== conversationId) return
      appendMessage({
        id: makeId(),
        role: 'assistant',
        text: response.text,
        report: response.report,
        action: response.action,
        createdAt: Date.now(),
      })
    } catch (error) {
      if (activeConversationIdRef.current !== conversationId) return
      appendMessage({
        id: makeId(),
        role: 'assistant',
        text: '',
        error: error instanceof Error ? error.message : t('adminAI.responseError'),
        createdAt: Date.now(),
      })
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
    setConversations((current) => current.map((conversation) => conversation.id === activeConversationId
      ? { ...conversation, messages: conversation.messages.map((message) => message.id === messageId ? { ...message, actionStatus: status } : message) }
      : conversation))
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
    activeConversationIdRef.current = null
    setActiveConversationId(null)
    setShowHistory(false)
    setDraft('')
    setAttachmentError('')
    setVoiceError('')
    setAttachmentMenuOpen(false)
    attachments.forEach(({ id }) => {
      const url = previewUrls.current.get(id)
      if (url) URL.revokeObjectURL(url)
      previewUrls.current.delete(id)
    })
    setAttachments([])
    setCopyState(null)
  }

  const openConversation = (conversation: AssistantConversation) => {
    activeConversationIdRef.current = conversation.id
    setActiveConversationId(conversation.id)
    setShowHistory(false)
    setDraft('')
    setAttachmentError('')
  }

  const closePanel = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
    setAttachmentMenuOpen(false)
    setIsExpanded(false)
    setOpen(false)
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          ref={launcherRef}
          onClick={() => {
            setIsExpanded(false)
            setOpen(true)
          }}
          className="fixed bottom-5 right-5 z-[70] flex min-h-16 items-center gap-3 rounded-2xl border border-ink/10 bg-white px-3 py-2.5 shadow-[0_8px_30px_rgba(24,24,27,0.16)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(24,24,27,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-white/10 dark:bg-[#202328] dark:shadow-[0_8px_30px_rgba(0,0,0,0.38)]"
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))', right: 'calc(1.25rem + env(safe-area-inset-right))' }}
          aria-label={t('adminAI.open')}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className="admin-ai-logo-badge flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-white p-1 dark:border-brand/40">
            <img src="/logo-512.png" alt="" className="h-10 w-10 object-contain" />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold leading-5 text-ink dark:text-white">Nom Cloud AI</span>
            <span className="block text-[11px] leading-4 text-graphite">{t('adminAI.demo')}</span>
          </span>
        </button>
      )}

      {open && (
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-ai-panel-title"
          className={`admin-ai-workspace fixed z-[80] flex overflow-hidden border border-white/40 transition-[inset,width,height,border-radius] duration-200 motion-reduce:transition-none ${
            isExpanded
              ? 'inset-0 rounded-none sm:inset-2 sm:rounded-2xl'
              : 'inset-x-0 bottom-0 top-[8dvh] rounded-t-2xl sm:inset-x-4 sm:bottom-4 sm:top-auto sm:mx-auto sm:h-[min(760px,calc(100dvh-2rem))] sm:w-[min(680px,calc(100vw-2rem))] sm:rounded-2xl md:inset-x-auto md:right-6 md:mx-0 md:w-[min(680px,calc(100vw-3rem))]'
          }`}
        >
          <aside className="admin-ai-sidebar hidden w-[224px] flex-shrink-0 flex-col border-r border-white/20 px-4 py-5 text-white md:flex">
            <div className="flex items-center gap-2.5 px-2">
              <span className="admin-ai-sidebar-mark flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
                <img src="/logo-512.png" alt="" className="h-6 w-6 object-contain" />
              </span>
              <span className="text-[17px] font-semibold tracking-tight text-white">Nom Cloud</span>
            </div>

            <button
              type="button"
              onClick={resetChat}
              disabled={isLoading}
              className="admin-ai-new-chat mt-8 flex min-h-11 items-center gap-2.5 rounded-xl border border-white/20 px-3 text-sm font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
            >
              <Plus className="h-4 w-4 text-[#ff9a4e]" aria-hidden="true" />
              {t('adminAI.newConversation')}
            </button>

            <div className="mb-2 mt-7 px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">{t('adminAI.history.sidebar')}</div>
            {conversations.length === 0 ? (
              <p className="px-1 py-3 text-xs leading-5 text-white/65">{t('adminAI.history.empty')}</p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {conversations.slice(0, 5).map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => openConversation(conversation)}
                      className={`admin-ai-history-row flex min-h-14 w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white disabled:opacity-50 ${conversation.id === activeConversationId ? 'is-active' : ''}`}
                    >
                      <ChatCircleDots className="mt-0.5 h-4 w-4 flex-shrink-0 text-white/85" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-white">{conversation.title}</span>
                        <time className="mt-1 block text-[10px] text-white/65" dateTime={new Date(conversation.updatedAt).toISOString()}>
                          {new Date(conversation.updatedAt).toLocaleString(lang, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                        </time>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" onClick={() => setShowHistory(true)} className="mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-3 text-xs text-white/90 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              <ClockCounterClockwise className="h-4 w-4" aria-hidden="true" />
              {t('adminAI.history.viewAll')}
            </button>

          </aside>

          <div className="admin-ai-main flex min-w-0 flex-1 flex-col">
            <header className="flex flex-shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-5">
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                disabled={isLoading}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 bg-white/20 px-3 text-xs font-medium text-ink backdrop-blur-sm transition-colors hover:bg-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand md:hidden"
                aria-pressed={showHistory}
              >
                <ClockCounterClockwise className="h-4 w-4" aria-hidden="true" />
                {t('adminAI.history.short')}
              </button>
              <span className="hidden md:block" />
              <div className="flex items-center gap-2">
                <span className="admin-ai-top-pill inline-flex h-10 items-center gap-2 rounded-full border border-white/35 px-3.5 text-xs font-medium text-white">
                  <Sparkle className="h-4 w-4 text-[#ff9a4e]" aria-hidden="true" />
                  <span id="admin-ai-panel-title">{t('adminAI.topLabel')}</span>
                  {isDemo && <span className="admin-ai-mode-tag rounded-full px-1.5 py-0.5 text-[9px]">{t('adminAI.demo')}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setIsExpanded((value) => !value)}
                  className="admin-ai-close flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                  aria-label={t(isExpanded ? 'adminAI.collapse' : 'adminAI.expand')}
                  title={t(isExpanded ? 'adminAI.collapse' : 'adminAI.expand')}
                  aria-pressed={isExpanded}
                >
                  {isExpanded ? <ArrowsIn className="h-4 w-4" aria-hidden="true" /> : <ArrowsOut className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button type="button" onClick={closePanel} className="admin-ai-close flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" aria-label={t('adminAI.close')}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div ref={transcriptRef} className={`admin-ai-transcript min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 ${messages.length === 0 && !showHistory ? 'flex flex-col justify-center' : ''}`} aria-label={showHistory ? t('adminAI.history') : t('adminAI.chat')} aria-live={showHistory ? 'off' : 'polite'}>
              {showHistory ? (
                <section aria-labelledby="admin-ai-history-title" className="mx-auto flex h-full w-full max-w-3xl flex-col">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 id="admin-ai-history-title" className="text-lg font-semibold tracking-tight text-ink dark:text-white">{t('adminAI.history')}</h3>
                    <button type="button" onClick={resetChat} disabled={isLoading} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-brand/20 bg-white/80 px-3 text-xs font-semibold text-ink transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40 dark:border-white/15 dark:bg-white/[0.06] dark:text-white">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {t('adminAI.newConversation')}
                    </button>
                  </div>
                  <p className="mb-3 text-xs leading-5 text-graphite">{t('adminAI.history.memoryNotice')}</p>
                  {conversations.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center" role="status">
                      <ClockCounterClockwise className="mb-3 h-8 w-8 text-brand/70" aria-hidden="true" />
                      <p className="text-sm font-semibold text-ink dark:text-white">{t('adminAI.history.empty')}</p>
                      <p className="mt-1 max-w-sm text-xs leading-5 text-graphite">{t('adminAI.history.emptyDetail')}</p>
                    </div>
                  ) : (
                    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                      {conversations.map((conversation) => (
                        <li key={conversation.id}>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => openConversation(conversation)}
                            className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition-colors hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50 dark:hover:bg-white/[0.06] ${conversation.id === activeConversationId ? 'bg-white/80 dark:bg-white/[0.08]' : ''}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink dark:text-white">{conversation.title}</span>
                              <span className="mt-1 block text-[11px] text-graphite">{conversation.messages.length} {t('adminAI.history.messages')}</span>
                            </span>
                            <time className="shrink-0 text-[11px] text-graphite" dateTime={new Date(conversation.updatedAt).toISOString()}>
                              {new Date(conversation.updatedAt).toLocaleDateString(lang, { month: 'short', day: 'numeric' })}
                            </time>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : messages.length === 0 ? (
                <div className="admin-ai-welcome mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-5 text-center">
                  <span className="admin-ai-welcome-mark mb-4 flex h-[88px] w-[88px] items-center justify-center rounded-full border border-white/65">
                    <img src="/logo-512.png" alt="" className="h-[58px] w-[58px] object-contain" />
                  </span>
                  <h3 className="text-2xl font-semibold tracking-tight text-ink sm:text-[30px]">
                    {greetingParts[0]}
                    {adminFirstName && <span className="text-brand">{adminFirstName}</span>}
                    {greetingParts[1]}
                  </h3>
                  <p className="mt-2 text-base text-ink/70 sm:text-lg">{t('adminAI.greeting.prompt')}</p>
                  <div className="mt-6 grid w-full max-w-[570px] grid-cols-3 gap-2.5 sm:gap-3">
                    {suggestions.map(({ title, prompt, icon: Icon }) => (
                      <button key={title} type="button" onClick={() => {
                        setDraft(t(prompt))
                        composerRef.current?.focus()
                      }} className="admin-ai-suggestion flex min-h-[94px] flex-col items-start justify-between rounded-2xl border px-3 py-3 text-left text-xs font-semibold text-ink transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand sm:min-h-[108px] sm:px-4 sm:text-sm">
                        <span className="admin-ai-suggestion-icon flex h-8 w-8 items-center justify-center rounded-xl sm:h-9 sm:w-9">
                          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
                        </span>
                        <span>{t(title)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : messages.map((message) => {
                const previousUser = message.error
                  ? messages.slice(0, messages.findIndex((item) => item.id === message.id)).reverse().find((item) => item.role === 'user')
                  : undefined
                const canRetry = previousUser !== undefined && !previousUser.attachments?.length
                return (
                <article key={message.id} className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role === 'assistant' && (
                    <span className="admin-ai-logo-badge mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-white p-1 dark:border-brand/40">
                      <img src="/logo-512.png" alt="" className="h-7 w-7 object-contain" />
                    </span>
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
                        {canRetry && previousUser && <button type="button" disabled={isLoading} onClick={() => {
                          setConversations((current) => current.map((conversation) => conversation.id === activeConversationId
                            ? { ...conversation, messages: conversation.messages.filter((item) => item.id !== message.id) }
                            : conversation))
                          setDraft(previousUser.text)
                          composerRef.current?.focus()
                        }} className="mt-2 block min-h-10 font-semibold underline disabled:opacity-40">{t('adminAI.retry')}</button>}
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
                )
              })}
              {!showHistory && isLoading && (
                <div className="flex items-center gap-2.5 text-xs text-graphite" role="status">
                  <span className="admin-ai-logo-badge flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-white p-1 dark:border-brand/40">
                    <img src="/logo-512.png" alt="" className="h-7 w-7 object-contain" />
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" aria-hidden="true" />
                    {t('adminAI.composer.generating')}
                  </span>
                </div>
              )}
            </div>

            {!showHistory && <form onSubmit={(event) => void submitMessage(event)} className="admin-ai-composer relative mx-auto w-full max-w-[700px] flex-shrink-0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 sm:px-4">
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
              {isListening && <p className="mb-2 text-xs leading-4 text-graphite" role="status">{t('adminAI.voice.localOnly')} {t('adminAI.voice.listening')}</p>}
              {isDemo && <p className="mb-2 text-[10px] leading-4 text-ink/70">{t('adminAI.attachments.localOnly')}</p>}
              <div className="admin-ai-composer-shell rounded-2xl border p-2 focus-within:border-white/80 dark:focus-within:border-white/35">
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
                  className="max-h-28 min-h-12 w-full resize-none bg-transparent px-2 py-2 text-sm leading-5 text-ink placeholder:text-graphite/80 focus:outline-none focus-visible:outline-none dark:text-white"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex items-center gap-1">
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" multiple className="hidden" onChange={(event) => addAttachments(event.target.files)} aria-label={t('adminAI.attachments.choose')} />
                    <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => addAttachments(event.target.files)} aria-label={t('adminAI.attachments.image')} />
                    <button
                      ref={attachmentMenuButtonRef}
                      type="button"
                      onClick={() => setAttachmentMenuOpen((value) => !value)}
                      disabled={isLoading || attachments.length >= MAX_ATTACHMENTS}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/75 text-ink transition-colors hover:border-brand/35 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40 dark:border-white/15 dark:bg-white/[0.05] dark:text-white"
                      aria-label={t('adminAI.attachments.menu')}
                      aria-expanded={attachmentMenuOpen}
                      aria-controls="admin-ai-attachment-menu"
                      title={t('adminAI.attachments.menu')}
                    >
                      <Plus className={`h-5 w-5 transition-transform duration-150 ${attachmentMenuOpen ? 'rotate-45' : ''}`} aria-hidden="true" />
                    </button>
                    {attachmentMenuOpen && (
                      <div
                        id="admin-ai-attachment-menu"
                        ref={attachmentMenuRef}
                        className="admin-ai-attachment-menu absolute bottom-12 left-0 z-20 w-52 rounded-2xl border p-1.5"
                        role="group"
                        aria-label={t('adminAI.attachments.menu')}
                      >
                        <button
                          ref={imageMenuItemRef}
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-brand/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:text-white"
                        >
                          <ImageIcon className="h-4 w-4 text-brand" aria-hidden="true" />
                          {t('adminAI.attachments.image')}
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-brand/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:text-white"
                        >
                          <Paperclip className="h-4 w-4 text-brand" aria-hidden="true" />
                          {t('adminAI.attachments.choose')}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-[10px] tabular-nums text-graphite sm:inline">{draft.length}/4000</span>
                    <button type="submit" disabled={(!draft.trim() && attachments.length === 0) || isLoading} className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-45" aria-label={t('adminAI.composer.send')} title={t('adminAI.composer.send')}>
                      <ArrowUp className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-center text-[10px] leading-4 text-white/85">{t('adminAI.footer.disclaimer')}</p>
            </form>}
          </div>
        </section>
      )}
    </>
  )
}
