# Privacy Policy

**Effective Date:** December 2025  
**Last Updated:** December 2025

## Overview

AnalyGits ("the Extension") is a Chrome extension that provides version control functionality for SAP Analytics Cloud. This privacy policy explains what data the Extension accesses, how it's used, and how it's protected.

## Data We Access

### SAP Analytics Cloud Data

The Extension accesses SAC story content when you explicitly request it by clicking "Fetch Story." This includes:
- Story scripts (global variables, script objects, widget events)
- Story metadata (name, description, page structure)
- Story IDs visible in the URL

**How it's used:** This data is compared against your GitHub repository to show differences and enable version control operations.

**Where it's stored:** SAC story content is processed locally in your browser and transmitted only to your selected GitHub repository when you explicitly commit changes.

### GitHub Data

When you connect to GitHub, the Extension accesses:
- Repository names and branch information for repositories where you've installed the GitHub App
- File contents in repositories you select for version control
- Your GitHub username (for commit attribution)

**How it's used:** To display available repositories, show diff comparisons, and create commits on your behalf.

**Where it's stored:** GitHub data is processed locally in your browser. Commits are stored in your GitHub repository.

### Authentication Data

The Extension stores:
- **Device tokens** (encrypted, in `chrome.storage.local`) — Used to authenticate with the AnalyGits backend
- **Session tokens** (in `chrome.storage.session`) — Short-lived tokens cleared when Chrome closes

**How it's used:** To authenticate API requests without requiring repeated logins.

**Where it's stored:** Locally in your browser's extension storage. Never transmitted except to the AnalyGits backend for authentication purposes.

## Data We Do NOT Collect

- **Personal information** — We don't collect names, email addresses, or demographic data
- **Browsing history** — We don't track which websites you visit
- **Analytics or telemetry** — We don't send usage data to third-party analytics services
- **SAC credentials** — We never access or store your SAP Analytics Cloud login credentials

## Third-Party Services

### AnalyGits Backend (api.analygits.com)

Our backend service handles:
- GitHub App authentication flow
- Token exchange and refresh
- Premium feature verification (future)

The backend does not store your SAC story content or GitHub file contents.

### GitHub

When you connect AnalyGits to GitHub, you're authorizing a GitHub App to access repositories on your behalf. GitHub's privacy policy applies to data stored in your repositories: https://docs.github.com/en/site-policy/privacy-policies

## Data Security

We implement multiple security measures:
- **HTTPS only** — All API communications use TLS encryption
- **Token isolation** — Session tokens are stored separately from persistent tokens
- **Minimal permissions** — The Extension only requests permissions necessary for core functionality
- **No remote code** — All Extension code runs locally; no external scripts are loaded

## Data Retention

- **Local storage:** Data persists until you uninstall the Extension or clear browser data
- **Session storage:** Cleared when you close Chrome
- **GitHub commits:** Retained according to your repository settings

## Your Rights

You can:
- **Disconnect GitHub** at any time via the Extension settings
- **Revoke access** by uninstalling the GitHub App from your GitHub settings
- **Delete local data** by uninstalling the Extension or clearing Chrome extension data
- **Request data deletion** from our backend by contacting us (see below)

## Children's Privacy

AnalyGits is not intended for users under 13 years of age. We do not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy as the Extension evolves. Significant changes will be noted in the Extension's changelog and Chrome Web Store listing.

## Contact

For privacy questions or data deletion requests:
- **GitHub Issues:** https://github.com/JariPie/analygits/issues
- **Email:** [jari@pietsch.solutions](mailto:jari@pietsch.solutions)

## Chrome Web Store Compliance

This Extension complies with the [Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/), including:
- Limited use of permissions to core functionality
- Clear disclosure of data practices
- No sale of user data to third parties