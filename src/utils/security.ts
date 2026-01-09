/**
 * Security Utilities for AnalyGits
 * 
 * This module provides:
 * - Input validation for GitHub parameters
 * - Sanitized error handling
 * - Secure fetch wrapper with timeout
 * - Token validation utilities
 */

/**
 * Valid GitHub username/org pattern
 * Rules: 1-39 chars, alphanumeric + hyphens, no consecutive hyphens, 
 * cannot start/end with hyphen
 */
const GITHUB_OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

/**
 * Valid GitHub repository name pattern
 * Rules: 1-100 chars, alphanumeric + hyphens + underscores + dots
 * Cannot be just dots, cannot start with dot
 */
const GITHUB_REPO_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,99}$/;

/**
 * Valid Git branch name pattern
 * Rules: No spaces, no special chars except /-_, no consecutive dots,
 * cannot start with -, cannot end with .lock
 */
export const GIT_BRANCH_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\.lock$)[a-zA-Z0-9/_-]{1,255}$/;

/**
 * Valid SHA pattern (Git commit/blob SHA)
 */
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;

export interface ValidationResult {
    valid: boolean;
    error?: string;
    sanitized?: string;
}


export function validateGitHubOwner(owner: string): ValidationResult {
    if (!owner || typeof owner !== 'string') {
        return { valid: false, error: 'Owner is required' };
    }

    const trimmed = owner.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Owner cannot be empty' };
    }

    if (trimmed.length > 39) {
        return { valid: false, error: 'Owner name too long (max 39 characters)' };
    }

    if (!GITHUB_OWNER_PATTERN.test(trimmed)) {
        return {
            valid: false,
            error: 'Invalid owner name. Use only letters, numbers, and single hyphens.'
        };
    }

    return { valid: true, sanitized: trimmed };
}


export function validateGitHubRepo(repo: string): ValidationResult {
    if (!repo || typeof repo !== 'string') {
        return { valid: false, error: 'Repository name is required' };
    }

    const trimmed = repo.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Repository name cannot be empty' };
    }

    if (trimmed.length > 100) {
        return { valid: false, error: 'Repository name too long (max 100 characters)' };
    }

    // Reject reserved names
    const reserved = ['.', '..', '.git'];
    if (reserved.includes(trimmed.toLowerCase())) {
        return { valid: false, error: 'Invalid repository name' };
    }

    if (!GITHUB_REPO_PATTERN.test(trimmed)) {
        return {
            valid: false,
            error: 'Invalid repository name. Use only letters, numbers, hyphens, underscores, and dots.'
        };
    }

    return { valid: true, sanitized: trimmed };
}


export function validateGitBranch(branch: string): ValidationResult {
    if (!branch || typeof branch !== 'string') {
        return { valid: false, error: 'Branch name is required' };
    }

    const trimmed = branch.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Branch name cannot be empty' };
    }

    if (trimmed.length > 255) {
        return { valid: false, error: 'Branch name too long (max 255 characters)' };
    }

    // Check for path traversal attempts
    if (trimmed.includes('..') || trimmed.startsWith('/') || trimmed.endsWith('/')) {
        return { valid: false, error: 'Invalid branch name format' };
    }

    if (!GIT_BRANCH_PATTERN.test(trimmed)) {
        return {
            valid: false,
            error: 'Invalid branch name. Use only letters, numbers, hyphens, underscores, and slashes.'
        };
    }

    return { valid: true, sanitized: trimmed };
}


export function validateGitSha(sha: string): ValidationResult {
    if (!sha || typeof sha !== 'string') {
        return { valid: false, error: 'SHA is required' };
    }

    const trimmed = sha.trim().toLowerCase();

    if (!GIT_SHA_PATTERN.test(trimmed)) {
        return { valid: false, error: 'Invalid SHA format' };
    }

    return { valid: true, sanitized: trimmed };
}


export function validateGitHubParams(params: {
    owner?: string;
    repo?: string;
    branch?: string;
    sha?: string;
}): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (params.owner !== undefined) {
        const result = validateGitHubOwner(params.owner);
        if (!result.valid && result.error) {
            errors.push(`Owner: ${result.error}`);
        }
    }

    if (params.repo !== undefined) {
        const result = validateGitHubRepo(params.repo);
        if (!result.valid && result.error) {
            errors.push(`Repo: ${result.error}`);
        }
    }

    if (params.branch !== undefined) {
        const result = validateGitBranch(params.branch);
        if (!result.valid && result.error) {
            errors.push(`Branch: ${result.error}`);
        }
    }

    if (params.sha !== undefined) {
        const result = validateGitSha(params.sha);
        if (!result.valid && result.error) {
            errors.push(`SHA: ${result.error}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Patterns that indicate sensitive information in error messages
 */
const SENSITIVE_PATTERNS = [
    /Bearer [a-zA-Z0-9_-]+/gi,           // Bearer tokens
    /ghp_[a-zA-Z0-9]{36}/gi,             // GitHub PATs
    /ghs_[a-zA-Z0-9]{36}/gi,             // GitHub App tokens
    /ghu_[a-zA-Z0-9]{36}/gi,             // GitHub user tokens
    /token[=:]\s*['"]?[a-zA-Z0-9_-]+/gi, // Generic tokens
    /[a-f0-9]{64}/gi,                    // Potential secrets (64 char hex)
    /password[=:]\s*['"]?[^\s'"]+/gi,    // Passwords
];


export function sanitizeErrorMessage(error: unknown): string {
    let message: string;

    if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'string') {
        message = error;
    } else {
        message = 'An unexpected error occurred';
    }

    // Remove sensitive patterns
    let sanitized = message;
    for (const pattern of SENSITIVE_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    // Truncate very long messages
    if (sanitized.length > 500) {
        sanitized = sanitized.substring(0, 500) + '...';
    }

    return sanitized;
}


export function createUserFriendlyError(error: unknown, context?: string): string {
    const sanitized = sanitizeErrorMessage(error);

    // Map common error patterns to user-friendly messages
    const errorMappings: [RegExp, string][] = [
        [/401|unauthorized/i, 'Authentication failed. Please reconnect to GitHub.'],
        [/403|forbidden/i, 'Access denied. Check your repository permissions.'],
        [/404|not found/i, 'Resource not found. Please verify the repository and branch exist.'],
        [/422|unprocessable/i, 'Invalid request. Please check your input.'],
        [/429|rate limit/i, 'Rate limit exceeded. Please wait a moment and try again.'],
        [/500|internal server/i, 'Server error. Please try again later.'],
        [/network|fetch|cors/i, 'Network error. Please check your connection.'],
        [/timeout/i, 'Request timed out. Please try again.'],
    ];

    for (const [pattern, friendlyMessage] of errorMappings) {
        if (pattern.test(sanitized)) {
            return friendlyMessage;
        }
    }

    // If no mapping found, return sanitized message with optional context
    if (context) {
        return `${context}: ${sanitized}`;
    }

    return sanitized;
}


export class ValidationError extends Error {
    public readonly field: string;
    public readonly code: string;

    constructor(field: string, message: string, code = 'VALIDATION_ERROR') {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.code = code;
    }
}


export class ApiError extends Error {
    public readonly status: number;
    public readonly userMessage: string;

    constructor(status: number, message: string, context?: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.userMessage = createUserFriendlyError(message, context);
    }
}



export interface SecureFetchOptions extends RequestInit {
    timeout?: number;
    validateUrl?: boolean;
}


const ALLOWED_GITHUB_DOMAINS = [
    'api.github.com',
];


const ALLOWED_BACKEND_DOMAINS = [
    'api.analygits.com',
];


export function isAllowedGitHubUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' &&
            ALLOWED_GITHUB_DOMAINS.includes(parsed.hostname);
    } catch {
        return false;
    }
}


export function isAllowedBackendUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' &&
            ALLOWED_BACKEND_DOMAINS.includes(parsed.hostname);
    } catch {
        return false;
    }
}


export async function secureFetch(
    url: string,
    options: SecureFetchOptions = {}
): Promise<Response> {
    const { timeout = 30000, validateUrl = true, ...fetchOptions } = options;

    // Validate URL if requested
    if (validateUrl) {
        if (!isAllowedGitHubUrl(url) && !isAllowedBackendUrl(url)) {
            throw new Error('URL not in security allowlist');
        }
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
        });

        return response;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Checks if a token appears to be expired based on its expiry time
 */
export function isTokenExpired(expiryTime: string | number | null | undefined, bufferMs = 60000): boolean {
    if (!expiryTime) return true;

    const expiry = typeof expiryTime === 'string' ? new Date(expiryTime).getTime() : expiryTime;
    const now = Date.now();

    return expiry - now < bufferMs;
}


export function isValidTokenFormat(token: string | null | undefined): boolean {
    if (!token || typeof token !== 'string') return false;

    // Minimum length check
    if (token.length < 20) return false;

    // Should be alphanumeric with some special chars
    if (!/^[a-zA-Z0-9_-]+$/.test(token)) return false;

    return true;
}


export function maskToken(token: string | null | undefined): string {
    if (!token) return '(none)';
    if (token.length <= 8) return '***';
    return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}

/**
 * Keys that should never be logged or exposed
 */
const SENSITIVE_STORAGE_KEYS = ['deviceToken', 'accessToken', 'token', 'secret'];


export function sanitizeStorageForLogging(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
        if (SENSITIVE_STORAGE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
            sanitized[key] = value ? '[PRESENT]' : '[EMPTY]';
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeStorageForLogging(value as Record<string, unknown>);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}