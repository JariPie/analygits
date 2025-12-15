// Configuration for the AnalyGits Extension
// These values should be set by the user or via environment variables during build.

export const config = {
    // Your GitHub App Slug (from the app's settings URL: github.com/apps/<slug>)
    GITHUB_APP_SLUG: 'analygits', // Replace with your actual app slug

    // Your backend base URL (the service handling token exchange)
    BACKEND_BASE_URL: 'https://your-backend.example.com', // Replace with your actual backend URL

    // Default branch for commits (can be changed later per-repo)
    DEFAULT_BRANCH: 'main',

    // Polling configuration for the handshake
    HANDSHAKE_POLL_INTERVAL_MS: 2000,
    HANDSHAKE_POLL_MAX_ATTEMPTS: 60,
};

export type Config = typeof config;
