import { errorMessage } from './errorMessage.ts'

interface EdgeFunctionErrorLike {
  name?: unknown
  message?: unknown
  context?: unknown
}

function isEdgeFunctionErrorLike(value: unknown): value is EdgeFunctionErrorLike {
  return typeof value === 'object' && value !== null
}

export function edgeFunctionErrorMessage(error: unknown, functionName: string): string {
  const details = isEdgeFunctionErrorLike(error) ? error : {}
  const name = typeof details.name === 'string' ? details.name : ''
  const message = typeof details.message === 'string' ? details.message : ''
  const status = details.context instanceof Response ? details.context.status : null

  if (name === 'FunctionsFetchError' || message === 'Failed to send a request to the Edge Function') {
    return `Could not reach the ${functionName} Edge Function. It may not be deployed to the configured Supabase project, or the request may be blocked by network or CORS configuration.`
  }

  if (name === 'FunctionsRelayError') {
    return `Supabase could not relay the ${functionName} Edge Function request${status === null ? '' : ` (HTTP ${status})`}. Check its availability and function logs.`
  }

  if (name === 'FunctionsHttpError' && status !== null) {
    if (status === 401) return `The ${functionName} Edge Function requires a valid signed-in session.`
    if (status === 403) return `You are not authorized to use the ${functionName} Edge Function.`
    if (status === 404) {
      return `The ${functionName} Edge Function or a required server resource was not found (HTTP 404). Verify its deployment and database prerequisites.`
    }
    if (status >= 500) {
      return `The ${functionName} Edge Function returned a server error (HTTP ${status}). Check function logs before retrying.`
    }
    return `The ${functionName} Edge Function rejected the request (HTTP ${status}).`
  }

  return errorMessage(error, `The ${functionName} Edge Function request failed.`)
}
