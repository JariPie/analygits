# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in AnalyGits, please report it responsibly.

### How to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please report via:

1. **GitHub Security Advisories** (Preferred)
   - Go to the [Security tab](https://github.com/JariPie/analygits/security)
   - Click "Report a vulnerability"
   - Provide details using the template below

2. **Email**
   - Send to: [jari@pietsch.solutions](mailto:jari@pietsch.solutions)
   - Use subject line: `[SECURITY] AnalyGits - Brief Description`

### What to Include

Please provide as much detail as possible:

- **Description:** Clear explanation of the vulnerability
- **Impact:** What could an attacker accomplish?
- **Reproduction steps:** How to trigger the issue
- **Affected versions:** Which version(s) are impacted
- **Suggested fix:** If you have ideas for remediation

### Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Status update | Every 7 days until resolved |
| Fix released | Varies by severity (see below) |

### Severity Levels

| Severity | Description | Target Fix Time |
|----------|-------------|-----------------|
| **Critical** | Remote code execution, credential theft | 24-48 hours |
| **High** | Auth bypass, data exposure to third parties | 7 days |
| **Medium** | Limited data exposure, privilege escalation | 30 days |
| **Low** | Information disclosure with minimal impact | 90 days |

## Security Architecture

AnalyGits implements defense-in-depth security:

### Authentication & Tokens

- **GitHub OAuth** via GitHub App (not personal access tokens)
- **Device tokens** stored in `chrome.storage.local` (encrypted at rest by Chrome)
- **Session tokens** in `chrome.storage.session` (cleared on browser close)
- **No SAC credentials** ever accessed or stored

### Input Validation

- URL allowlisting for SAC domains
- Message origin validation in background worker
- Input sanitization before API calls

### Content Security Policy

- Strict CSP: `script-src 'self'; object-src 'self'`
- No inline scripts or remote code execution
- No eval() or dynamic code generation

### API Security

- All communications over HTTPS
- CSRF token handling for SAC POST requests
- Token sanitization in error logs

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | ✅ Yes    |
| < 1.0   | ❌ No (pre-release) |

We only provide security updates for the latest major version.

## Known Security Considerations

### By Design

These are intentional behaviors, not vulnerabilities:

1. **SAC session dependency:** The extension relies on existing SAC session cookies. If you're logged into SAC in your browser, the extension can access story data. This is required for functionality.

2. **GitHub repository access:** When you authorize the GitHub App, it gains access to repositories you select. This is the intended permission model.

3. **Local storage persistence:** Auth tokens persist until you explicitly disconnect or clear browser data. This enables seamless reconnection.

### Out of Scope

The following are not considered vulnerabilities in AnalyGits:

- Attacks requiring physical access to the user's machine
- Social engineering attacks
- Vulnerabilities in Chrome, SAC, or GitHub themselves
- Issues in the closed-source backend (report separately)

## Acknowledgments

We appreciate security researchers who help keep AnalyGits safe. With your permission, we'll acknowledge your contribution in:

- Release notes for the fix
- This SECURITY.md file (Hall of Fame section)
- Our GitHub repository README

### Hall of Fame

*No vulnerabilities reported yet. Be the first responsible disclosure!*

---

Thank you for helping keep AnalyGits and its users secure.