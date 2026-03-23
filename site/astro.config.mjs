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
          label: 'Company',
          autogenerate: { directory: 'company' },
        },
        {
          label: 'Operations',
          autogenerate: { directory: 'operations' },
        },
        {
          label: 'Venture Crane',
          autogenerate: { directory: 'ventures/vc' },
        },
        {
          label: 'Durgan Field Guide',
          autogenerate: { directory: 'ventures/dfg' },
        },
        {
          label: 'Silicon Crane',
          autogenerate: { directory: 'ventures/sc' },
        },
        {
          label: 'Kid Expenses',
          autogenerate: { directory: 'ventures/ke' },
        },
        {
          label: 'Draft Crane',
          autogenerate: { directory: 'ventures/dc' },
        },
        {
          label: 'Infrastructure',
          autogenerate: { directory: 'infra' },
        },
      ],
    }),
  ],
})
