import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  integrations: [
    starlight({
      title: 'Venture Crane',
      components: {
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      sidebar: [
        {
          label: 'The Business',
          items: [
            { label: 'Company', autogenerate: { directory: 'company' } },
            { label: 'Operations', autogenerate: { directory: 'operations' } },
          ],
        },
        {
          label: 'How We Work',
          items: [
            { label: 'Processes', autogenerate: { directory: 'process' } },
            { label: 'Agent Directives', autogenerate: { directory: 'instructions' } },
            { label: 'Runbooks', autogenerate: { directory: 'runbooks' } },
            { label: 'Standards', autogenerate: { directory: 'standards' } },
          ],
        },
        {
          label: 'Architecture',
          items: [
            { label: 'Design System', autogenerate: { directory: 'design-system' } },
            { label: 'Decisions', autogenerate: { directory: 'adr' } },
            { label: 'Infrastructure', autogenerate: { directory: 'infra' } },
          ],
        },
        {
          label: 'Ventures',
          items: [
            { label: 'Venture Crane', autogenerate: { directory: 'ventures/vc' } },
            { label: 'Durgan Field Guide', autogenerate: { directory: 'ventures/dfg' } },
            { label: 'Silicon Crane', autogenerate: { directory: 'ventures/sc' } },
            { label: 'Kid Expenses', autogenerate: { directory: 'ventures/ke' } },
            { label: 'Draft Crane', autogenerate: { directory: 'ventures/dc' } },
          ],
        },
      ],
    }),
  ],
})
