import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
    generateSessionId,
    getInstallUrl,
    pollHandshake,
    getInstallationToken,
    revokeDeviceToken,
    type Repository,
} from '../services/githubService';
import { config } from '../config';

// --- Types ---

type AuthStatus = 'idle' | 'polling' | 'connected' | 'error';

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

const AuthContext = createContext<AuthContextValue | null>(null);

// --- Storage Keys ---

const STORAGE_KEY = 'analygits_auth';

// --- Provider ---

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
    const sessionIdRef = useRef<string | null>(null);

    // Load from storage on mount
    useEffect(() => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            if (result[STORAGE_KEY]) {
                const stored = result[STORAGE_KEY] as Partial<AuthState>;
                setState(prev => ({
                    ...prev,
                    deviceToken: stored.deviceToken || null,
                    deviceTokenExpiry: stored.deviceTokenExpiry || null,
                    selectedRepo: stored.selectedRepo || null,
                    branch: stored.branch || config.DEFAULT_BRANCH,
                    status: stored.deviceToken ? 'connected' : 'idle',
                }));
            }
        });
    }, []);

    // Persist to storage on change
    useEffect(() => {
        if (state.deviceToken || state.selectedRepo) {
            chrome.storage.local.set({
                [STORAGE_KEY]: {
                    deviceToken: state.deviceToken,
                    deviceTokenExpiry: state.deviceTokenExpiry,
                    selectedRepo: state.selectedRepo,
                    branch: state.branch,
                },
            });
        }
    }, [state.deviceToken, state.deviceTokenExpiry, state.selectedRepo, state.branch]);

    // --- Start Login Flow ---
    const startLogin = useCallback(() => {
        const sessionId = generateSessionId();
        sessionIdRef.current = sessionId;

        // Open GitHub install URL
        const installUrl = getInstallUrl(sessionId);
        window.open(installUrl, '_blank');

        setState(prev => ({ ...prev, status: 'polling', error: null }));

        // Start polling with exponential backoff
        let attempt = 0;
        let delay = config.HANDSHAKE_POLL_INTERVAL_MS;

        const poll = async () => {
            if (attempt >= config.HANDSHAKE_POLL_MAX_ATTEMPTS) {
                setState(prev => ({ ...prev, status: 'error', error: 'Handshake timed out. Please try again.' }));
                return;
            }

            try {
                const response = await pollHandshake(sessionId);

                if (response.status === 'ready' && response.deviceToken) {
                    setState(prev => ({
                        ...prev,
                        status: 'connected',
                        deviceToken: response.deviceToken!,
                        deviceTokenExpiry: response.expiration || null,
                        error: null,
                    }));
                    sessionIdRef.current = null;
                    return;
                }

                // Still pending, schedule next poll with backoff
                attempt++;
                if (attempt > 20) {
                    delay = Math.min(delay * 1.5, 10000); // Exponential backoff after 20 attempts
                }
                pollingRef.current = window.setTimeout(poll, delay);
            } catch (err: any) {
                setState(prev => ({ ...prev, status: 'error', error: err.message }));
            }
        };

        poll();
    }, []);

    // --- Logout ---
    const logout = useCallback(async () => {
        if (pollingRef.current) {
            clearTimeout(pollingRef.current);
        }

        if (state.deviceToken) {
            try {
                await revokeDeviceToken(state.deviceToken);
            } catch (err) {
                console.warn('Failed to revoke device token:', err);
            }
        }

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

        chrome.storage.local.remove([STORAGE_KEY]);
    }, [state.deviceToken]);

    // --- Get Access Token (with caching and rotation handling) ---
    const getAccessToken = useCallback(async (): Promise<string> => {
        // Check if cached token is still valid
        if (state.accessToken && state.accessTokenExpiry) {
            const expiryDate = new Date(state.accessTokenExpiry);
            const now = new Date();
            const bufferMs = 60 * 1000; // 1 minute buffer
            if (expiryDate.getTime() - now.getTime() > bufferMs) {
                return state.accessToken;
            }
        }

        if (!state.deviceToken) {
            throw new Error('Not authenticated. Please connect to GitHub.');
        }

        const { accessToken, validUntil, newDeviceToken } = await getInstallationToken(state.deviceToken);

        setState(prev => ({
            ...prev,
            accessToken,
            accessTokenExpiry: validUntil,
            // Handle token rotation
            deviceToken: newDeviceToken || prev.deviceToken,
        }));

        return accessToken;
    }, [state.accessToken, state.accessTokenExpiry, state.deviceToken]);

    // --- Select Repo ---
    const selectRepo = useCallback((repo: Repository | null) => {
        setState(prev => ({
            ...prev,
            selectedRepo: repo,
            branch: repo?.default_branch || config.DEFAULT_BRANCH,
        }));
    }, []);

    // --- Set Branch ---
    const setBranch = useCallback((branch: string) => {
        setState(prev => ({ ...prev, branch }));
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearTimeout(pollingRef.current);
            }
        };
    }, []);

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

// --- Hook ---

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
