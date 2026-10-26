import { useState } from 'react'
import { Plus, PushPin as Pin, Megaphone, Pencil, Archive, Trash as Trash2 } from '@phosphor-icons/react'
import { useToast } from '@/context/ToastContext'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { minLength, type FieldErrors } from '@/utils/validators'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import {
  createAnnouncement,
  archiveAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
  setAnnouncementPinned,
  type AnnouncementAudience,
  type AnnouncementPriority,
  type AnnouncementView,
} from '@/services/communicationService'
import { errorMessage } from '@/utils/errorMessage'
import { useAuth } from '@/context/AuthContext'
import { schoolLogoUrl } from '@/services/storageService'

// ---------------------------------------------------------------------------
// Phase 8 batch 7. Real announcements.
//
// Administrators manage all audiences. Teachers are granted class-scoped
// authoring by the later teacher announcements migration.
//
// The board receives separate canManage/canPublish flags so a teacher only
// gets the class audience and class records supplied by their teacher scope.
//
// READERSHIP IS NOT FILTERED HERE. The five SELECT policies decide who sees
// what by audience, and the service deliberately does not restate that matrix
// client-side. A guardian receives 'all' and 'parents' plus their own child's
// class notices; a teacher receives 'all' and 'teachers' plus classes they
// teach. The prototype showed guardians a 'students' audience; that audience no
// longer exists (SYSTEM_ISSUES_LIST M11), because students hold no logins and it
// reached nobody.
// ---------------------------------------------------------------------------

const priorityTone: Record<AnnouncementPriority, 'neutral' | 'warning' | 'danger'> = {
  normal: 'neutral',
  important: 'warning',
  urgent: 'danger',
}

const audienceLabels: Record<AnnouncementAudience, string> = {
  all: 'Entire School',
  teachers: 'All Teachers',
  parents: 'All Parents',
  class: 'Specific Class',
}

interface AnnouncementBoardProps {
  announcements: AnnouncementView[]
  /** Only id and name are read, for the "specific class" selector. */
  classes: { id: string; name: string }[]
  schoolId: string
  /** True only for owner, director and administrator. Gates every write control. */
  canManage: boolean
  /** Allows a teacher to publish within the classes supplied to this board. */
  canPublish?: boolean
  audienceOptions: { value: AnnouncementAudience; label: string }[]
  onChanged: () => void
}

export default function AnnouncementBoard({
  announcements,
  classes,
  schoolId,
  canManage,
  canPublish = false,
  audienceOptions,
  onChanged,
}: AnnouncementBoardProps) {
  const { showToast } = useToast()
  const { school } = useAuth()
  const schoolLogo = schoolLogoUrl(school?.logo_path ?? null)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    body: '',
    audience: (audienceOptions[0]?.value ?? 'all') as AnnouncementAudience,
    classId: classes[0]?.id ?? '',
    groupId: '',
    groupName: '',
    priority: 'normal' as AnnouncementPriority,
    publishAt: '',
    expiresAt: '',
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementView | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<AnnouncementView | null>(null)
  const [permanentDelete, setPermanentDelete] = useState(false)

  const openAdd = () => {
    setEditing(null)
    setForm({
      title: '',
      body: '',
      audience: (audienceOptions[0]?.value ?? 'all') as AnnouncementAudience,
      classId: classes[0]?.id ?? '',
      groupId: '',
      groupName: '',
      priority: 'normal',
      publishAt: '',
      expiresAt: '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const visibleAnnouncements = canManage
    ? announcements
    : announcements.filter((announcement) => {
        const now = Date.now()
        return Boolean(
          announcement.publishedAt &&
          new Date(announcement.publishedAt).getTime() <= now &&
          !announcement.archivedAt &&
          (!announcement.expiresAt || new Date(announcement.expiresAt).getTime() > now),
        )
      })

  const openEdit = (announcement: AnnouncementView) => {
    setEditing(announcement)
    setForm({
      title: announcement.title,
      body: announcement.body,
      audience: announcement.audience,
      classId: announcement.classId ?? classes[0]?.id ?? '',
      groupId: announcement.groupId ?? '',
      groupName: announcement.groupName ?? '',
      priority: announcement.priority,
      publishAt: announcement.publishedAt ? announcement.publishedAt.slice(0, 16) : '',
      expiresAt: announcement.expiresAt ? announcement.expiresAt.slice(0, 16) : '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const validate = () => {
    const next: FieldErrors = {}
    if (!minLength(form.title, 3)) next.title = 'Enter a title.'
    if (!minLength(form.body, 5)) next.body = 'Write the announcement.'
    // announcements_audience_class_check enforces this pairing in the database,
    // in both directions. Checking here only produces a better message.
    if (form.audience === 'class' && !form.classId) next.classId = 'Select the class.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setIsSaving(true)
    try {
      const input = {
        title: form.title,
        body: form.body,
        audience: form.audience,
        classId: form.audience === 'class' ? form.classId : null,
        priority: form.priority,
        publishedAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      }
      if (editing) {
        await updateAnnouncement(schoolId, editing.id, input)
      } else {
        await createAnnouncement(schoolId, input)
      }
      showToast({ type: 'success', title: editing ? 'Announcement updated' : form.publishAt ? 'Announcement scheduled' : 'Announcement published' })
      setModalOpen(false)
      onChanged()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: editing ? 'Announcement not updated' : 'Announcement not published',
        description: errorMessage(err),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const togglePin = async (a: AnnouncementView) => {
    try {
      await setAnnouncementPinned(schoolId, a.id, !a.pinned)
      onChanged()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Could not change the pin',
        description: errorMessage(err),
      })
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (permanentDelete) {
        await deleteAnnouncement(schoolId, deleteTarget.id)
        showToast({ type: 'success', title: 'Announcement deleted' })
      } else {
        await archiveAnnouncement(schoolId, deleteTarget.id)
        showToast({ type: 'success', title: 'Announcement archived' })
      }
      onChanged()
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: 'Announcement not removed',
        description: errorMessage(err),
      })
    } finally {
      setDeleteTarget(null)
      setPermanentDelete(false)
    }
  }

  return (
    <div>
      {(canManage || canPublish) && audienceOptions.length > 0 && (
        <div className="mb-6 flex justify-end">
          <Button onClick={openAdd} className="w-full sm:w-auto" icon={<Plus className="h-4 w-4" />}>
            New Announcement
          </Button>
        </div>
      )}

      {visibleAnnouncements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="School news and updates will appear here."
        />
      ) : (
        <div className="space-y-4">
          {visibleAnnouncements.map((a) => (
            <div
              key={a.id}
              className={cn('card overflow-hidden border-t-4 border-t-[#e6252a]', a.pinned && 'ring-1 ring-brand/20', a.archivedAt && 'opacity-60')}
            >
              <div className="border-b border-[#dbe2eb] px-5 pb-4 pt-5 text-center">
                {schoolLogo ? (
                  <img src={schoolLogo} alt={`${school?.name ?? 'School'} logo`} className="mx-auto h-14 w-14 object-contain" />
                ) : (
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-[#dbe2eb] text-xs font-bold text-[#e6252a]">
                    {school?.name?.slice(0, 2).toUpperCase() ?? 'SC'}
                  </div>
                )}
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-[#e6252a]">{school?.name ?? 'School'}</p>
              </div>
              <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {a.pinned && <Pin className="h-3.5 w-3.5 text-brand" />}
                    <Badge tone={priorityTone[a.priority]}>{a.priority}</Badge>
                    <Badge tone="neutral">
                      {a.audience === 'class'
                        ? classes.find((c) => c.id === a.classId)?.name ?? a.groupName ?? 'Class'
                        : audienceLabels[a.audience]}
                    </Badge>
                    {!a.publishedAt && <Badge tone="neutral">Draft</Badge>}
                    {a.publishedAt && new Date(a.publishedAt) > new Date() && <Badge tone="warning">Scheduled</Badge>}
                    {a.archivedAt && <Badge tone="neutral">Archived</Badge>}
                  </div>
                  <p className="font-medium text-ink dark:text-white">{a.title}</p>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-graphite">{a.body}</p>
                  <p className="mt-2.5 text-xs text-graphite">
                    {a.authorName} · {formatDate(a.publishedAt ?? a.createdAt)}
                  </p>
                </div>
                {(canManage || (canPublish && a.audience === 'class')) && (
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {canManage && <button
                      type="button"
                      onClick={() => togglePin(a)}
                      aria-label={a.pinned ? `Unpin ${a.title}` : `Pin ${a.title}`}
                      className={cn(
                        'rounded-lg p-2 hover:bg-ink/5 dark:hover:bg-white/10',
                        a.pinned ? 'text-brand' : 'text-graphite hover:text-ink dark:hover:text-white',
                      )}
                    >
                      <Pin className="h-4 w-4" />
                    </button>}
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      aria-label={`Edit ${a.title}`}
                      className="rounded-lg p-2 text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(a)}
                      aria-label={`Archive ${a.title}`}
                      className="rounded-lg p-2 text-graphite hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => { setPermanentDelete(true); setDeleteTarget(a) }}
                        aria-label={`Delete ${a.title}`}
                        className="rounded-lg p-2 text-graphite hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Announcement' : 'New Announcement'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isSaving}>
              {isSaving ? 'Saving…' : editing ? 'Save changes' : form.publishAt ? 'Schedule announcement' : 'Publish'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={errors.title}
          />
          <Textarea
            label="Announcement"
            required
            rows={5}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            error={errors.body}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Audience"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value as AnnouncementAudience })}
            >
              {audienceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select
              label="Priority"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as AnnouncementPriority })}
            >
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>
          {form.audience === 'class' && (
            <Select
              label="Class"
              required
              value={form.classId}
              onChange={(e) => setForm({ ...form, classId: e.target.value })}
              error={errors.classId}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Publish date (optional)" type="datetime-local" value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} />
            <Input label="Expires (optional)" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`${permanentDelete ? 'Delete' : 'Archive'} "${deleteTarget?.title}"?`}
        description={permanentDelete
          ? 'This permanently removes the announcement and it cannot be restored.'
          : 'This announcement will be hidden from school dashboards but kept in the administrator record.'}
        confirmLabel={permanentDelete ? 'Delete' : 'Archive'}
        danger={permanentDelete}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
