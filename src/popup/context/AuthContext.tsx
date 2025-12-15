import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
    generateSessionId,
    getInstallUrl,
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
            console.log('🔍 Loading auth from storage, key:', STORAGE_KEY);
            console.log('📦 Raw result:', result);

            if (result[STORAGE_KEY]) {
                const stored = result[STORAGE_KEY] as Partial<AuthState>;
                console.log('✅ Found stored data:', stored);
                console.log('🔑 Has deviceToken?', !!stored.deviceToken);

                const newStatus = stored.deviceToken ? 'connected' : 'idle';
                console.log('📊 Setting status to:', newStatus);

                setState(prev => ({
                    ...prev,
                    deviceToken: stored.deviceToken || null,
                    deviceTokenExpiry: stored.deviceTokenExpiry || null,
                    selectedRepo: stored.selectedRepo || null,
                    branch: stored.branch || config.DEFAULT_BRANCH,
                    status: newStatus,
                }));
            } else {
                console.log('❌ No data found for key:', STORAGE_KEY);
            }
        });
    }, []);

    // Persist to storage on change
    useEffect(() => {
        if (state.deviceToken || state.selectedRepo) {
            const dataToSave = {
                deviceToken: state.deviceToken,
                deviceTokenExpiry: state.deviceTokenExpiry,
                selectedRepo: state.selectedRepo,
                branch: state.branch,
            };

            console.log('💾 Saving to storage, key:', STORAGE_KEY);
            console.log('💾 Data:', dataToSave);

            chrome.storage.local.set({
                [STORAGE_KEY]: dataToSave,
            }, () => {
                console.log('✅ Save complete');
                // Verify it was saved
                chrome.storage.local.get([STORAGE_KEY], (result) => {
                    console.log('🔍 Verification read:', result);
                });
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

        // Send message to background script to start polling
        // This ensures polling continues even if the popup closes
        chrome.runtime.sendMessage({
            type: "START_AUTH_POLL",
            sessionId
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Failed to start polling in background:", chrome.runtime.lastError);
                setState(prev => ({ ...prev, status: 'error', error: 'Failed to start background polling.' }));
            } else {
                console.log("🚀 Background polling started:", response);
            }
        });
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

    // Listen for storage changes (e.g. from background script)
    useEffect(() => {
        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'local' && changes[STORAGE_KEY]) {
                const newValue = changes[STORAGE_KEY].newValue as Partial<AuthState>;
                console.log('🔄 Storage changed from background:', newValue);

                if (newValue) {
                    setState(prev => ({
                        ...prev,
                        deviceToken: newValue.deviceToken || null,
                        deviceTokenExpiry: newValue.deviceTokenExpiry || null,
                        selectedRepo: newValue.selectedRepo || null,
                        branch: newValue.branch || config.DEFAULT_BRANCH,
                        status: newValue.deviceToken ? 'connected' : 'idle',
                        error: null // Clear any errors on successful update
                    }));
                }
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
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
