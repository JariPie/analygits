/**
 * Centralized Error Handling Utilities
 * 
 * Provides environment-aware logging and user-friendly error messages.
 * Uses existing security utilities for sanitization.
 */

import { sanitizeErrorMessage, createUserFriendlyError } from './security';

// Environment detection (reuse pattern from AuthContext)
const IS_DEV = typeof chrome !== 'undefined' &&
    chrome.runtime?.getManifest &&
    !('update_url' in chrome.runtime.getManifest());

export function handleError(error: unknown, context: string): string {
    if (IS_DEV) {
        console.error(`[${context}]`, sanitizeErrorMessage(error));
    }
    return createUserFriendlyError(error, context);
}

export function devLog(context: string, message: string, data?: unknown): void {
    if (IS_DEV) {
        if (data !== undefined) {
            console.log(`[${context}] ${message}`, data);
        } else {
            console.log(`[${context}] ${message}`);
        }
    }
}

export function devWarn(context: string, message: string, data?: unknown): void {
    if (IS_DEV) {
        if (data !== undefined) {
            console.warn(`[${context}] ${message}`, data);
        } else {
            console.warn(`[${context}] ${message}`);
        }
    }
}

/**
 * Development-only console.error wrapper.
 * Note: For actual errors in production, use handleError() instead.
 */
export function devError(context: string, message: string, data?: unknown): void {
    if (IS_DEV) {
        if (data !== undefined) {
            console.error(`[${context}] ${message}`, data);
        } else {
            console.error(`[${context}] ${message}`);
        }
    }
}
