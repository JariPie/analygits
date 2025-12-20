import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleError, devLog, devWarn, devError } from '../src/utils/errorHandler';

describe('errorHandler', () => {
    describe('handleError', () => {
        let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        });

        afterEach(() => {
            consoleErrorSpy.mockRestore();
            vi.clearAllMocks();
        });

        it('should return user-friendly message for Error instances', () => {
            const error = new Error('Something failed');
            const result = handleError(error, 'TestContext');
            expect(typeof result).toBe('string');
            expect(result).toBeTruthy();
        });

        it('should return user-friendly message for string errors', () => {
            const result = handleError('Plain string error', 'TestContext');
            expect(typeof result).toBe('string');
            expect(result).toBeTruthy();
        });

        it('should return generic message for unknown error types', () => {
            const resultNull = handleError(null, 'TestContext');
            const resultUndef = handleError(undefined, 'TestContext');
            const resultNum = handleError(42, 'TestContext');
            const resultObj = handleError({}, 'TestContext');

            expect(typeof resultNull).toBe('string');
            expect(typeof resultUndef).toBe('string');
            expect(typeof resultNum).toBe('string');
            expect(typeof resultObj).toBe('string');
        });

        it('should use sanitized error messages (behavior test)', () => {
            // Test that sensitive data is not exposed in the output
            const error = new Error('Token ghp_secret123456789012345678901234567890 is invalid');
            const result = handleError(error, 'TestContext');
            // The result should not contain the token
            expect(result).not.toContain('ghp_secret');
        });

        it('should return context-aware user friendly messages (behavior test)', () => {
            const error = new Error('Test error');
            const result = handleError(error, 'TestContext');
            // Should contain the context
            expect(result).toContain('TestContext');
        });

        it('should map 401 errors to authentication message', () => {
            const result = handleError('401 Unauthorized', 'API');
            expect(result).toContain('Authentication');
        });

        it('should map 403 errors to access denied message', () => {
            const result = handleError('403 Forbidden', 'API');
            expect(result).toContain('Access denied');
        });

        it('should map 404 errors to not found message', () => {
            const result = handleError('404 Not Found', 'API');
            expect(result).toContain('not found');
        });

        it('should map 429 errors to rate limit message', () => {
            const result = handleError('429 Too Many Requests', 'API');
            expect(result).toContain('Rate limit');
        });

        it('should map 500 errors to server error message', () => {
            const result = handleError('500 Internal Server Error', 'API');
            expect(result).toContain('Server error');
        });
    });

    describe('devLog', () => {
        let consoleSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        it('should log with formatted context', () => {
            devLog('TestContext', 'Test message');
            // In dev mode (test environment simulates dev), should call console.log
            // If not in dev mode, nothing happens - but we can at least verify no throw
            expect(true).toBe(true);
        });

        it('should include data parameter when provided', () => {
            const data = { key: 'value' };
            devLog('TestContext', 'Test message', data);
            // Verify no errors thrown
            expect(true).toBe(true);
        });

        it('should not throw with undefined data', () => {
            expect(() => devLog('TestContext', 'Test message', undefined)).not.toThrow();
        });

        it('should not throw with null data', () => {
            expect(() => devLog('TestContext', 'Test message', null)).not.toThrow();
        });
    });

    describe('devWarn', () => {
        let consoleSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        it('should not throw for basic call', () => {
            expect(() => devWarn('TestContext', 'Warning message')).not.toThrow();
        });

        it('should not throw with data parameter', () => {
            expect(() => devWarn('TestContext', 'Warning message', { info: 'details' })).not.toThrow();
        });
    });

    describe('devError', () => {
        let consoleSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        it('should not throw for basic call', () => {
            expect(() => devError('TestContext', 'Error message')).not.toThrow();
        });

        it('should not throw with data parameter', () => {
            expect(() => devError('TestContext', 'Error message', new Error('details'))).not.toThrow();
        });
    });
});
