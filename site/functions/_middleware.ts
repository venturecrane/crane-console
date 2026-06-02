import { createClerkClient } from '@clerk/backend'

interface Env {
  CRANE_COMMAND_CLERK_PUBLISHABLE_KEY: string
  CRANE_COMMAND_CLERK_SECRET_KEY: string
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
    const response = await next()
    requestState.headers.forEach((value, key) => response.headers.append(key, value))
    return response
  }

  return Response.redirect(
    buildSignInUrl(env.CRANE_COMMAND_CLERK_PUBLISHABLE_KEY, request.url),
    302
  )
}
