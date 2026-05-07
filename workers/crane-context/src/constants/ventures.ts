import venturesJson from '../../../../config/ventures.json'

/**
 * Full venture metadata - single source of truth
 * Loaded from config/ventures.json
 *
 * To add a new venture:
 * 1. Edit config/ventures.json
 * 2. Deploy crane-context: cd workers/crane-context && npm run deploy
 * 3. (Optional) Run /new-venture for full setup
 *
 * See docs/process/add-new-venture.md for details.
 */
export const VENTURE_CONFIG = Object.fromEntries(
  venturesJson.ventures.map((v) => [
    v.code,
    {
      name: v.name,
      org: v.org,
      repos: v.repos as readonly string[],
      capabilities: v.capabilities as readonly string[],
      portfolio: {
        status: v.portfolio.status,
        bvmStage: (v.portfolio.bvmStage as string | null) ?? null,
        tagline: (v.portfolio.tagline as string | null) ?? null,
        description: (v.portfolio.description as string | null) ?? null,
        techStack: v.portfolio.techStack as readonly string[],
      },
    },
  ])
) as Record<
  string,
  {
    name: string
    org: string
    repos: readonly string[]
    capabilities: readonly string[]
    portfolio: {
      status: string
      bvmStage: string | null
      tagline: string | null
      description: string | null
      techStack: readonly string[]
    }
  }
>

export const VENTURES = venturesJson.ventures.map((v) => v.code)
export type Venture = (typeof venturesJson.ventures)[number]['code']
