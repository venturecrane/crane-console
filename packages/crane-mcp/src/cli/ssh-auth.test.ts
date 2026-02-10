import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync, spawnSync } from 'child_process'
import { readFileSync, statSync } from 'fs'

vi.mock('child_process')
vi.mock('fs')

// Mock os module - platform and homedir
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    platform: vi.fn(() => 'darwin'),
    homedir: vi.fn(() => '/Users/testuser'),
  }
})

import {
  isSSHSession,
  isMacOS,
  readUACredentials,
  loginWithUniversalAuth,
  isKeychainLocked,
  unlockKeychain,
  prepareSSHAuth,
} from './ssh-auth.js'
import { platform, homedir } from 'os'

describe('ssh-auth', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset SSH env vars
    delete process.env.SSH_CLIENT
    delete process.env.SSH_TTY
    delete process.env.SSH_CONNECTION
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('isSSHSession', () => {
    it('returns false when no SSH env vars set', () => {
      expect(isSSHSession()).toBe(false)
    })

    it('returns true when SSH_CLIENT is set', () => {
      process.env.SSH_CLIENT = '192.168.1.1 12345 22'
      expect(isSSHSession()).toBe(true)
    })

    it('returns true when SSH_TTY is set', () => {
      process.env.SSH_TTY = '/dev/pts/0'
      expect(isSSHSession()).toBe(true)
    })

    it('returns true when SSH_CONNECTION is set', () => {
      process.env.SSH_CONNECTION = '192.168.1.1 12345 192.168.1.2 22'
      expect(isSSHSession()).toBe(true)
    })
  })

  describe('isMacOS', () => {
    it('returns true on darwin', () => {
      vi.mocked(platform).mockReturnValue('darwin')
      expect(isMacOS()).toBe(true)
    })

    it('returns false on linux', () => {
      vi.mocked(platform).mockReturnValue('linux')
      expect(isMacOS()).toBe(false)
    })
  })

  describe('readUACredentials', () => {
    it('returns null when file does not exist', () => {
      vi.mocked(statSync).mockImplementation(() => {
        throw new Error('ENOENT')
      })
      expect(readUACredentials()).toBeNull()
    })

    it('reads credentials from well-formed file', () => {
      vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as any)
      vi.mocked(readFileSync).mockReturnValue(
        '# comment\nINFISICAL_UA_CLIENT_ID=abc123\nINFISICAL_UA_CLIENT_SECRET=secret456\n'
      )
      const creds = readUACredentials()
      expect(creds).toEqual({
        clientId: 'abc123',
        clientSecret: 'secret456',
      })
    })

    it('returns null when client id is missing', () => {
      vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as any)
      vi.mocked(readFileSync).mockReturnValue('INFISICAL_UA_CLIENT_SECRET=secret456\n')
      expect(readUACredentials()).toBeNull()
    })

    it('returns null when client secret is missing', () => {
      vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as any)
      vi.mocked(readFileSync).mockReturnValue('INFISICAL_UA_CLIENT_ID=abc123\n')
      expect(readUACredentials()).toBeNull()
    })

    it('warns when permissions are too open', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(statSync).mockReturnValue({ mode: 0o100644 } as any)
      vi.mocked(readFileSync).mockReturnValue(
        'INFISICAL_UA_CLIENT_ID=abc123\nINFISICAL_UA_CLIENT_SECRET=secret456\n'
      )
      readUACredentials()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('permissions'))
      warnSpy.mockRestore()
    })
  })

  describe('loginWithUniversalAuth', () => {
    it('returns token on success', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('jwt-token-here\n'))
      const token = loginWithUniversalAuth({
        clientId: 'abc',
        clientSecret: 'def',
      })
      expect(token).toBe('jwt-token-here')
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--method=universal-auth'),
        expect.any(Object)
      )
    })

    it('returns null on failure', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('login failed')
      })
      const token = loginWithUniversalAuth({
        clientId: 'abc',
        clientSecret: 'def',
      })
      expect(token).toBeNull()
    })

    it('returns null when token is empty', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('  \n'))
      const token = loginWithUniversalAuth({
        clientId: 'abc',
        clientSecret: 'def',
      })
      expect(token).toBeNull()
    })
  })

  describe('isKeychainLocked', () => {
    it('returns false when credential value is readable (unlocked)', () => {
      vi.mocked(execSync).mockReturnValue(
        Buffer.from('{"claudeAiOauth":{"accessToken":"sk-ant-..."}}')
      )
      expect(isKeychainLocked()).toBe(false)
    })

    it('returns true when credential value is empty (locked/inaccessible)', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''))
      expect(isKeychainLocked()).toBe(true)
    })

    it('returns true when security command fails (locked)', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('keychain locked')
      })
      expect(isKeychainLocked()).toBe(true)
    })
  })

  describe('unlockKeychain', () => {
    it('returns true on successful unlock when credential becomes readable', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any)
      // After unlock, isKeychainLocked() is called which uses execSync
      // Return non-empty to indicate credential is now readable
      vi.mocked(execSync).mockReturnValue(Buffer.from('{"claudeAiOauth":{}}'))
      expect(unlockKeychain()).toBe(true)
      expect(spawnSync).toHaveBeenCalledWith(
        'security',
        ['unlock-keychain', expect.stringContaining('Library/Keychains/login.keychain-db')],
        expect.objectContaining({ stdio: 'inherit' })
      )
      logSpy.mockRestore()
    })

    it('returns false when spawnSync fails', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any)
      expect(unlockKeychain()).toBe(false)
      logSpy.mockRestore()
    })

    it('returns false when unlock succeeds but credential still not readable', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any)
      // After unlock, credential is still empty (ACL issue)
      vi.mocked(execSync).mockReturnValue(Buffer.from(''))
      expect(unlockKeychain()).toBe(false)
      logSpy.mockRestore()
    })
  })

  describe('prepareSSHAuth', () => {
    it('returns empty env when not SSH session', () => {
      // SSH env vars are cleared in beforeEach
      const result = prepareSSHAuth()
      expect(result).toEqual({ env: {} })
    })

    it('aborts when SSH but no UA credentials file', () => {
      process.env.SSH_CLIENT = '1.2.3.4 5678 22'
      vi.mocked(statSync).mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const result = prepareSSHAuth()
      expect(result.abort).toContain('~/.infisical-ua not found')
    })

    it('aborts when UA login fails', () => {
      process.env.SSH_CLIENT = '1.2.3.4 5678 22'
      vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as any)
      vi.mocked(readFileSync).mockReturnValue(
        'INFISICAL_UA_CLIENT_ID=abc\nINFISICAL_UA_CLIENT_SECRET=def\n'
      )
      // execSync for UA login throws
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('auth failed')
      })

      const result = prepareSSHAuth()
      expect(result.abort).toContain('Universal Auth login failed')
    })

    it('sets INFISICAL_TOKEN and checks keychain on macOS SSH', () => {
      process.env.SSH_CLIENT = '1.2.3.4 5678 22'
      vi.mocked(platform).mockReturnValue('darwin')
      vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as any)
      vi.mocked(readFileSync).mockReturnValue(
        'INFISICAL_UA_CLIENT_ID=abc\nINFISICAL_UA_CLIENT_SECRET=def\n'
      )

      // First execSync call: UA login succeeds
      // Second execSync call: keychain check returns non-empty (unlocked)
      let callCount = 0
      vi.mocked(execSync).mockImplementation(() => {
        callCount++
        if (callCount === 1) return Buffer.from('jwt-token\n')
        return Buffer.from('{"claudeAiOauth":{}}') // keychain unlocked, value readable
      })

      const result = prepareSSHAuth()
      expect(result.env.INFISICAL_TOKEN).toBe('jwt-token')
      expect(result.abort).toBeUndefined()
    })

    it('prompts keychain unlock when locked on macOS SSH', () => {
      process.env.SSH_CLIENT = '1.2.3.4 5678 22'
      vi.mocked(platform).mockReturnValue('darwin')
      vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as any)
      vi.mocked(readFileSync).mockReturnValue(
        'INFISICAL_UA_CLIENT_ID=abc\nINFISICAL_UA_CLIENT_SECRET=def\n'
      )

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // execSync calls:
      // 1: UA login succeeds
      // 2: keychain check fails (locked)
      // 3: keychain check after unlock succeeds (readable)
      let callCount = 0
      vi.mocked(execSync).mockImplementation(() => {
        callCount++
        if (callCount === 1) return Buffer.from('jwt-token\n')
        if (callCount === 2) throw new Error('keychain locked')
        return Buffer.from('{"claudeAiOauth":{}}') // now readable after unlock
      })

      // spawnSync: keychain unlock succeeds
      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any)

      const result = prepareSSHAuth()
      expect(result.env.INFISICAL_TOKEN).toBe('jwt-token')
      expect(result.abort).toBeUndefined()
      expect(spawnSync).toHaveBeenCalledWith(
        'security',
        ['unlock-keychain', expect.stringContaining('Library/Keychains/login.keychain-db')],
        expect.any(Object)
      )
      logSpy.mockRestore()
    })

    it('skips keychain check on Linux SSH', () => {
      process.env.SSH_CLIENT = '1.2.3.4 5678 22'
      vi.mocked(platform).mockReturnValue('linux')
      vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as any)
      vi.mocked(readFileSync).mockReturnValue(
        'INFISICAL_UA_CLIENT_ID=abc\nINFISICAL_UA_CLIENT_SECRET=def\n'
      )
      vi.mocked(execSync).mockReturnValue(Buffer.from('jwt-token\n'))

      const result = prepareSSHAuth()
      expect(result.env.INFISICAL_TOKEN).toBe('jwt-token')
      expect(result.abort).toBeUndefined()
      // spawnSync should NOT be called (no keychain on Linux)
      expect(spawnSync).not.toHaveBeenCalled()
    })
  })
})
