import { describe, it, expect } from 'vitest'
import { scrubSecrets } from '../src/lib/scrub'

describe('scrubSecrets', () => {
  describe('positive cases — known leak vectors are masked', () => {
    it('masks AWS access keys', () => {
      const input = 'Found in env: AKIAIOSFODNN7EXAMPLE'
      const r = scrubSecrets(input)
      expect(r.scrubbed).not.toContain('AKIAIOSFODNN7EXAMPLE')
      expect(r.scrubbed).toContain('[REDACTED]')
      expect(r.redacted).toBe(true)
    })

    it('masks GitHub PATs (ghp_/ghs_)', () => {
      const ghp = 'token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const ghs = 'GHS=ghs_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      const a = scrubSecrets(ghp)
      const b = scrubSecrets(ghs)
      expect(a.scrubbed).not.toMatch(/ghp_[a-z]{36}/)
      expect(b.scrubbed).not.toMatch(/ghs_[a-z]{36}/)
      expect(a.redacted).toBe(true)
      expect(b.redacted).toBe(true)
    })

    it('masks JWTs', () => {
      const jwt =
        'header eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c trailer'
      const r = scrubSecrets(jwt)
      expect(r.scrubbed).not.toContain('eyJhbGc')
      expect(r.scrubbed).toContain('header [REDACTED] trailer')
      expect(r.redacted).toBe(true)
    })

    it('masks OpenAI sk- keys', () => {
      const r = scrubSecrets('OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456')
      expect(r.scrubbed).not.toContain('sk-abc')
      expect(r.redacted).toBe(true)
    })

    it('masks SSH-shaped PRIVATE KEY blocks', () => {
      const key = `before
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAt
-----END OPENSSH PRIVATE KEY-----
after`
      const r = scrubSecrets(key)
      expect(r.scrubbed).not.toContain('BEGIN OPENSSH')
      expect(r.scrubbed).toContain('before\n[REDACTED]\nafter')
      expect(r.redacted).toBe(true)
    })

    it('masks generic KEY=value secret fields', () => {
      const cases = [
        'API_KEY=hunter2deadbeefcafe',
        'PASSWORD: "p4ssw0rd"',
        "TOKEN='abcdef1234'",
        'SECRET=somethingverylong',
      ]
      for (const c of cases) {
        const r = scrubSecrets(c)
        expect(r.redacted).toBe(true)
        expect(r.scrubbed).toContain('[REDACTED]')
      }
    })

    it('masks high-entropy base64 values inside assignment shapes', () => {
      const r = scrubSecrets('webhook_secret=ZmFrZWJ1dGhpZ2hlbnRyb3B5dmFsdWVoZXJlYWFhYWFhYWFhYQ==')
      expect(r.redacted).toBe(true)
      expect(r.scrubbed).toContain('webhook_secret=[REDACTED]')
    })
  })

  describe('negative cases — legitimate evidence is NOT mangled', () => {
    it('does not mask standalone git SHAs', () => {
      const sha = 'commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
      const r = scrubSecrets(sha)
      expect(r.scrubbed).toBe(sha)
      expect(r.redacted).toBe(false)
    })

    it('does not mask ULIDs in flowing text', () => {
      const ulid = 'session_id=01HQXV3NK8YXM3G5ZXQXQXQXQX returned'
      const r = scrubSecrets(ulid)
      // session_id is not in the explicit secret-name set, but the value
      // is only 26 chars and entropy is hex-only — under threshold, no mask.
      expect(r.scrubbed).toBe(ulid)
      expect(r.redacted).toBe(false)
    })

    it('does not mask container image digests', () => {
      const digest = 'image sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
      const r = scrubSecrets(digest)
      expect(r.scrubbed).toBe(digest)
      expect(r.redacted).toBe(false)
    })

    it('does not mask Cloudflare-style account/database IDs in narrative output', () => {
      const text = 'Database: crane-context-db (id: 11111111222233334444555566667777)'
      const r = scrubSecrets(text)
      // ID is hex only, not in an assignment shape, so entropy gate does not fire.
      expect(r.scrubbed).toBe(text)
      expect(r.redacted).toBe(false)
    })

    it('does not mask normal command output', () => {
      const out = 'wrangler tail returned 200 OK with no errors at 2026-05-06T18:00:00Z'
      const r = scrubSecrets(out)
      expect(r.scrubbed).toBe(out)
      expect(r.redacted).toBe(false)
    })
  })

  describe('idempotence + edge cases', () => {
    it('returns empty input untouched', () => {
      const r = scrubSecrets('')
      expect(r.scrubbed).toBe('')
      expect(r.redacted).toBe(false)
    })

    it('is idempotent — scrubbing twice produces same result', () => {
      const input = 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz1234567890'
      const once = scrubSecrets(input)
      const twice = scrubSecrets(once.scrubbed)
      expect(twice.scrubbed).toBe(once.scrubbed)
      expect(twice.redacted).toBe(false) // already masked, no new mask fired
    })
  })
})
