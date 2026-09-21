import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import starlight from '@astrojs/starlight'
import clerk from '@clerk/astro'

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    clerk(),
    starlight({
      title: 'Venture Crane',
      prerender: false,
      components: {
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      sidebar: [
        {
          label: 'The Business',
          items: [
            { label: 'Company', items: [{ autogenerate: { directory: 'company' } }] },
            { label: 'Operations', items: [{ autogenerate: { directory: 'operations' } }] },
          ],
        },
        {
          label: 'How We Work',
          items: [
            { label: 'Processes', items: [{ autogenerate: { directory: 'process' } }] },
            { label: 'Agent Directives', items: [{ autogenerate: { directory: 'instructions' } }] },
            { label: 'Runbooks', items: [{ autogenerate: { directory: 'runbooks' } }] },
            { label: 'Standards', items: [{ autogenerate: { directory: 'standards' } }] },
          ],
        },
        {
          label: 'Architecture',
          items: [
            { label: 'Design System', items: [{ autogenerate: { directory: 'design-system' } }] },
            { label: 'Decisions', items: [{ autogenerate: { directory: 'adr' } }] },
            { label: 'Infrastructure', items: [{ autogenerate: { directory: 'infra' } }] },
          ],
        },
        {
          label: 'Ventures',
          items: [
            // Manual entry - ventures/index.md isn't picked up by per-venture autogenerate
            { label: 'Portfolio Overview', slug: 'ventures' },
            {
              label: 'Venture Crane',
              items: [
                { slug: 'ventures/vc/product-overview' },
                { slug: 'ventures/vc/design-spec' },
                { slug: 'ventures/vc/metrics' },
                { slug: 'ventures/vc/roadmap' },
                {
                  label: 'venturecrane.com',
                  items: [
                    { slug: 'ventures/vc/website' },
                    { slug: 'ventures/vc/design-brief' },
                    { slug: 'ventures/vc/design-charter' },
                  ],
                },
              ],
            },
            { label: 'SMD Services', items: [{ autogenerate: { directory: 'ventures/ss' } }] },
            { label: 'Draft Crane', items: [{ autogenerate: { directory: 'ventures/dc' } }] },
            { label: 'Kid Expenses', items: [{ autogenerate: { directory: 'ventures/ke' } }] },
            { label: 'Silicon Crane', items: [{ autogenerate: { directory: 'ventures/sc' } }] },
            {
              label: 'Durgan Field Guide',
              items: [{ autogenerate: { directory: 'ventures/dfg' } }],
            },
          ],
        },
      ],
    }),
  ],
})
