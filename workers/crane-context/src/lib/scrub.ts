/**
 * Secret scrubber for verify_ledger.output_scrubbed.
 *
 * Two layers, in order:
 *
 *   1. Regex masks for the known leak vectors (PATs, AWS keys, OpenAI keys,
 *      JWTs, PEM blocks, KEY=value lines). These are the patterns we have
 *      direct evidence of agents pasting verbatim into command output.
 *
 *   2. A targeted entropy check that fires ONLY inside an assignment shape
 *      (`name = high-entropy-value` or `name: high-entropy-value`). The
 *      blanket entropy gate considered earlier was rejected because git
 *      SHAs, ULIDs, container digests, and Cloudflare account IDs are all
 *      legitimately high-entropy and represent the very evidence agents
 *      need to capture. Smearing [REDACTED] across them collapses the
 *      ledger's audit value.
 *
 * `redacted: true` is set on the result when any mask fired so the ledger
 * row records that scrubbing happened — useful as an audit signal in PR 3.
 */

const REDACTED = '[REDACTED]'

// Shannon entropy threshold. Empirically, base64-shaped secrets land in
// the 4.5-5.5 range; legitimate hex-only IDs (git SHAs, ULIDs) sit below.
// A targeted assignment-shape rule using this threshold catches secrets
// without flagging IDs because IDs aren't usually written as `name = id`.
const ENTROPY_THRESHOLD = 4.5

// Regex patterns. Order matters slightly — JWTs need to match before the
// generic assignment pattern because the dot structure is JWT-specific.
const PEM_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const GH_PAT = /\bgh[ps]_[A-Za-z0-9]{36,}/g
const OPENAI_KEY = /\bsk-[A-Za-z0-9]{20,}/g
const AWS_ACCESS_KEY = /\bAKIA[A-Z0-9]{16}\b/g
// KEY=value, KEY: value, with quoted or unquoted values. The key can be a
// full identifier whose root token is one of the secret-shaped words
// (e.g., `webhook_secret`, `gh_token`, `api_password` all match). The
// whole key is captured so the replacement preserves it on the left of
// the assignment for audit visibility.
const KV_SECRET =
  /\b(\w*(?:API[_-]?KEY|APIKEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|PEM|PRIVATE[_-]?KEY|CREDENTIAL)\w*)\s*([:=])\s*("[^"]+"|'[^']+'|\S+)/gi
// Targeted entropy: any name=value where value is 32+ chars of base64-ish.
// Captures the value so we can entropy-check it before deciding to mask.
const ASSIGN_HIGH_ENTROPY_CANDIDATE = /(\b\w+\s*[:=]\s*)([A-Za-z0-9+/=_-]{32,})/g

/**
 * Compute Shannon entropy in bits per character. Higher = more random.
 */
function shannonEntropy(s: string): number {
  if (s.length === 0) return 0
  const counts = new Map<string, number>()
  for (const ch of s) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  let h = 0
  for (const c of counts.values()) {
    const p = c / s.length
    h -= p * Math.log2(p)
  }
  return h
}

export interface ScrubResult {
  scrubbed: string
  redacted: boolean
}

/**
 * Scrub secrets from a string. Returns the masked text and a boolean
 * indicating whether any mask fired.
 */
export function scrubSecrets(input: string): ScrubResult {
  if (!input) {
    return { scrubbed: input, redacted: false }
  }

  let out = input
  let redacted = false

  // 1. PEM blocks — must run before JWT/AWS to avoid mid-block matches.
  out = out.replace(PEM_BLOCK, () => {
    redacted = true
    return REDACTED
  })

  // 2. JWTs.
  out = out.replace(JWT, () => {
    redacted = true
    return REDACTED
  })

  // 3. GH PATs.
  out = out.replace(GH_PAT, () => {
    redacted = true
    return REDACTED
  })

  // 4. OpenAI / sk-prefixed keys.
  out = out.replace(OPENAI_KEY, () => {
    redacted = true
    return REDACTED
  })

  // 5. AWS access keys.
  out = out.replace(AWS_ACCESS_KEY, () => {
    redacted = true
    return REDACTED
  })

  // 6. KEY=value style — explicit secret-name match (incl. suffix/prefix
  //    forms like `webhook_secret`, `api_password`). Preserve the full
  //    key name and the original separator on the left so audit can see
  //    what field was masked; only the value becomes [REDACTED].
  //    Idempotence: skip if the captured value is already the sentinel
  //    so re-running the scrubber on already-scrubbed output does not
  //    re-flip the redacted flag (audit double-count protection).
  out = out.replace(KV_SECRET, (match, key: string, sep: string, value: string) => {
    const inner = value.startsWith('"') || value.startsWith("'") ? value.slice(1, -1) : value
    if (inner === REDACTED) {
      return match
    }
    redacted = true
    return `${key}${sep}${REDACTED}`
  })

  // 7. Targeted entropy: name=value where value is 32+ char base64-ish
  //    AND the value's Shannon entropy crosses the threshold. This is
  //    the narrow rule that does not catch git SHAs / ULIDs / digests
  //    in standalone form (they don't look like `name = value`).
  //    Same idempotence guard as KV_SECRET above.
  out = out.replace(ASSIGN_HIGH_ENTROPY_CANDIDATE, (full, prefix: string, value: string) => {
    if (value === REDACTED) {
      return full
    }
    if (shannonEntropy(value) > ENTROPY_THRESHOLD) {
      redacted = true
      return `${prefix}${REDACTED}`
    }
    return full
  })

  return { scrubbed: out, redacted }
}
