import { supabase } from '@/lib/supabase'
import type { MembershipRole } from '@/types/auth'
import { edgeFunctionErrorMessage } from '@/utils/edgeFunctionError'

// ---------------------------------------------------------------------------
// Invitations, as the interface sees them.
//
// Sending one is NOT done from here: a browser cannot email anybody, and the
// raw token must never exist in a page. sendInvitation calls the Edge Function,
// which writes the row as the caller and lets Supabase Auth deliver the link.
// Reading and revoking stay here, because both are ordinary table operations the
// invitation policies already govern (owner, director, administrator only).
// ---------------------------------------------------------------------------

export interface InvitationRow {
  id: string
  school_id: string
  email: string
  role: MembershipRole
  teacher_id: string | null
  guardian_id: string | null
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  invited_by: string
  revoked_at: string | null
  created_at: string
  updated_at: string
}

/** What inviting one person did. Every answer is shown to the administrator. */
export type InviteStatus = 'sent' | 'skipped' | 'failed'

export interface InviteOutcome {
  status: InviteStatus
  /** Present when the person was skipped or the send failed. */
  reason?: 'no_email' | 'already_active' | 'already_invited' | 'access_revoked' | 'not_found' | 'not_allowed' | 'email' | 'database'
  message?: string
  email?: string
  name?: string
}

/**
 * Invites one teacher or guardian.
 *
 * The work happens in the send-invitation Edge Function: it writes the
 * invitation with the CALLER's own session, so the database decides who may
 * invite, then has Supabase Auth email a single-use activation link. Nothing
 * secret comes back here — no password, no token, no link.
 *
 * One person per call by design, so a bulk invitation is a paced loop in which
 * one refusal never stops the rest.
 */
export async function sendInvitation(input: {
  schoolId: string
  role: 'teacher' | 'guardian'
  personId: string
}): Promise<InviteOutcome> {
  const { data, error } = await supabase.functions.invoke('send-invitation', {
    body: { school_id: input.schoolId, role: input.role, person_id: input.personId },
  })

  if (error) {
    // The function answers non-2xx for refusals too, and its body carries the
    // real sentence; supabase-js hides that behind a generic wrapper.
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as InviteOutcome
        if (body?.status) return body
        if (typeof body?.message === 'string') return { status: 'failed', reason: 'database', message: body.message }
      } catch {
        // fall through to the generic message below
      }
    }
    return {
      status: 'failed',
      reason: 'database',
      message: edgeFunctionErrorMessage(error, 'send-invitation'),
    }
  }

  return data as InviteOutcome
}

const invitationColumns =
  'id,school_id,email,role,teacher_id,guardian_id,expires_at,accepted_at,accepted_by,invited_by,revoked_at,created_at,updated_at'

/** The seven answers accept_invitation can give. */
export type InvitationAcceptanceOutcome =
  | 'accepted'
  | 'already_accepted'
  | 'expired'
  | 'revoked'
  | 'not_found'
  | 'email_mismatch'
  | 'role_already_held'

/**
 * Claims the invitation belonging to the signed-in account's own email.
 *
 * Used by the activation screen: Supabase's link proves the mailbox, and this
 * turns the pending invitation into a real membership. The caller is taken from
 * the session inside the database function, never passed in, so nobody can claim
 * somebody else's invitation. 'not_found' is an ordinary answer — an
 * administrator activating already has their memberships.
 */
export async function claimPendingInvitation(): Promise<InvitationAcceptanceOutcome> {
  const { data, error } = await supabase.rpc('accept_pending_invitation')
  if (error) throw error
  return data as InvitationAcceptanceOutcome
}

export async function listLiveInvitations(schoolId: string): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select(invitationColumns)
    .eq('school_id', schoolId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as InvitationRow[]
}

export async function revokeInvitation(invitationId: string, schoolId: string): Promise<void> {
  const { error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('school_id', schoolId)
    .is('accepted_at', null)
    .is('revoked_at', null)

  if (error) throw error
}
