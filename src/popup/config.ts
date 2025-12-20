// Configuration for the AnalyGits Extension

export const config = {
    GITHUB_APP_SLUG: 'analygitsapp',
    BACKEND_BASE_URL: 'https://api.analygits.com',
    DEFAULT_BRANCH: 'main',

    // Polling configuration for the handshake (5 minutes max)
    HANDSHAKE_POLL_INTERVAL_MS: 2000,
    HANDSHAKE_POLL_MAX_ATTEMPTS: 150, // 5 minutes (2s * 150)
};

export type Config = typeof config;
