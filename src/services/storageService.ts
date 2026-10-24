// ---------------------------------------------------------------------------
// Storage reads and writes for the three file columns. File storage build.
//
//   schools.logo_path     bucket school-branding (public)   {school_id}/logo/{uuid}.{ext}
//   students.photo_path   bucket student-photos  (private)  {school_id}/{student_id}/{uuid}.{ext}
//   profiles.avatar_url   bucket profile-avatars (private)  {user_id}/{uuid}.{ext}
//
// Every column stores the object's path inside its bucket, never a URL — even
// avatar_url, whose name predates this decision. Private files are shown
// through signed URLs created at read time, valid for SIGNED_URL_SECONDS and
// never saved.
//
// REPLACEMENT ORDER. Upload the new object, point the column at it, then remove
// the old object. If the column update fails, the new object is removed instead,
// so a failure never leaves the row pointing at nothing. A failure removing the
// old object leaves an unreferenced file, which is harmless and is logged.
//
// Access is decided by the storage.objects policies in migration
// 20260915000004 and by the existing RLS on the three tables. The school and
// student ids in every path come from the caller's own context, never from
// user input.
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'
import { randomImageName, type PreparedImage } from '@/lib/imageUpload'
import type { ProfileRow, SchoolRow } from '@/types/auth'

export const BUCKETS = {
  schoolBranding: 'school-branding',
  studentPhotos: 'student-photos',
  profileAvatars: 'profile-avatars',
  paymentEvidence: 'payment-evidence',
} as const

export type PrivateBucket =
  | typeof BUCKETS.studentPhotos
  | typeof BUCKETS.profileAvatars
  | typeof BUCKETS.paymentEvidence

/** One hour. A signed URL works for whoever holds it until it expires. */
export const SIGNED_URL_SECONDS = 60 * 60

async function uploadObject(bucket: string, path: string, image: PreparedImage): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(path, image.blob, {
    contentType: image.contentType,
    upsert: false,
    cacheControl: '3600',
  })
  if (error) throw error
}

async function removeQuietly(bucket: string, path: string | null): Promise<void> {
  if (!path) return
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) console.warn(`Could not remove ${bucket}/${path}:`, error.message)
}

/** Public URL for a logo path. Needs no session; the bucket serves logos by exact path. */
export function schoolLogoUrl(logoPath: string | null): string | null {
  if (!logoPath) return null
  return supabase.storage.from(BUCKETS.schoolBranding).getPublicUrl(logoPath).data.publicUrl
}

/** A short-lived URL for a private object, or null if the caller may not read it. */
export async function createSignedImageUrl(bucket: PrivateBucket, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS)
  if (error || !data) return null
  return data.signedUrl
}

const PAYMENT_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024
const PAYMENT_EVIDENCE_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function uploadPaymentEvidence(schoolId: string, file: File): Promise<string> {
  const extension = PAYMENT_EVIDENCE_EXTENSIONS[file.type]
  if (!extension) throw new Error('Choose a PDF, PNG, JPEG, or WebP evidence file.')
  if (file.size > PAYMENT_EVIDENCE_MAX_BYTES) throw new Error('Payment evidence must be 5 MB or smaller.')

  const path = `${schoolId}/fee-payments/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(BUCKETS.paymentEvidence).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: '3600',
  })
  if (error) throw error
  return path
}

export async function removePaymentEvidence(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKETS.paymentEvidence).remove([path])
  if (error) throw error
}

export async function createSignedPaymentEvidenceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKETS.paymentEvidence).createSignedUrl(path, SIGNED_URL_SECONDS)
  if (error) throw error
  return data.signedUrl
}

/**
 * Short-lived URLs for many private objects in one request, keyed by path.
 * Paths the caller may not read are simply absent from the map.
 */
export async function createSignedImageUrls(bucket: PrivateBucket, paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  const unique = Array.from(new Set(paths))
  if (unique.length === 0) return urls
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, SIGNED_URL_SECONDS)
  if (error || !data) return urls
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl)
  }
  return urls
}

// ---------------------------------------------------------------------------
// Login page
// ---------------------------------------------------------------------------

export interface LoginBranding {
  name: string
  primaryColor: string
  logoUrl: string | null
}

/**
 * The branding of the one active school with this shortcode, for the login page
 * before sign-in. Calls school_login_branding, which returns name, colour and
 * logo path and nothing else. Null when no active school has the shortcode.
 */
export async function fetchLoginBranding(shortcode: string): Promise<LoginBranding | null> {
  const { data, error } = await supabase.rpc('school_login_branding', { p_shortcode: shortcode })
  if (error) throw error
  const row = ((data ?? []) as { name: string; primary_color: string; logo_path: string | null }[])[0]
  if (!row) return null
  return { name: row.name, primaryColor: row.primary_color, logoUrl: schoolLogoUrl(row.logo_path) }
}

// ---------------------------------------------------------------------------
// School logo — owner, director, administrator
// ---------------------------------------------------------------------------

async function setSchoolLogoPath(schoolId: string, logoPath: string | null): Promise<SchoolRow | null> {
  const { data, error } = await supabase
    .from('schools')
    .update({ logo_path: logoPath })
    .eq('id', schoolId)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return (data as SchoolRow | null) ?? null
}

/** Uploads a new logo and points schools.logo_path at it. Returns the stored row. */
export async function replaceSchoolLogo(school: SchoolRow, image: PreparedImage): Promise<SchoolRow> {
  const path = `${school.id}/logo/${randomImageName(image.contentType)}`
  await uploadObject(BUCKETS.schoolBranding, path, image)

  let updated: SchoolRow | null
  try {
    updated = await setSchoolLogoPath(school.id, path)
  } catch (error) {
    await removeQuietly(BUCKETS.schoolBranding, path)
    throw error
  }
  if (!updated) {
    await removeQuietly(BUCKETS.schoolBranding, path)
    throw new Error('Only the school owner, director or an administrator can change the logo.')
  }

  await removeQuietly(BUCKETS.schoolBranding, school.logo_path)
  return updated
}

/** Clears the logo and removes its object. Returns the stored row. */
export async function removeSchoolLogo(school: SchoolRow): Promise<SchoolRow> {
  const updated = await setSchoolLogoPath(school.id, null)
  if (!updated) throw new Error('Only the school owner, director or an administrator can change the logo.')
  await removeQuietly(BUCKETS.schoolBranding, school.logo_path)
  return updated
}

// ---------------------------------------------------------------------------
// Student photo — owner, director, administrator, principal
// ---------------------------------------------------------------------------

async function setStudentPhotoPath(schoolId: string, studentId: string, photoPath: string | null): Promise<boolean> {
  const { data, error } = await supabase
    .from('students')
    .update({ photo_path: photoPath })
    .eq('school_id', schoolId)
    .eq('id', studentId)
    .select('id')
  if (error) throw error
  // RLS filters rather than raises: zero rows means the update was refused.
  return (data ?? []).length === 1
}

/** Uploads a new photo and points students.photo_path at it. Returns the new path. */
export async function replaceStudentPhoto(
  schoolId: string,
  studentId: string,
  previousPath: string | null,
  image: PreparedImage,
): Promise<string> {
  const path = `${schoolId}/${studentId}/${randomImageName(image.contentType)}`
  await uploadObject(BUCKETS.studentPhotos, path, image)

  let saved: boolean
  try {
    saved = await setStudentPhotoPath(schoolId, studentId, path)
  } catch (error) {
    await removeQuietly(BUCKETS.studentPhotos, path)
    throw error
  }
  if (!saved) {
    await removeQuietly(BUCKETS.studentPhotos, path)
    throw new Error('Only school management can change a student photo.')
  }

  await removeQuietly(BUCKETS.studentPhotos, previousPath)
  return path
}

/** Clears a student's photo and removes its object. */
export async function removeStudentPhoto(schoolId: string, studentId: string, previousPath: string | null): Promise<void> {
  const saved = await setStudentPhotoPath(schoolId, studentId, null)
  if (!saved) throw new Error('Only school management can change a student photo.')
  await removeQuietly(BUCKETS.studentPhotos, previousPath)
}

/**
 * Removes a photo object whose row is already gone. Storage objects have no
 * foreign key to their row, so deleting a student must remove the file itself
 * (plan section 3, rule 4).
 */
export async function removeOrphanedStudentPhoto(photoPath: string | null): Promise<void> {
  await removeQuietly(BUCKETS.studentPhotos, photoPath)
}

// ---------------------------------------------------------------------------
// Own avatar — staff in the current school, or a platform admin
// ---------------------------------------------------------------------------

async function setAvatarPath(userId: string, avatarPath: string | null): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarPath })
    .eq('id', userId)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return (data as ProfileRow | null) ?? null
}

/** Uploads a new avatar for the signed-in user and points profiles.avatar_url at it. */
export async function replaceOwnAvatar(profile: ProfileRow, image: PreparedImage): Promise<ProfileRow> {
  const path = `${profile.id}/${randomImageName(image.contentType)}`
  await uploadObject(BUCKETS.profileAvatars, path, image)

  let updated: ProfileRow | null
  try {
    updated = await setAvatarPath(profile.id, path)
  } catch (error) {
    await removeQuietly(BUCKETS.profileAvatars, path)
    throw error
  }
  if (!updated) {
    await removeQuietly(BUCKETS.profileAvatars, path)
    throw new Error('Your profile picture could not be saved.')
  }

  await removeQuietly(BUCKETS.profileAvatars, profile.avatar_url)
  return updated
}

/** Clears the signed-in user's avatar and removes its object. */
export async function removeOwnAvatar(profile: ProfileRow): Promise<ProfileRow> {
  const updated = await setAvatarPath(profile.id, null)
  if (!updated) throw new Error('Your profile picture could not be removed.')
  await removeQuietly(BUCKETS.profileAvatars, profile.avatar_url)
  return updated
}
