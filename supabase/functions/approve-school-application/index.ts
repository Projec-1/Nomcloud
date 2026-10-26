import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ApprovalRequest {
  application_id: string
  /** Required to approve; omitted when action is 'resend'. */
  shortcode?: string
  /** 'resend' re-sends the activation email for an already-approved school. */
  action?: 'approve' | 'resend'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ---------------------------------------------------------------------------
// ACTIVATION, NOT A PASSWORD.
//
// This function used to generate a temporary password, set it on the new
// account and return it, leaving the platform administrator to pass it on. It
// no longer generates, stores, returns, logs or emails a password of any kind.
//
// Instead the account is created by Supabase Auth's own invite, which emails a
// single-use link (expiring per the project's Email OTP setting) to the address
// on the application. Following it opens a session in which the administrator
// chooses their own password on /activate. Supabase owns the link, its expiry
// and its single use; nothing parallel is built here.
// ---------------------------------------------------------------------------

/**
 * Where the activation link should land. Taken from the origin the approval
 * screen is served from, never hard-coded, and only when it is https. Supabase
 * additionally refuses any origin outside its own redirect allow-list, and falls
 * back to the project's Site URL, so a bad value cannot redirect a person
 * somewhere unexpected.
 */
const activationRedirect = (request: Request): string | undefined => {
  // CONFIGURED, NOT OBSERVED — see the long explanation in send-invitation.
  // Taking this from the caller's Origin meant the link pointed wherever the
  // approver happened to be; anything that is not the one allow-listed host
  // makes Supabase fall back to the Site URL, landing the new administrator on
  // the marketing homepage with no activation screen.
  const configured = Deno.env.get('APP_ORIGIN')?.trim()
  if (configured) {
    try {
      return `${new URL(configured).origin}/activate`
    } catch {
      console.error(`APP_ORIGIN is not a valid URL: ${configured}`)
    }
  }
  const origin = request.headers.get('Origin') ?? ''
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' ? `${url.origin}/activate` : undefined
  } catch {
    return undefined
  }
}

/**
 * Sends the activation email.
 *
 * An account that has not been activated yet can simply be invited again, which
 * issues a fresh link and invalidates the old one. Once it HAS been activated
 * Supabase refuses a second invite (422), and the right email is then a password
 * recovery link, which reaches the same screen.
 *
 * "SENT" MEANS THE MAIL SERVER ACCEPTED THE MESSAGE, AND NOTHING ELSE. The
 * recovery fallback is therefore only tried for an address that ALREADY has an
 * account. resetPasswordForEmail is deliberately non-enumerable: for an address
 * Supabase does not know, it answers 200 and sends nothing at all. Reading that
 * 200 as delivery is how the sibling invitation function once reported three
 * invitations as sent to people who were never emailed.
 */
async function sendActivationEmail(
  adminClient: SupabaseClient,
  email: string,
  redirectTo: string | undefined,
): Promise<{ sent: boolean; kind: 'invite' | 'recovery'; error?: string }> {
  const invite = await adminClient.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined)
  if (!invite.error) return { sent: true, kind: 'invite' }

  let hasAccount: boolean
  try {
    hasAccount = (await findAuthUserByEmail(adminClient, email)) !== null
  } catch (lookupError) {
    const message = lookupError instanceof Error ? lookupError.message : String(lookupError)
    return { sent: false, kind: 'invite', error: `${invite.error.message} (the account lookup also failed: ${message})` }
  }

  // No account: an invite that failed is simply an email that was not sent.
  if (!hasAccount) return { sent: false, kind: 'invite', error: invite.error.message }

  const recovery = await adminClient.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
  if (!recovery.error) return { sent: true, kind: 'recovery' }

  return { sent: false, kind: 'recovery', error: recovery.error.message }
}

/** The mail server's own words, flattened so they fit in one readable line. */
const tidy = (reason: string | undefined) => (reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 220)

// ---------------------------------------------------------------------------
// Existing-account handling.
//
// WHY THIS EXISTS. Approval always created a brand-new auth user. If an account
// with the applicant's email already existed, Auth refused with a duplicate-email
// error and the whole approval failed with an unexplained 502. That happened on
// 2026-09-15 with an account left over from the removed public sign-up page.
//
// WHAT COUNTS AS GENUINELY ORPHANED, AND IS THEREFORE SAFE TO REUSE. An auth
// user with the application's email that has:
//   - no profiles row,
//   - no memberships,
//   - no platform_admins row.
// Such an account belongs to no school and grants nothing, so giving it to the
// applicant whose email it is takes nothing from anyone. Anything else — an
// account already attached to a school or to the platform — is refused with 409,
// never reused, because reusing it would move a real person into a new school.
//
// The reused account's password is not changed. Approval sends an activation
// invitation or recovery link, and the account remains unusable until its owner
// follows that link and chooses a password.
// ---------------------------------------------------------------------------

/** Finds an auth user by email through the Admin API. Pages through the list. */
async function findAuthUserByEmail(adminClient: SupabaseClient, email: string): Promise<User | null> {
  const target = email.trim().toLowerCase()
  const perPage = 1000
  // A hard cap keeps a pathological user count from looping forever.
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((user) => user.email?.toLowerCase() === target)
    if (match) return match
    if (data.users.length < perPage) return null
  }
  return null
}

/** True when the account is attached to nothing: no profile, membership or platform-admin row. */
async function isOrphanedAccount(adminClient: SupabaseClient, userId: string): Promise<boolean> {
  const [profile, membership, platformAdmin] = await Promise.all([
    adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId),
    adminClient.from('memberships').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    adminClient.from('platform_admins').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  for (const result of [profile, membership, platformAdmin]) {
    if (result.error) throw result.error
  }
  return (profile.count ?? 0) === 0 && (membership.count ?? 0) === 0 && (platformAdmin.count ?? 0) === 0
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return json({ error: 'Authentication is required' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Server authentication configuration is incomplete' }, 500)
  }

  const token = authorization.slice('Bearer '.length)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userError } = await callerClient.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Authentication is required' }, 401)

  const { data: platformAdmin, error: platformAdminError } = await adminClient
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .is('revoked_at', null)
    .maybeSingle()

  if (platformAdminError) return json({ error: platformAdminError.message }, 500)
  if (!platformAdmin) return json({ error: 'Platform-admin authority is required' }, 403)

  const { data: reviewFlagEnabled, error: reviewFlagError } = await adminClient.rpc(
    'is_platform_feature_enabled',
    { p_flag_key: 'school_application_review' },
  )
  if (reviewFlagError) return json({ error: 'Could not verify school-application review availability' }, 500)
  if (reviewFlagEnabled !== true) {
    return json({ error: 'School-application review is disabled by a platform feature flag.' }, 503)
  }

  let input: ApprovalRequest
  try {
    input = await request.json() as ApprovalRequest
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400)
  }

  if (
    typeof input.application_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.application_id)
  ) {
    return json({ error: 'Application id must be a UUID' }, 400)
  }
  const isResend = input.action === 'resend'
  if (!isResend && (typeof input.shortcode !== 'string' || !/^[a-z0-9]([a-z0-9-]{1,61})[a-z0-9]$/.test(input.shortcode))) {
    return json({ error: 'Shortcode must be DNS-safe, lowercase, and 3-63 characters' }, 400)
  }

  const { data: application, error: applicationError } = await adminClient
    .from('school_applications')
    .select('id, email, status, school_name, administrator_name')
    .eq('id', input.application_id)
    .maybeSingle()

  if (applicationError) return json({ error: applicationError.message }, 500)
  if (!application) return json({ error: 'Application not found' }, 404)

  const redirectTo = activationRedirect(request)

  // ---- resend: an approved/onboarding school whose administrator needs a new link
  if (isResend) {
    if (application.status !== 'approved' && application.status !== 'onboarding') {
      return json({ error: 'This application has not been approved yet, so there is nothing to activate.' }, 409)
    }
    const resent = await sendActivationEmail(adminClient, application.email, redirectTo)
    if (!resent.sent) {
      return json({
        error: `No activation email was sent to ${application.email}. Nothing has reached them — use “Resend activation email” again once email is working.${tidy(resent.error) ? ` Mail server: ${tidy(resent.error)}` : ''}`,
      }, 502)
    }
    return json({ activation_email_sent: true, email: application.email, email_kind: resent.kind })
  }

  if (application.status !== 'pending' && application.status !== 'awaiting_information') {
    return json({ error: 'Application is no longer awaiting review' }, 409)
  }

  let authUserId: string
  let reusedExistingAccount = false

  // Creates the account AND sends the activation email in one step. No password
  // is set, so the account cannot be signed into until its owner chooses one.
  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.inviteUserByEmail(
    application.email,
    {
      ...(redirectTo ? { redirectTo } : {}),
      // Read by the Invite email template as {{ .Data.school_name }} and
      // {{ .Data.role_label }}; see send-invitation for the same contract.
      data: {
        school_name: application.school_name ?? '',
        role_label: 'Administrator',
        full_name: application.administrator_name ?? '',
      },
    },
  )

  if (!createUserError && createdUser.user) {
    authUserId = createdUser.user.id
  } else {
    // Creation failed. The common cause is an account that already has this
    // email; decide whether it is safe to reuse before reporting anything.
    let existing: User | null
    try {
      existing = await findAuthUserByEmail(adminClient, application.email)
    } catch (lookupError) {
      const message = lookupError instanceof Error ? lookupError.message : String(lookupError)
      return json({ error: `Auth user creation failed (${createUserError?.message ?? 'unknown'}); lookup of an existing account also failed: ${message}` }, 502)
    }

    if (!existing) {
      const duplicate = /duplicate|already|exists|users_email/i.test(createUserError?.message ?? '')
      if (duplicate) {
        // Auth reports the email as taken but cannot return the account. That
        // happens only for a row written directly into auth.users outside the
        // Auth service, which the Admin API cannot see or repair.
        return json({
          error: `An account with ${application.email} already exists but the Auth service cannot load it, so it cannot be reused. It was created outside Supabase Auth and must be removed by an operator before this application can be approved.`,
        }, 409)
      }
      // The invite both creates the account and sends the link, so a mail
      // server refusal lands here. Nothing has been approved: no school, no
      // profile, no membership, and the application is still pending. Say so,
      // rather than leaving the operator guessing what was half-built.
      return json({
        error: `The administrator's account could not be created, so nothing was approved: there is no school, no profile and no membership, and this application is still pending. Try again once the problem below is fixed. Reason: ${tidy(createUserError?.message) || 'unknown'}`,
      }, 502)
    }

    let orphaned: boolean
    try {
      orphaned = await isOrphanedAccount(adminClient, existing.id)
    } catch (checkError) {
      return json({ error: checkError instanceof Error ? checkError.message : String(checkError) }, 500)
    }

    if (!orphaned) {
      return json({
        error: `An account with ${application.email} already exists and is linked to a school or to the platform. It cannot be reused for a new school; use a different email for this application.`,
      }, 409)
    }

    // Reusing an orphaned account: no password is set on it either. The
    // activation email below is what lets its owner in.
    authUserId = existing.id
    reusedExistingAccount = true
  }

  const { data: approval, error: approvalError } = await callerClient.rpc('approve_school_application', {
    p_application_id: input.application_id,
    p_auth_user_id: authUserId,
    p_shortcode: input.shortcode,
  })

  if (approvalError) {
    // Only an account this request created is removed. A reused account existed
    // before this request and is left in place, still orphaned, so a corrected
    // retry can reuse it again.
    if (!reusedExistingAccount) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(authUserId)
      if (cleanupError) {
        return json({ error: approvalError.message, cleanup_error: cleanupError.message }, 500)
      }
    }
    return json({ error: approvalError.message }, 400)
  }

  // The school exists now, so the activation email is sent last: a failure here
  // is reported without undoing the approval, and the screen offers a resend.
  const sent = reusedExistingAccount
    ? await sendActivationEmail(adminClient, application.email, redirectTo)
    : { sent: true, kind: 'invite' as const }

  return json({
    ...approval,
    reused_existing_account: reusedExistingAccount,
    email: application.email,
    activation_email_sent: sent.sent,
    email_kind: sent.kind,
    ...(sent.sent ? {} : { activation_email_error: tidy(sent.error) }),
  })
})
