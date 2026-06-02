/// <reference path="../.astro/types.d.ts" />
/// <reference types="@astrojs/cloudflare" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
  CLERK_SECRET_KEY: string
  PUBLIC_CLERK_PUBLISHABLE_KEY: string
  CRANE_COMMAND_ALLOWED_EMAILS: string
}>

declare namespace App {
  interface Locals extends Runtime {}
}
