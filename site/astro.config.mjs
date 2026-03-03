import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  integrations: [
    starlight({
      title: 'Venture Crane',
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
      ],
    }),
  ],
})
