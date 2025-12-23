import { config } from '../../config';
import {
    sanitizeErrorMessage,
    ValidationError,
} from '../../../utils/security';
import { fetchWithTimeout } from './utils';
import type { HandshakePollResponse, GitHubUser } from './types';

// Development mode flag for verbose logging
const IS_DEV = import.meta.env?.DEV ?? false;



let cachedUserProfile: GitHubUser | null = null;



export function getInstallUrl(sessionId: string): string {
    return `https://github.com/apps/${config.GITHUB_APP_SLUG}/installations/new?state=${sessionId}`;
}



export async function pollHandshake(sessionId: string): Promise<HandshakePollResponse> {
    const response = await fetch(`${config.BACKEND_BASE_URL}/api/handshake/poll`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
    });

    if (response.status === 202) {
        return { status: 'pending' };
    }

    if (!response.ok) {
        throw new Error(`Handshake poll failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
        status: 'ready',
        deviceToken: data.deviceToken,
        expiration: data.expiration,
    };
}



export async function getInstallationToken(
    deviceToken: string
): Promise<{ accessToken: string; validUntil: string; newDeviceToken?: string }> {
    if (!deviceToken || typeof deviceToken !== 'string') {
        throw new ValidationError('deviceToken', 'Device token is required');
    }

    const response = await fetchWithTimeout(`${config.BACKEND_BASE_URL}/api/auth/token`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${deviceToken}`,
        },
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Device token is invalid or expired. Please re-authenticate.');
        }

        const errorText = await response.text();
        console.error('Failed to get installation token. Status:', response.status);
        if (IS_DEV) {
            console.debug('Error details:', sanitizeErrorMessage(errorText));
        }

        let errorMessage = errorText;
        try {
            const json = JSON.parse(errorText);
            errorMessage = json.message || json.error || JSON.stringify(json);
        } catch {
            errorMessage = errorText || response.statusText;
        }

        throw new Error(`Failed to get installation token: ${sanitizeErrorMessage(errorMessage)}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.accessToken || typeof data.accessToken !== 'string') {
        throw new Error('Invalid token response from server');
    }

    const validUntil = data.validUntil || data.expiresAt;
    if (!validUntil || typeof validUntil !== 'string') {
        throw new Error('Invalid token expiry in response');
    }

    if (data.accessToken.length < 20) {
        throw new Error('Received malformed access token');
    }

    const newDeviceToken = response.headers.get('X-New-Device-Token');

    return {
        accessToken: data.accessToken,
        validUntil,
        newDeviceToken: newDeviceToken || undefined,
    };
}



export async function revokeDeviceToken(deviceToken: string): Promise<void> {
    const response = await fetch(`${config.BACKEND_BASE_URL}/api/auth/token`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${deviceToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to revoke device token: ${response.statusText}`);
    }
}



export async function getUserProfile(
    accessToken: string,
    fallbackLogin?: string
): Promise<GitHubUser> {
    if (cachedUserProfile) return cachedUserProfile;

    try {
        // Optimization: GitHub App Installation tokens (starting with 'ghs_') cannot access /user
        // We skip the request to avoid a guaranteed 403 Forbidden error in the console.
        let isForbidden = accessToken.startsWith('ghs_');

        if (!isForbidden) {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });

            if (response.ok) {
                const data = await response.json();
                cachedUserProfile = {
                    id: data.id,
                    login: data.login,
                    name: data.name,
                    email: data.email,
                };
                return cachedUserProfile;
            }

            if (response.status === 403) {
                isForbidden = true;
            }
        }

        if (isForbidden && fallbackLogin) {
            console.warn(
                'Access to /user forbidden (likely installation token). Using repo owner as fallback.'
            );
            const publicResp = await fetch(`https://api.github.com/users/${fallbackLogin}`, {
                headers: {
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });

            if (publicResp.ok) {
                const data = await publicResp.json();
                if (data.type === 'User') {
                    cachedUserProfile = {
                        id: data.id,
                        login: data.login,
                        name: data.name,
                        email: data.email,
                    };
                    return cachedUserProfile;
                }
            }
        }
    } catch (e) {
        console.warn('Failed to fetch user profile, using placeholder.', e);
    }

    console.warn('Using placeholder identity for commit author.');
    cachedUserProfile = {
        id: 0,
        login: 'user',
        name: 'AnalyGits User',
        email: 'user@analygits.local',
    };
    return cachedUserProfile;
}

export function clearCachedUserProfile(): void {
    cachedUserProfile = null;
}