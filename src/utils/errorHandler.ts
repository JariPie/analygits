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

/**
 * Handle an error consistently: log in dev mode, return user-friendly message.
 * 
 * @param error - The caught error (unknown type from catch block)
 * @param context - Context string for logging (e.g., 'Revert', 'Push')
 * @returns User-friendly error message
 */
export function handleError(error: unknown, context: string): string {
    if (IS_DEV) {
        console.error(`[${context}]`, sanitizeErrorMessage(error));
    }
    return createUserFriendlyError(error, context);
}

/**
 * Development-only console.log wrapper.
 * Uses a consistent format: [context] message data
 * 
 * @param context - Module or component name
 * @param message - Log message
 * @param data - Optional data to log
 */
export function devLog(context: string, message: string, data?: unknown): void {
    if (IS_DEV) {
        if (data !== undefined) {
            console.log(`[${context}] ${message}`, data);
        } else {
            console.log(`[${context}] ${message}`);
        }
    }
}

/**
 * Development-only console.warn wrapper.
 * 
 * @param context - Module or component name
 * @param message - Warning message
 * @param data - Optional data to log
 */
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
 * 
 * @param context - Module or component name
 * @param message - Error message
 * @param data - Optional data to log
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
