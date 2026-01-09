# AnalyGits

**Git-based version control for SAP Analytics Cloud**

AnalyGits brings modern version control to SAC story development. Track changes, view diffs, commit to GitHub, and revert when things go wrong — all from a clean Chrome extension interface.

![AnalyGits Demo](docs/images/AnalyGitsMain.png)

![AnalyGits GitHub Diff](docs/images/AnalyGitsDiff.png)

## Why AnalyGits?

SAP Analytics Cloud lacks native version control. That means:
- No way to track who changed what, and when
- No safety net when refactoring breaks something
- No code review workflow for team collaboration

AnalyGits solves this by extracting scripts and metadata from SAC stories and syncing them with GitHub — giving you the same Git workflows you use everywhere else.

## Features

- **🔍 Diff Viewer** — Side-by-side comparison of local SAC content vs. GitHub
- **📤 Push to GitHub** — Commit changes with conventional commit messages
- **⏪ Revert from GitHub** — Restore previous versions directly into SAC
- **🔐 Secure Auth** — GitHub App integration (no personal tokens stored)
- **🌍 Multi-language** — English and German UI

## Installation

### From Chrome Web Store (Recommended)

<!-- Update this link once published -->
[Install AnalyGits](https://chrome.google.com/webstore/detail/analygits/ccjmdkkckgibhbkielohlnglodeoemam)

### Manual Installation (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/analygits.git
   cd analygits
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## Quick Start

1. **Navigate to a SAC story** in your browser
2. **Click the AnalyGits icon** in your Chrome toolbar
3. **Connect to GitHub** using the "Connect" button
4. **Select a repository** where you want to store your story scripts
5. **View diffs** between your SAC story and the GitHub repository
6. **Commit changes** or **revert** to previous versions

## How It Works

```
SAC Story ──────► Extract Scripts ──────► GitHub Repository
    │                   │                        │
    │                   ▼                        │
    │              Compare Diff                  │
    │                   │                        │
    ▼                   ▼                        ▼
 Update SAC ◄────── Revert ───────────── Fetch from GitHub
```

AnalyGits extracts:
- **Global Variables** — Shared script variables across the story
- **Script Objects** — Reusable functions and modules
- **Widget Events** — Event handlers attached to UI components (onClick, onSelect, etc.)

Each script becomes a file in your GitHub repo, organized by story and component type.

## Repository Structure

When you commit a SAC story, AnalyGits creates this structure in your repo:

```
stories/
└── My_Dashboard/
    ├── README.md                    # Story metadata
    ├── globalVars.js                # Global variables
    ├── scriptObjects/
    │   ├── DataLoader.js            # Script object functions
    │   └── Formatter.js
    └── events/
        ├── Chart_1.onClick.js       # Widget event handlers
        └── Button_Submit.onSelect.js
```

## Requirements

- **Chrome 88+** (Manifest V3 support)
- **SAP Analytics Cloud** access with story edit permissions
- **GitHub account** with repository access

## Development

```bash
# Install dependencies
npm install

# Development build with watch
npm run dev

# Production build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation including:
- Component overview and data flow
- Authentication mechanisms
- SAC API integration details
- Security considerations

## Changelog

See [Changelog.md](Changelog.md) for version history and release notes.

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Setting up your development environment
- Code style and conventions
- Submitting pull requests

## Security

For security concerns, please review our [Security Policy](SECURITY.md) and report vulnerabilities responsibly.

## Privacy

AnalyGits respects your privacy. See our [Privacy Policy](PRIVACY.md) for details on data handling.

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

This project includes third-party software. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attributions.

## Support

- **Issues**: [GitHub Issues](https://github.com/JariPie/analygits/issues)
- **Discussions**: [GitHub Discussions](https://github.com/JariPie/analygits/discussions)

---

**Built in Berlin for the SAP Analytics Cloud World**