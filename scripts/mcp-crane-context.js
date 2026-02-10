#!/usr/bin/env node
/**
 * MCP Adapter for Crane Context
 * Bridges Claude Desktop (stdio) to Crane Context Worker (HTTP)
 *
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "crane-context": {
 *       "command": "node",
 *       "args": ["/path/to/mcp-crane-context.js"],
 *       "env": {
 *         "CRANE_ADMIN_KEY": "your-key"
 *       }
 *     }
 *   }
 * }
 */

const readline = require('readline')
const https = require('https')

const CONTEXT_API_URL = 'https://crane-context.automation-ab6.workers.dev'
const ADMIN_KEY = process.env.CRANE_ADMIN_KEY

if (!ADMIN_KEY) {
  console.error(
    JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: 'CRANE_ADMIN_KEY not set' },
    })
  )
  process.exit(1)
}

// Tool definitions exposed to Claude Desktop
const TOOLS = [
  {
    name: 'crane_sod',
    description:
      'Start of Day - Resume or create a Crane session. Returns session context and documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        venture: { type: 'string', enum: ['vc', 'sc', 'dfg'], description: 'Venture code' },
        repo: { type: 'string', description: 'Repository (owner/repo)' },
        agent: { type: 'string', description: 'Agent identifier' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'crane_get_doc',
    description: 'Get a documentation document from Crane Context.',
    inputSchema: {
      type: 'object',
      properties: {
        doc_name: { type: 'string', description: 'Document name' },
        scope: { type: 'string', description: 'Scope (global, vc, sc, dfg)' },
      },
      required: ['doc_name'],
    },
  },
  {
    name: 'crane_list_docs',
    description: 'List all available documentation in Crane Context.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Filter by scope (global, vc, sc, dfg)' },
      },
    },
  },
  {
    name: 'crane_upsert_doc',
    description: 'Create or update a document in Crane Context.',
    inputSchema: {
      type: 'object',
      properties: {
        doc_name: { type: 'string', description: 'Document name' },
        scope: {
          type: 'string',
          enum: ['global', 'vc', 'sc', 'dfg', 'ke'],
          description: 'Document scope',
        },
        content: { type: 'string', description: 'Document content (markdown)' },
        title: { type: 'string', description: 'Document title' },
      },
      required: ['doc_name', 'scope', 'content'],
    },
  },
]

// HTTP request helper
function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CONTEXT_API_URL)
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': ADMIN_KEY,
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })

    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

// Tool execution
async function executeTool(name, args) {
  switch (name) {
    case 'crane_sod': {
      const res = await httpRequest('POST', '/sod', {
        schema_version: '1.0',
        agent: args.agent || 'claude-desktop',
        venture: args.venture || 'vc',
        repo: args.repo || 'venturecrane/crane-console',
        include_docs: true,
      })
      return res.data
    }

    case 'crane_get_doc': {
      const scope = args.scope || 'global'
      const res = await httpRequest('GET', `/docs/${scope}/${args.doc_name}`)
      return res.data
    }

    case 'crane_list_docs': {
      const res = await httpRequest('GET', '/docs/list')
      if (args.scope && res.data.docs) {
        res.data.docs = res.data.docs.filter((d) => d.scope === args.scope)
      }
      return res.data
    }

    case 'crane_upsert_doc': {
      const res = await httpRequest('PUT', `/docs/${args.scope}/${args.doc_name}`, {
        content: args.content,
        title: args.title || args.doc_name,
      })
      return res.data
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// MCP message handler
async function handleMessage(msg) {
  const { jsonrpc, id, method, params } = msg

  if (jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid request' } }
  }

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'crane-context', version: '1.0.0' },
        },
      }

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      }

    case 'tools/call':
      try {
        const result = await executeTool(params.name, params.arguments || {})
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        }
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: error.message },
        }
      }

    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } }
  }
}

// Stdio transport
const rl = readline.createInterface({ input: process.stdin })

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line)
    const response = await handleMessage(msg)
    console.log(JSON.stringify(response))
  } catch (error) {
    console.log(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      })
    )
  }
})
