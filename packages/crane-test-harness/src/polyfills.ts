/**
 * Workerd polyfills for the in-process Node test environment.
 *
 * Cloudflare's `workerd` runtime extends Web standard APIs with a few
 * Cloudflare-specific methods that don't exist in Node.js. Workers code
 * that uses these will throw `TypeError: ... is not a function` when run
 * in-process via the harness.
 *
 * This module patches `globalThis.crypto.subtle` with the missing methods,
 * delegating to Node's `node:crypto` equivalents where available.
 *
 * Call `installWorkerdPolyfills()` ONCE per test process, ideally in
 * vitest's `setupFiles` or in a top-level `beforeAll` of your test file.
 * The function is idempotent — repeated calls are no-ops.
 *
 * Currently polyfilled:
 *
 *   - `crypto.subtle.timingSafeEqual(a, b)` — workerd extension. Delegates
 *     to `node:crypto`'s `timingSafeEqual` (which takes ArrayBufferView /
 *     Buffer arguments). Returns `false` for length-mismatched inputs
 *     (matching workerd's documented behavior).
 *
 * Standard Web Crypto APIs that already work in Node 22 are NOT polyfilled:
 *   - `crypto.subtle.digest(...)` — works in Node
 *   - `crypto.randomUUID()`        — works in Node
 *   - `crypto.getRandomValues(...)` — works in Node
 */

import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'

let installed = false

export function installWorkerdPolyfills(): void {
  if (installed) return

  // crypto.subtle.timingSafeEqual: workerd-only extension.
  // The workerd signature: (a: ArrayBufferLike | ArrayBufferView, b: ArrayBufferLike | ArrayBufferView) => boolean
  // Node's node:crypto.timingSafeEqual: similar but stricter on length matching (throws if lengths differ).
  // Workerd returns false for length mismatch; we replicate that behavior.
  const subtle = globalThis.crypto?.subtle as
    | (SubtleCrypto & { timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean })
    | undefined

  if (subtle && typeof subtle.timingSafeEqual !== 'function') {
    subtle.timingSafeEqual = (a: BufferSource, b: BufferSource): boolean => {
      const aBuf = toUint8Array(a)
      const bBuf = toUint8Array(b)
      if (aBuf.byteLength !== bBuf.byteLength) {
        return false
      }
      return nodeTimingSafeEqual(aBuf, bBuf)
    }
  }

  installed = true
}

function toUint8Array(value: BufferSource): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  // Other ArrayBufferView (DataView, typed arrays)
  const view = value as ArrayBufferView
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}
