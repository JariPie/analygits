import { describe, it, expect } from 'vitest';
import {
    sanitizeErrorMessage,
    createUserFriendlyError,
    isTokenExpired,
    isValidTokenFormat,
    validateGitHubOwner,
    validateGitHubRepo,
    validateGitBranch,
    validateGitSha,
    validateGitHubParams,
    isAllowedGitHubUrl,
    isAllowedBackendUrl,
    maskToken,
    sanitizeStorageForLogging,
} from '../src/utils/security';

describe('security utilities', () => {
    describe('sanitizeErrorMessage', () => {
        it('should extract message from Error instances', () => {
            const error = new Error('Test error message');
            expect(sanitizeErrorMessage(error)).toBe('Test error message');
        });

        it('should return string errors as-is', () => {
            expect(sanitizeErrorMessage('Plain string error')).toBe('Plain string error');
        });

        it('should return generic message for non-string/non-Error', () => {
            expect(sanitizeErrorMessage(null)).toBe('An unexpected error occurred');
            expect(sanitizeErrorMessage(undefined)).toBe('An unexpected error occurred');
            expect(sanitizeErrorMessage(42)).toBe('An unexpected error occurred');
            expect(sanitizeErrorMessage({})).toBe('An unexpected error occurred');
        });

        it('should redact Bearer tokens', () => {
            const error = 'Failed with Bearer ghp_1234567890abcdef1234567890abcdef12345678';
            const result = sanitizeErrorMessage(error);
            expect(result).toContain('[REDACTED]');
            expect(result).not.toContain('ghp_1234567890');
        });

        it('should redact GitHub PAT tokens (ghp_)', () => {
            const error = 'Token ghp_abcdefghijklmnopqrstuvwxyz1234567890 is invalid';
            const result = sanitizeErrorMessage(error);
            expect(result).toContain('[REDACTED]');
            expect(result).not.toContain('ghp_abcdef');
        });

        it('should redact GitHub App tokens (ghs_)', () => {
            const error = 'Token ghs_abcdefghijklmnopqrstuvwxyz1234567890 expired';
            const result = sanitizeErrorMessage(error);
            expect(result).toContain('[REDACTED]');
            expect(result).not.toContain('ghs_abcdef');
        });

        it('should redact 64-character hex strings (potential secrets)', () => {
            const hex64 = 'a'.repeat(64);
            const error = `Secret: ${hex64}`;
            const result = sanitizeErrorMessage(error);
            expect(result).toContain('[REDACTED]');
            expect(result).not.toContain(hex64);
        });

        it('should truncate messages longer than 500 characters', () => {
            const longMessage = 'x'.repeat(600);
            const result = sanitizeErrorMessage(longMessage);
            expect(result.length).toBeLessThanOrEqual(503); // 500 + '...'
            expect(result).toMatch(/\.\.\.$/);
        });

        it('should handle multiple sensitive patterns in one message', () => {
            const error = 'Bearer token123abc and ghp_abcdefghijklmnopqrstuvwxyz1234567890 both exposed';
            const result = sanitizeErrorMessage(error);
            expect(result).not.toContain('token123');
            expect(result).not.toContain('ghp_abcdef');
            expect(result.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('createUserFriendlyError', () => {
        it('should map 401 errors to authentication message', () => {
            expect(createUserFriendlyError('401 Unauthorized')).toContain('Authentication');
        });

        it('should map 403 errors to access denied message', () => {
            expect(createUserFriendlyError('403 Forbidden')).toContain('Access denied');
        });

        it('should map 404 errors to not found message', () => {
            const result = createUserFriendlyError('404 Not Found');
            expect(result.toLowerCase()).toContain('not found');
        });

        it('should map 429 errors to rate limit message', () => {
            expect(createUserFriendlyError('429 Too Many Requests')).toContain('Rate limit');
        });

        it('should map network errors to connection message', () => {
            expect(createUserFriendlyError('NetworkError')).toContain('Network');
            expect(createUserFriendlyError('fetch failed')).toContain('Network');
        });

        it('should map 500 errors to server error message', () => {
            expect(createUserFriendlyError('500 Internal Server Error')).toContain('Server error');
        });

        it('should include context when provided', () => {
            const result = createUserFriendlyError('Unknown error', 'Saving');
            expect(result).toContain('Saving');
        });

        it('should sanitize before mapping', () => {
            const error = '401 with token ghp_secret123456789012345678901234567890';
            const result = createUserFriendlyError(error);
            expect(result).not.toContain('ghp_');
        });
    });

    describe('isTokenExpired', () => {
        it('should return true for null/undefined expiry', () => {
            expect(isTokenExpired(null)).toBe(true);
            expect(isTokenExpired(undefined)).toBe(true);
        });

        it('should return true for past expiry time', () => {
            const pastDate = new Date(Date.now() - 60000).toISOString();
            expect(isTokenExpired(pastDate)).toBe(true);
        });

        it('should return false for future expiry time', () => {
            const futureDate = new Date(Date.now() + 3600000).toISOString();
            expect(isTokenExpired(futureDate)).toBe(false);
        });

        it('should account for buffer time', () => {
            // Token expires in 30 seconds, but buffer is 60 seconds
            const soonDate = new Date(Date.now() + 30000).toISOString();
            expect(isTokenExpired(soonDate, 60000)).toBe(true);
        });

        it('should handle numeric timestamps', () => {
            const futureTimestamp = Date.now() + 3600000;
            expect(isTokenExpired(futureTimestamp)).toBe(false);
        });

        it('should return false when expiry exactly equals now plus buffer', () => {
            // Edge case: exactly at buffer boundary (uses strict less than)
            // When expiry - now = bufferMs, the check `expiry - now < bufferMs` is false
            const exactBufferDate = new Date(Date.now() + 60000).toISOString();
            expect(isTokenExpired(exactBufferDate, 60000)).toBe(false);
        });
    });

    describe('isValidTokenFormat', () => {
        it('should return false for null/undefined', () => {
            expect(isValidTokenFormat(null)).toBe(false);
            expect(isValidTokenFormat(undefined)).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(isValidTokenFormat('')).toBe(false);
        });

        it('should return false for short tokens', () => {
            expect(isValidTokenFormat('abc')).toBe(false);
            expect(isValidTokenFormat('a'.repeat(19))).toBe(false);
        });

        it('should return true for valid tokens', () => {
            expect(isValidTokenFormat('a'.repeat(20))).toBe(true);
            expect(isValidTokenFormat('ghp_1234567890abcdef1234567890abcdef12345678')).toBe(true);
        });

        it('should return false for tokens with invalid characters', () => {
            expect(isValidTokenFormat('token with spaces')).toBe(false);
            expect(isValidTokenFormat('token@special!')).toBe(false);
        });
    });

    describe('validateGitHubOwner', () => {
        it('should accept valid owner names', () => {
            expect(validateGitHubOwner('validuser').valid).toBe(true);
            expect(validateGitHubOwner('user-name').valid).toBe(true);
            expect(validateGitHubOwner('user123').valid).toBe(true);
            expect(validateGitHubOwner('a').valid).toBe(true);
        });

        it('should reject empty owner', () => {
            expect(validateGitHubOwner('').valid).toBe(false);
            expect(validateGitHubOwner('  ').valid).toBe(false);
        });

        it('should reject owner with invalid characters', () => {
            expect(validateGitHubOwner('user/name').valid).toBe(false);
            expect(validateGitHubOwner('user name').valid).toBe(false);
            expect(validateGitHubOwner('user@name').valid).toBe(false);
        });

        it('should reject owner starting with hyphen', () => {
            expect(validateGitHubOwner('-username').valid).toBe(false);
        });

        it('should reject owner ending with hyphen', () => {
            expect(validateGitHubOwner('username-').valid).toBe(false);
        });

        it('should reject owner longer than 39 characters', () => {
            expect(validateGitHubOwner('a'.repeat(40)).valid).toBe(false);
        });

        it('should provide sanitized value on success', () => {
            const result = validateGitHubOwner('  validuser  ');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('validuser');
        });
    });

    describe('validateGitHubRepo', () => {
        it('should accept valid repo names', () => {
            expect(validateGitHubRepo('my-repo').valid).toBe(true);
            expect(validateGitHubRepo('repo_name').valid).toBe(true);
            expect(validateGitHubRepo('repo.name').valid).toBe(true);
            expect(validateGitHubRepo('Repo123').valid).toBe(true);
        });

        it('should reject empty repo', () => {
            expect(validateGitHubRepo('').valid).toBe(false);
        });

        it('should reject repo with path separators', () => {
            expect(validateGitHubRepo('repo/name').valid).toBe(false);
        });

        it('should reject reserved names', () => {
            expect(validateGitHubRepo('.').valid).toBe(false);
            expect(validateGitHubRepo('..').valid).toBe(false);
            expect(validateGitHubRepo('.git').valid).toBe(false);
        });

        it('should reject repo starting with dot', () => {
            expect(validateGitHubRepo('.hidden').valid).toBe(false);
        });

        it('should reject repo longer than 100 characters', () => {
            expect(validateGitHubRepo('a'.repeat(101)).valid).toBe(false);
        });
    });

    describe('validateGitBranch', () => {
        it('should accept valid branch names', () => {
            expect(validateGitBranch('main').valid).toBe(true);
            expect(validateGitBranch('feature/new-thing').valid).toBe(true);
            expect(validateGitBranch('release-1.0').valid).toBe(false); // dots not in pattern
            expect(validateGitBranch('release-1-0').valid).toBe(true);
        });

        it('should reject empty branch', () => {
            expect(validateGitBranch('').valid).toBe(false);
        });

        it('should reject branch with spaces', () => {
            expect(validateGitBranch('branch name').valid).toBe(false);
        });

        it('should reject branch with consecutive dots', () => {
            expect(validateGitBranch('branch..name').valid).toBe(false);
        });

        it('should reject branch starting with hyphen', () => {
            expect(validateGitBranch('-branch').valid).toBe(false);
        });

        it('should reject branch ending with .lock', () => {
            expect(validateGitBranch('branch.lock').valid).toBe(false);
        });

        it('should reject branches longer than 255 characters', () => {
            expect(validateGitBranch('a'.repeat(256)).valid).toBe(false);
        });
    });

    describe('validateGitSha', () => {
        it('should accept valid 40-char hex SHA', () => {
            expect(validateGitSha('a'.repeat(40)).valid).toBe(true);
            expect(validateGitSha('1234567890abcdef1234567890abcdef12345678').valid).toBe(true);
            expect(validateGitSha('ABCDEF1234567890abcdef1234567890abcdef12').valid).toBe(true);
        });

        it('should reject SHA with wrong length', () => {
            expect(validateGitSha('abc123').valid).toBe(false);
            expect(validateGitSha('a'.repeat(39)).valid).toBe(false);
            expect(validateGitSha('a'.repeat(41)).valid).toBe(false);
        });

        it('should reject SHA with non-hex characters', () => {
            expect(validateGitSha('g'.repeat(40)).valid).toBe(false);
            expect(validateGitSha('z'.repeat(40)).valid).toBe(false);
        });

        it('should provide lowercase sanitized value', () => {
            const result = validateGitSha('ABCDEF1234567890abcdef1234567890abcdef12');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('abcdef1234567890abcdef1234567890abcdef12');
        });
    });

    describe('validateGitHubParams', () => {
        it('should validate all provided params', () => {
            const result = validateGitHubParams({
                owner: 'validuser',
                repo: 'valid-repo',
                branch: 'main',
                sha: 'a'.repeat(40)
            });
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should collect multiple validation errors', () => {
            const result = validateGitHubParams({
                owner: '',
                repo: '',
                branch: ''
            });
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(1);
        });

        it('should skip undefined params', () => {
            const result = validateGitHubParams({ owner: 'valid' });
            expect(result.valid).toBe(true);
        });

        it('should include field name in error messages', () => {
            const result = validateGitHubParams({
                owner: '-invalid',
                repo: '..'
            });
            expect(result.errors.some(e => e.includes('Owner'))).toBe(true);
            expect(result.errors.some(e => e.includes('Repo'))).toBe(true);
        });
    });

    describe('isAllowedGitHubUrl', () => {
        it('should allow api.github.com', () => {
            expect(isAllowedGitHubUrl('https://api.github.com/repos/owner/repo')).toBe(true);
            expect(isAllowedGitHubUrl('https://api.github.com/user')).toBe(true);
        });

        it('should reject non-HTTPS URLs', () => {
            expect(isAllowedGitHubUrl('http://api.github.com/repos')).toBe(false);
        });

        it('should reject non-GitHub domains', () => {
            expect(isAllowedGitHubUrl('https://evil.com/api.github.com')).toBe(false);
            expect(isAllowedGitHubUrl('https://github.com/repos')).toBe(false);
        });

        it('should reject malformed URLs', () => {
            expect(isAllowedGitHubUrl('not-a-url')).toBe(false);
            expect(isAllowedGitHubUrl('')).toBe(false);
        });
    });

    describe('isAllowedBackendUrl', () => {
        it('should allow api.analygits.com', () => {
            expect(isAllowedBackendUrl('https://api.analygits.com/api/auth')).toBe(true);
            expect(isAllowedBackendUrl('https://api.analygits.com')).toBe(true);
        });

        it('should reject non-HTTPS URLs', () => {
            expect(isAllowedBackendUrl('http://api.analygits.com/api')).toBe(false);
        });

        it('should reject non-backend domains', () => {
            expect(isAllowedBackendUrl('https://evil.com')).toBe(false);
            expect(isAllowedBackendUrl('https://analygits.com')).toBe(false);
        });
    });

    describe('maskToken', () => {
        it('should return (none) for null/undefined', () => {
            expect(maskToken(null)).toBe('(none)');
            expect(maskToken(undefined)).toBe('(none)');
        });

        it('should return *** for very short tokens', () => {
            expect(maskToken('abc')).toBe('***');
            expect(maskToken('12345678')).toBe('***');
        });

        it('should mask middle of longer tokens', () => {
            const result = maskToken('ghp_1234567890abcdef1234567890abcdef12345678');
            expect(result).toMatch(/^ghp_\.\.\.5678$/);
            expect(result).not.toContain('1234567890');
        });
    });

    describe('sanitizeStorageForLogging', () => {
        it('should mask sensitive keys', () => {
            const data = {
                deviceToken: 'secret123',
                accessToken: 'token456',
                username: 'public'
            };
            const result = sanitizeStorageForLogging(data);
            expect(result.deviceToken).toBe('[PRESENT]');
            expect(result.accessToken).toBe('[PRESENT]');
            expect(result.username).toBe('public');
        });

        it('should show [EMPTY] for falsy sensitive values', () => {
            const data = {
                deviceToken: '',
                accessToken: null,
            };
            const result = sanitizeStorageForLogging(data);
            expect(result.deviceToken).toBe('[EMPTY]');
            expect(result.accessToken).toBe('[EMPTY]');
        });

        it('should recursively sanitize nested objects', () => {
            const data = {
                auth: {
                    accessToken: 'nested-secret',
                    user: 'public'
                }
            };
            const result = sanitizeStorageForLogging(data);
            expect((result.auth as Record<string, unknown>).accessToken).toBe('[PRESENT]');
            expect((result.auth as Record<string, unknown>).user).toBe('public');
        });
    });
});
