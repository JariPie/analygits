import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listBranches, createBranch } from '../src/popup/services/github/git';
import { ApiError, ValidationError } from '../src/utils/security';

// Mock fetchWithTimeout
vi.mock('../src/popup/services/github/utils', () => ({
    fetchWithTimeout: vi.fn(),
}));

import { fetchWithTimeout } from '../src/popup/services/github/utils';
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

describe('git API functions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('listBranches', () => {
        it('should return branches array on success', async () => {
            const mockBranches = [
                { name: 'main', protected: true },
                { name: 'develop', protected: false },
                { name: 'feature/test', protected: false },
            ];

            mockFetchWithTimeout.mockResolvedValueOnce({
                ok: true,
                json: async () => mockBranches,
            } as Response);

            const result = await listBranches('test-token', 'owner', 'repo');

            expect(result).toEqual(mockBranches);
            expect(mockFetchWithTimeout).toHaveBeenCalledWith(
                'https://api.github.com/repos/owner/repo/branches',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer test-token',
                        Accept: 'application/vnd.github+json',
                    }),
                })
            );
        });

        it('should throw ApiError on non-ok response', async () => {
            mockFetchWithTimeout.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            } as Response);

            await expect(listBranches('test-token', 'owner', 'repo')).rejects.toThrow(ApiError);
        });

        it('should throw ValidationError for invalid owner', async () => {
            await expect(listBranches('test-token', '', 'repo')).rejects.toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid repo', async () => {
            await expect(listBranches('test-token', 'owner', '')).rejects.toThrow(ValidationError);
        });
    });

    describe('createBranch', () => {
        it('should create branch and return name and sha on success', async () => {
            // Mock getRef response (first call)
            mockFetchWithTimeout.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ object: { sha: 'base-sha-123', url: 'url' } }),
            } as Response);

            // Mock create ref response (second call)
            mockFetchWithTimeout.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ object: { sha: 'new-sha-456' } }),
            } as Response);

            const result = await createBranch('test-token', 'owner', 'repo', 'new-feature', 'main');

            expect(result).toEqual({
                name: 'new-feature',
                sha: 'new-sha-456',
            });

            // Verify getRef was called first
            expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
            expect(mockFetchWithTimeout).toHaveBeenNthCalledWith(
                1,
                'https://api.github.com/repos/owner/repo/git/ref/heads/main',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer test-token',
                    }),
                })
            );

            // Verify create ref was called with correct body
            expect(mockFetchWithTimeout).toHaveBeenNthCalledWith(
                2,
                'https://api.github.com/repos/owner/repo/git/refs',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        ref: 'refs/heads/new-feature',
                        sha: 'base-sha-123',
                    }),
                })
            );
        });

        it('should throw ApiError with status 422 when branch already exists', async () => {
            // Mock getRef response
            mockFetchWithTimeout.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ object: { sha: 'base-sha-123', url: 'url' } }),
            } as Response);

            // Mock 422 conflict response (GitHub returns 422 for existing refs)
            mockFetchWithTimeout.mockResolvedValueOnce({
                ok: false,
                status: 422,
                statusText: 'Unprocessable Entity',
            } as Response);

            try {
                await createBranch('test-token', 'owner', 'repo', 'existing-branch', 'main');
                expect.fail('Expected ApiError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(ApiError);
                expect((error as ApiError).status).toBe(422);
            }
        });

        it('should throw ApiError on general error', async () => {
            // Mock getRef response
            mockFetchWithTimeout.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ object: { sha: 'base-sha-123', url: 'url' } }),
            } as Response);

            // Mock 500 error response
            mockFetchWithTimeout.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            } as Response);

            await expect(
                createBranch('test-token', 'owner', 'repo', 'new-branch', 'main')
            ).rejects.toThrow(ApiError);
        });

        it('should throw ValidationError for invalid branch name', async () => {
            await expect(
                createBranch('test-token', 'owner', 'repo', '', 'main')
            ).rejects.toThrow(ValidationError);
        });
    });
});
