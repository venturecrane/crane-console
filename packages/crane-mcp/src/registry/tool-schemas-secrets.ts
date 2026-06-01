/**
 * Secret-management tool schema declarations (presence check + capture).
 * No logic, no imports. Part of the ListTools response; see tool-schemas.ts.
 */

export const SECRETS_TOOL_SCHEMAS = [
  {
    name: 'crane_secret_check',
    description:
      'Verify Infisical secret presence WITHOUT returning values. Use this for "is this set?" queries instead of `infisical secrets` (which leaks values into the transcript). Returns key names only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Infisical path, e.g. /vc/api',
        },
        env: {
          type: 'string',
          description: 'Infisical environment slug, e.g. prod',
        },
        names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific keys to check; omit to list all keys at the path',
        },
        includeImports: {
          type: 'boolean',
          description:
            'Include imported secrets from linked paths. Default false; imports can surface secrets from paths the caller did not intend.',
        },
      },
      required: ['path', 'env'],
    },
  },
  {
    name: 'crane_secret_set',
    description:
      'Store an Infisical secret WITHOUT the value entering the transcript. Reads the value server-side from the macOS clipboard (source=clipboard, default) or a local file (source=file), writes it to Infisical, and returns only a masked confirmation. Use this to capture keys/tokens — `infisical secrets set` is blocked from raw Bash and pasting a value into chat leaks it. Pair with crane_secret_check to verify.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Infisical path, e.g. /vc' },
        env: { type: 'string', description: 'Infisical environment slug, e.g. prod' },
        name: { type: 'string', description: 'Secret key name, e.g. ELEVENLABS_API_KEY' },
        source: {
          type: 'string',
          enum: ['clipboard', 'file'],
          description:
            'Where to read the value server-side. Default clipboard (pbpaste). The value never enters the transcript.',
        },
        file: {
          type: 'string',
          description: 'Absolute path to a file holding the value (required when source=file).',
        },
        deleteSource: {
          type: 'boolean',
          description:
            'When source=file, delete the file after a successful write (secure by default). Default true.',
        },
      },
      required: ['path', 'env', 'name'],
    },
  },
] as const
