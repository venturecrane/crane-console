import { defineMiddleware, sequence } from 'astro:middleware'
import type { APIContext, MiddlewareNext } from 'astro'
import { clerkMiddleware } from '@clerk/astro/server'
import { env } from 'cloudflare:workers'

/**
 * Astro middleware for crane-command.
 *
 * Composed pipeline:
 *   1. clerkMiddleware  - populates locals.auth() / locals.currentUser()
 *                         from the request's Clerk session cookie. Does
 *                         NOT enforce auth on any route.
 *   2. allowlistGate    - lets /auth/* through; for everything else,
 *                         requires a Clerk session AND a primary email
 *                         in CRANE_COMMAND_ALLOWED_EMAILS.
 *
 * Mirrors enforceAdminAuth in venturecrane/ss-console:src/middleware.ts
 * but checks email allowlist instead of a D1 users row, since
 * crane-command is single-user internal tooling with no database.
 */

const PUBLIC_PREFIXES = ['/auth/']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p))
}

function readAllowlist(): Set<string> {
  const raw = (env as { CRANE_COMMAND_ALLOWED_EMAILS?: string }).CRANE_COMMAND_ALLOWED_EMAILS ?? ''
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  )
}

function deniedResponse(): Response {
  const body = `<!doctype html><meta charset="utf-8"><title>Access denied</title><style>body{font-family:system-ui,sans-serif;background:#0b0b0b;color:#eaeaea;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.5rem;margin:0 0 1rem}p{margin:0 0 1.5rem;color:#a8a8a8}a{color:#7c5cff}</style><main><h1>Access denied</h1><p>This account is not authorized for crane-command.</p><a href="/auth/sign-out">Sign out</a></main>`
  return new Response(body, {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

const allowlistGate = defineMiddleware(async (context: APIContext, next: MiddlewareNext) => {
  const { pathname } = context.url

  if (isPublicPath(pathname)) {
    return next()
  }

  const auth = context.locals.auth()
  if (!auth.userId) {
    const target = `/auth/sign-in?redirect_url=${encodeURIComponent(pathname + context.url.search)}`
    return context.redirect(target)
  }

  const allowed = readAllowlist()
  if (allowed.size === 0) {
    throw new Error('CRANE_COMMAND_ALLOWED_EMAILS is empty')
  }

  const user = await context.locals.currentUser()
  const primary = user?.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress
  if (!primary || !allowed.has(primary.toLowerCase())) {
    return deniedResponse()
  }

  return next()
})

export const onRequest = sequence(clerkMiddleware(), allowlistGate)
