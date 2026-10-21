import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { List as Menu, Moon, Sun, CaretDown as ChevronDown, Gear as Settings, SignOut as LogOut, Camera, Trash as Trash2 } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import SignOutButton from '@/components/ui/SignOutButton'
import { useToast } from '@/context/ToastContext'
import { useSignedImageUrl } from '@/hooks/useSignedImageUrl'
import { IMAGE_ACCEPT, prepareImage } from '@/lib/imageUpload'
import { BUCKETS, removeOwnAvatar, replaceOwnAvatar } from '@/services/storageService'
import type { Role } from '@/types'
import { useTheme } from '@/context/ThemeContext'
import { roleLabelKey } from '@/components/dashboard/navConfig'
import { useLanguage } from '@/context/LanguageContext'
import LanguageSwitcher from '@/components/layout/LanguageSwitcher'
import Avatar from '@/components/ui/Avatar'
import NotificationsDropdown from '@/components/dashboard/NotificationsDropdown'

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { profile, workspaces, activeRole, activeMembership, setActiveRole, school, platformAdmin, memberships, refreshProfile } =
    useAuth()
  const { showToast } = useToast()
  const avatarUrl = useSignedImageUrl(BUCKETS.profileAvatars, profile?.avatar_url)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!profile || !activeMembership) return null

  // Own profile picture. Staff (owner, director, administrator, principal,
  // teacher) in the current school may set one; guardians may not. This mirrors
  // profile_avatars_self_insert, which is what actually enforces it.
  const canSetAvatar =
    platformAdmin ||
    memberships.some(
      (m) => m.school_id === profile.school_id && m.status === 'active' && m.role !== 'guardian',
    )

  const handleAvatarChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarBusy(true)
    try {
      const image = await prepareImage(file, 'avatar')
      refreshProfile(await replaceOwnAvatar(profile, image))
      showToast({ type: 'success', title: t('dash.topbar.profileUpdated') })
    } catch (err) {
      showToast({ type: 'error', title: t('dash.topbar.pictureNotUploaded'), description: err instanceof Error ? err.message : t('common.tryAgain') })
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleAvatarRemoved = async () => {
    setAvatarBusy(true)
    try {
      refreshProfile(await removeOwnAvatar(profile))
      showToast({ type: 'success', title: t('dash.topbar.profileRemoved') })
    } catch (err) {
      showToast({ type: 'error', title: t('dash.topbar.pictureNotRemoved'), description: err instanceof Error ? err.message : t('common.tryAgain') })
    } finally {
      setAvatarBusy(false)
    }
  }

  const availableRoles = workspaces
  const visibleRole = activeRole && availableRoles.includes(activeRole) ? activeRole : availableRoles[0]
  if (!visibleRole) return null
  // The switcher is a convenience and NEVER a permission; Phase 7 RLS independently verifies every operation.
  const switchRole = (role: Role) => {
    setActiveRole(role)
    setMenuOpen(false)
    navigate(`/app/${role}`)
  }

  return (
    <header className="dashboard-topbar sticky top-0 z-30 flex h-16 flex-shrink-0 items-center justify-between border-b border-ink/5 bg-white/80 px-4 backdrop-blur-xl dark:border-[#343A41] dark:bg-[#17191C]/90 sm:px-6">
      <div className="flex min-w-0 max-w-[62%] items-center gap-3 sm:max-w-none">
        <button onClick={onMenuClick} className="rounded-full p-2 text-ink hover:bg-ink/5 dark:text-white dark:hover:bg-white/10 lg:hidden" aria-label={t('dash.topbar.openMenu')}>
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink dark:text-white">{school?.name ?? ''}</p>
          <p className="text-xs text-graphite">{t(roleLabelKey[visibleRole])} {t('dash.workspace')}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5">
        <LanguageSwitcher className="hidden sm:block" />
        {availableRoles.length >= 2 && (
          <div className="relative">
            <select
              value={visibleRole}
              onChange={(event) => switchRole(event.target.value as Role)}
              className="input h-9 w-auto min-w-28 appearance-none py-1 pl-3 pr-2 text-xs font-medium"
              aria-label={t('dash.topbar.switchRole')}
            >
              {availableRoles.map((role) => (
                <option key={role} value={role}>
                  {t(roleLabelKey[role])}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-full text-graphite hover:bg-ink/5 dark:hover:bg-white/10"
          aria-label={t('dash.topbar.toggleTheme')}
        >
          {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>
        <NotificationsDropdown />
        <div className="relative" ref={ref}>
          <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-ink/5 dark:hover:bg-white/10">
            <Avatar name={profile.full_name} color="#0071E3" size="sm" src={avatarUrl} />
            <ChevronDown className="hidden h-3.5 w-3.5 text-graphite sm:block" />
          </button>
          {menuOpen && (
            <div className="interaction-menu absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-2xl border border-ink/5 bg-white shadow-floaty animate-fade-up dark:border-white/10 dark:bg-[#161618]">
              <div className="border-b border-ink/5 px-4 py-3 dark:border-white/10">
                <p className="truncate text-sm font-medium text-ink dark:text-white">{profile.full_name}</p>
                <p className="truncate text-xs text-graphite">{profile.email}</p>
              </div>
              <div className="p-1.5">
                <div className="mb-1 border-b border-ink/5 px-2 pb-2 dark:border-white/10 sm:hidden">
                  <LanguageSwitcher className="[&_button]:min-h-11 [&_button]:w-full [&_button]:justify-start [&_button]:rounded-xl [&_button]:px-2" />
                </div>
                {canSetAvatar && (
                  <>
                    <input
                      ref={avatarInput}
                      type="file"
                      accept={IMAGE_ACCEPT}
                      className="hidden"
                      aria-label={t('dash.topbar.choosePicture')}
                      onChange={handleAvatarChosen}
                    />
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => avatarInput.current?.click()}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-ink/5 disabled:opacity-50 dark:text-white dark:hover:bg-white/10"
                    >
                      <Camera className="h-4 w-4" /> {avatarBusy ? t('dash.topbar.working') : profile.avatar_url ? t('dash.topbar.changePicture') : t('dash.topbar.addPicture')}
                    </button>
                    {profile.avatar_url && (
                      <button
                        type="button"
                        disabled={avatarBusy}
                        onClick={handleAvatarRemoved}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-ink/5 disabled:opacity-50 dark:text-white dark:hover:bg-white/10"
                      >
                        <Trash2 className="h-4 w-4" /> {t('dash.topbar.removePicture')}
                      </button>
                    )}
                  </>
                )}
                {visibleRole && (
                  <Link
                    to={visibleRole === 'admin' ? '/app/admin/settings' : visibleRole === 'teacher' ? '/app/teacher/profile' : '/app/parent/settings'}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-ink/5 dark:text-white dark:hover:bg-white/10"
                  >
                    <Settings className="h-4 w-4" /> {t('dash.profile.account')}
                  </Link>
                )}
                {visibleRole !== 'teacher' && (
                  <SignOutButton
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10"
                    confirm={false}
                    onSignOutStart={() => setMenuOpen(false)}
                  >
                    <LogOut className="h-4 w-4" /> {t('dash.topbar.signOut')}
                  </SignOutButton>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
