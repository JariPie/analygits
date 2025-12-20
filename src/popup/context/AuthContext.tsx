import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getInstallationToken, revokeDeviceToken, clearCachedUserProfile, type Repository } from '../services/githubService';
import { config } from '../config';
import { isTokenExpired, isValidTokenFormat, sanitizeStorageForLogging } from './../../utils/security';

// ============================================================================
// TYPES
// ============================================================================

type AuthStatus = 'idle' | 'starting' | 'polling' | 'connected' | 'error';

interface AuthState {
    status: AuthStatus;
    deviceToken: string | null;
    deviceTokenExpiry: string | null;
    accessToken: string | null;
    accessTokenExpiry: string | null;
    selectedRepo: Repository | null;
    branch: string;
    error: string | null;
}

interface AuthContextValue extends AuthState {
    startLogin: () => void;
    logout: () => Promise<void>;
    getAccessToken: () => Promise<string>;
    selectRepo: (repo: Repository | null) => void;
    setBranch: (branch: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// Storage key for persistent auth (device token, repo selection)
const PERSISTENT_STORAGE_KEY = 'analygits_auth';

// Storage key for ephemeral auth (access token) - uses session storage when available
const SESSION_STORAGE_KEY = 'analygits_session';

// Environment detection
const IS_DEV = typeof chrome !== 'undefined' &&
    chrome.runtime?.getManifest &&
    !('update_url' in chrome.runtime.getManifest());

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

function debugLog(message: string, data?: unknown): void {
    if (IS_DEV) {
        if (data !== undefined) {
            // Sanitize sensitive data before logging
            const sanitized = typeof data === 'object' && data !== null
                ? sanitizeStorageForLogging(data as Record<string, unknown>)
                : data;
            console.log(`[Auth] ${message}`, sanitized);
        } else {
            console.log(`[Auth] ${message}`);
        }
    }
}

// ============================================================================
// SESSION STORAGE HELPERS
// ============================================================================

/**
 * Chrome MV3 introduced chrome.storage.session for ephemeral storage
 * that clears when the browser closes.
 */
async function getSessionStorage(): Promise<{ accessToken?: string; accessTokenExpiry?: string }> {
    return new Promise((resolve) => {
        // Check if session storage is available (Chrome 102+)
        if (chrome.storage.session) {
            chrome.storage.session.get([SESSION_STORAGE_KEY], (result) => {
                resolve(result[SESSION_STORAGE_KEY] || {});
            });
        } else {
            // Fallback: keep in memory only (access token will be re-fetched)
            resolve({});
        }
    });
}

async function setSessionStorage(data: { accessToken?: string; accessTokenExpiry?: string }): Promise<void> {
    return new Promise((resolve) => {
        if (chrome.storage.session) {
            chrome.storage.session.set({ [SESSION_STORAGE_KEY]: data }, () => {
                resolve();
            });
        } else {
            // Fallback: no-op, token stays in memory only
            resolve();
        }
    });
}

async function clearSessionStorage(): Promise<void> {
    return new Promise((resolve) => {
        if (chrome.storage.session) {
            chrome.storage.session.remove([SESSION_STORAGE_KEY], () => {
                resolve();
            });
        } else {
            resolve();
        }
    });
}

// ============================================================================
// PROVIDER
// ============================================================================

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<AuthState>({
        status: 'idle',
        deviceToken: null,
        deviceTokenExpiry: null,
        accessToken: null,
        accessTokenExpiry: null,
        selectedRepo: null,
        branch: config.DEFAULT_BRANCH,
        error: null,
    });

    const pollingRef = useRef<number | null>(null);

    // ========================================================================
    // LOAD FROM STORAGE ON MOUNT
    // ========================================================================

    useEffect(() => {
        const loadAuth = async () => {
            // 1. Load persistent data (device token, repo)
            chrome.storage.local.get([PERSISTENT_STORAGE_KEY], async (result) => {
                debugLog('Loading persistent auth', result);

                if (result[PERSISTENT_STORAGE_KEY]) {
                    const stored = result[PERSISTENT_STORAGE_KEY] as Partial<AuthState>;

                    // Validate device token format before using
                    if (stored.deviceToken && !isValidTokenFormat(stored.deviceToken)) {
                        console.warn('[Auth] Invalid device token format in storage, clearing');
                        chrome.storage.local.remove([PERSISTENT_STORAGE_KEY]);
                        return;
                    }

                    // Check if device token is expired
                    if (stored.deviceTokenExpiry && isTokenExpired(stored.deviceTokenExpiry)) {
                        debugLog('Device token expired, clearing');
                        chrome.storage.local.remove([PERSISTENT_STORAGE_KEY]);
                        return;
                    }

                    const newStatus = stored.deviceToken ? 'connected' : 'idle';

                    setState(prev => ({
                        ...prev,
                        deviceToken: stored.deviceToken || null,
                        deviceTokenExpiry: stored.deviceTokenExpiry || null,
                        selectedRepo: stored.selectedRepo || null,
                        branch: stored.branch || config.DEFAULT_BRANCH,
                        status: newStatus,
                    }));

                    // 2. Try to load session data (access token)
                    const sessionData = await getSessionStorage();
                    if (sessionData.accessToken && !isTokenExpired(sessionData.accessTokenExpiry)) {
                        setState(prev => ({
                            ...prev,
                            accessToken: sessionData.accessToken || null,
                            accessTokenExpiry: sessionData.accessTokenExpiry || null,
                        }));
                    }
                }
            });
        };

        loadAuth();
    }, []);

    // ========================================================================
    // PERSIST TO STORAGE ON CHANGE
    // ========================================================================

    useEffect(() => {
        if (state.deviceToken || state.selectedRepo) {
            // Only persist non-sensitive data to local storage
            const persistentData = {
                deviceToken: state.deviceToken,
                deviceTokenExpiry: state.deviceTokenExpiry,
                selectedRepo: state.selectedRepo,
                branch: state.branch,
                // Note: accessToken is NOT persisted here
            };

            debugLog('Saving persistent auth');

            chrome.storage.local.set({
                [PERSISTENT_STORAGE_KEY]: persistentData,
            });
        }
    }, [state.deviceToken, state.deviceTokenExpiry, state.selectedRepo, state.branch]);

    // Persist access token to session storage (ephemeral)
    useEffect(() => {
        if (state.accessToken) {
            setSessionStorage({
                accessToken: state.accessToken,
                accessTokenExpiry: state.accessTokenExpiry || undefined,
            });
        }
    }, [state.accessToken, state.accessTokenExpiry]);

    // ========================================================================
    // START LOGIN FLOW
    // ========================================================================

    const startLogin = useCallback(() => {
        setState(prev => ({ ...prev, status: 'starting', error: null }));

        chrome.runtime.sendMessage({ type: "GITHUB_CONNECT_START" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[Auth] Failed to start connect flow:", chrome.runtime.lastError);
                setState(prev => ({
                    ...prev,
                    status: 'error',
                    error: 'Failed to start authentication. Please try again.'
                }));
            } else {
                debugLog("Background flow started", response);
            }
        });
    }, []);

    // ========================================================================
    // LOGOUT
    // ========================================================================

    const logout = useCallback(async () => {
        // Clear cached user profile first to prevent stale data on re-login
        clearCachedUserProfile();

        if (pollingRef.current) {
            clearTimeout(pollingRef.current);
        }

        // Attempt to revoke device token on backend
        if (state.deviceToken) {
            try {
                await revokeDeviceToken(state.deviceToken);
            } catch (err) {
                // Log but don't block logout
                console.warn('[Auth] Failed to revoke device token:', err);
            }
        }

        // Clear state
        setState({
            status: 'idle',
            deviceToken: null,
            deviceTokenExpiry: null,
            accessToken: null,
            accessTokenExpiry: null,
            selectedRepo: null,
            branch: config.DEFAULT_BRANCH,
            error: null,
        });

        // Clear all storage
        chrome.storage.local.remove([PERSISTENT_STORAGE_KEY, 'githubConnectState']);
        await clearSessionStorage();

        debugLog('Logout complete');
    }, [state.deviceToken]);

    // ========================================================================
    // GET ACCESS TOKEN (with caching, validation, and rotation)
    // ========================================================================

    const getAccessToken = useCallback(async (): Promise<string> => {
        // Check if cached token is still valid
        if (state.accessToken && state.accessTokenExpiry) {
            if (!isTokenExpired(state.accessTokenExpiry, 60000)) { // 1 minute buffer
                return state.accessToken;
            }
            debugLog('Access token expired, refreshing');
        }

        if (!state.deviceToken) {
            throw new Error('Not authenticated. Please connect to GitHub.');
        }

        // Validate device token format
        if (!isValidTokenFormat(state.deviceToken)) {
            // Invalid token, clear and require re-auth
            await logout();
            throw new Error('Invalid authentication state. Please reconnect to GitHub.');
        }

        const { accessToken, validUntil, newDeviceToken } = await getInstallationToken(state.deviceToken);

        // Validate received token
        if (!isValidTokenFormat(accessToken)) {
            throw new Error('Received invalid access token from server.');
        }

        setState(prev => ({
            ...prev,
            accessToken,
            accessTokenExpiry: validUntil,
            // Handle token rotation
            deviceToken: newDeviceToken || prev.deviceToken,
        }));

        return accessToken;
    }, [state.accessToken, state.accessTokenExpiry, state.deviceToken, logout]);

    // ========================================================================
    // REPO & BRANCH SELECTION
    // ========================================================================

    const selectRepo = useCallback((repo: Repository | null) => {
        setState(prev => ({
            ...prev,
            selectedRepo: repo,
            branch: repo?.default_branch || config.DEFAULT_BRANCH,
        }));
    }, []);

    const setBranch = useCallback((branch: string) => {
        // Basic validation - more thorough validation happens in security.ts
        const sanitized = branch.trim();
        if (sanitized.length > 0 && sanitized.length <= 255) {
            setState(prev => ({ ...prev, branch: sanitized }));
        }
    }, []);

    // ========================================================================
    // CLEANUP
    // ========================================================================

    useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearTimeout(pollingRef.current);
            }
        };
    }, []);

    // ========================================================================
    // STORAGE CHANGE LISTENERS
    // ========================================================================

    useEffect(() => {
        const handleStorageChange = (
            changes: { [key: string]: chrome.storage.StorageChange },
            areaName: string
        ) => {
            if (areaName !== 'local') return;

            // Auth Success from background
            if (changes[PERSISTENT_STORAGE_KEY]) {
                const newValue = changes[PERSISTENT_STORAGE_KEY].newValue as Partial<AuthState>;
                debugLog('Storage changed (Auth)', { hasToken: !!newValue?.deviceToken });

                if (newValue) {
                    setState(prev => ({
                        ...prev,
                        deviceToken: newValue.deviceToken || null,
                        deviceTokenExpiry: newValue.deviceTokenExpiry || null,
                        selectedRepo: newValue.selectedRepo || null,
                        branch: newValue.branch || config.DEFAULT_BRANCH,
                        status: newValue.deviceToken ? 'connected' : 'idle',
                        error: null
                    }));
                }
            }

            // Connection Status (Polling/Waiting)
            if (changes['githubConnectState']) {
                const connectState = changes['githubConnectState'].newValue as {
                    status?: string;
                    lastError?: string;
                };

                debugLog('Storage changed (ConnectState)', { status: connectState?.status });

                if (connectState && !state.deviceToken) {
                    let uiStatus: AuthStatus = 'idle';
                    if (['starting', 'waiting-for-install', 'polling'].includes(connectState.status || '')) {
                        uiStatus = 'polling';
                    } else if (connectState.status === 'connected') {
                        uiStatus = 'connected';
                    } else if (connectState.status === 'error') {
                        uiStatus = 'error';
                    }

                    setState(prev => {
                        if (prev.status === 'connected') return prev;
                        return { ...prev, status: uiStatus, error: connectState.lastError || null };
                    });
                }
            }
        };

        const handleMessage = (message: { type?: string; payload?: unknown }) => {
            if (message.type === "GITHUB_CONNECT_STATUS") {
                const payload = message.payload as { status?: string; lastError?: string };
                debugLog("Received Connect Status", { status: payload?.status });

                if (!state.deviceToken && payload) {
                    let uiStatus: AuthStatus = 'idle';
                    if (['starting', 'waiting-for-install', 'polling'].includes(payload.status || '')) {
                        uiStatus = 'polling';
                    } else if (payload.status === 'connected') {
                        uiStatus = 'connected';
                    } else if (payload.status === 'error') {
                        uiStatus = 'error';
                    }

                    setState(prev => {
                        if (prev.status === 'connected') return prev;
                        return { ...prev, status: uiStatus, error: payload.lastError || null };
                    });
                }
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        chrome.runtime.onMessage.addListener(handleMessage);

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
            chrome.runtime.onMessage.removeListener(handleMessage);
        };
    }, [state.deviceToken]);

    // ========================================================================
    // CONTEXT VALUE
    // ========================================================================

    const value: AuthContextValue = {
        ...state,
        startLogin,
        logout,
        getAccessToken,
        selectRepo,
        setBranch,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ============================================================================
// HOOK
// ============================================================================

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}