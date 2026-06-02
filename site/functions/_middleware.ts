import { createClerkClient } from '@clerk/backend'

interface Env {
  CRANE_COMMAND_CLERK_PUBLISHABLE_KEY: string
  CRANE_COMMAND_CLERK_SECRET_KEY: string
  CRANE_COMMAND_ALLOWED_EMAILS: string
}

const SITE_ORIGIN = 'https://crane-command.pages.dev'

function buildSignInUrl(publishableKey: string, originalUrl: string): string {
  const encoded = publishableKey.split('_')[2]
  if (!encoded) {
    throw new Error('Clerk: malformed publishable key')
  }
  const fapi = atob(encoded).replace(/\$$/, '')
  const accountsHost = fapi.startsWith('clerk.')
    ? fapi.replace(/^clerk\./, 'accounts.')
    : fapi.replace('.clerk.accounts.dev', '.accounts.dev')
  const target = new URL(`https://${accountsHost}/sign-in`)
  target.searchParams.set('redirect_url', originalUrl)
  return target.toString()
}

function deniedResponse(publishableKey: string): Response {
  const encoded = publishableKey.split('_')[2]
  const fapi = encoded ? atob(encoded).replace(/\$$/, '') : ''
  const accountsHost = fapi.startsWith('clerk.')
    ? fapi.replace(/^clerk\./, 'accounts.')
    : fapi.replace('.clerk.accounts.dev', '.accounts.dev')
  const signOutUrl = accountsHost ? `https://${accountsHost}/sign-out` : '#'
  const body = `<!doctype html><meta charset="utf-8"><title>Access denied</title><style>body{font-family:system-ui,sans-serif;background:#0b0b0b;color:#eaeaea;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.5rem;margin:0 0 1rem}p{margin:0 0 1.5rem;color:#a8a8a8}a{color:#7c5cff}</style><main><h1>Access denied</h1><p>This account is not authorized for crane-command.</p><a href="${signOutUrl}">Sign out</a></main>`
  return new Response(body, {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/__clerk')) {
    return next()
  }

  const clerk = createClerkClient({
    secretKey: env.CRANE_COMMAND_CLERK_SECRET_KEY,
    publishableKey: env.CRANE_COMMAND_CLERK_PUBLISHABLE_KEY,
  })

  const requestState = await clerk.authenticateRequest(request, {
    authorizedParties: [SITE_ORIGIN],
  })

  const locationHeader = requestState.headers.get('location')
  if (locationHeader) {
    const response = new Response(null, {
      status: 307,
      headers: { Location: locationHeader },
    })
    requestState.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'location') response.headers.append(key, value)
    })
    return response
  }

  if (requestState.status === 'handshake') {
    throw new Error('Clerk: unexpected handshake without redirect')
  }

  if (requestState.isAuthenticated) {
    const auth = requestState.toAuth()
    const userId = auth?.userId
    if (!userId) {
      return Response.redirect(
        buildSignInUrl(env.CRANE_COMMAND_CLERK_PUBLISHABLE_KEY, request.url),
        302
      )
    }

    const allowed = new Set(
      env.CRANE_COMMAND_ALLOWED_EMAILS.split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    )
    if (allowed.size === 0) {
      throw new Error('CRANE_COMMAND_ALLOWED_EMAILS is empty')
    }

    const user = await clerk.users.getUser(userId)
    const primary = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    )?.emailAddress
    if (!primary || !allowed.has(primary.toLowerCase())) {
      return deniedResponse(env.CRANE_COMMAND_CLERK_PUBLISHABLE_KEY)
    }

    const response = await next()
    requestState.headers.forEach((value, key) => response.headers.append(key, value))
    return response
  }

  return Response.redirect(
    buildSignInUrl(env.CRANE_COMMAND_CLERK_PUBLISHABLE_KEY, request.url),
    302
  )
}
