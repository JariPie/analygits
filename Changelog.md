# Changelog

All notable changes to AnalyGits will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

*No unreleased changes*

---

## [1.0.0] - 2025-01-XX

### Added

- **Core Features**
  - Git-based version control for SAP Analytics Cloud stories
  - Side-by-side diff viewer comparing SAC content vs GitHub
  - Push changes to GitHub with conventional commit messages
  - Revert individual scripts from GitHub back to SAC
  
- **GitHub Integration**
  - GitHub App authentication (secure OAuth flow)
  - Repository and branch selection
  - Real-time diff comparison against any branch
  
- **SAC Support**
  - Extract global variables, script objects, and widget events
  - Preserve script structure in GitHub repository
  - Auto-detect SAC stories from browser URL
  
- **User Experience**
  - Clean, minimal popup interface
  - Connection status indicator
  - Commit message editor with conventional commit hints
  - English and German language support

- **Security**
  - Secure token storage using Chrome's storage APIs
  - Message origin validation
  - URL allowlisting for SAC domains
  - CSRF token handling for SAC requests
  - Environment-aware logging (no sensitive data in production)

- **Developer Experience**
  - 88% test coverage with Vitest
  - TypeScript strict mode throughout
  - Modular architecture with clear separation of concerns
  - Comprehensive error handling utilities

- **Documentation**
  - Apache 2.0 open-source license
  - Privacy policy for Chrome Web Store compliance
  - Security policy with vulnerability disclosure process
  - Contributing guidelines
  - Third-party notices for dependency attribution

### Security

- Implemented defense-in-depth authentication model
- Added input validation for all external data
- Secured token storage with session isolation

---

## Version History

### Pre-1.0 Development

The following milestones were completed during pre-release development:

**Phase 1: Security & Foundation**
- Established secure authentication architecture
- Implemented message handler origin validation
- Added URL allowlisting for SSRF prevention
- Configured secure token storage

**Phase 2: Code Quality**
- Replaced `any` types with proper SAC API type definitions
- Implemented centralized error handling utilities
- Extracted custom hooks from oversized components
- Modularized service layer with barrel exports

**Phase 3: Testing & Reliability**
- Expanded test coverage from ~40% to 88%
- Added comprehensive auth flow tests
- Implemented edge case and error scenario tests
- Established deterministic, CI-ready test patterns

**Phase 4: Chrome Web Store Readiness**
- Polished README and documentation
- Created privacy policy and store listing
- Added CONTRIBUTING and SECURITY guidelines
- Selected Apache 2.0 license for enterprise compatibility

---

## Upgrade Guide

### Migrating to 1.0.0

This is the initial release. No migration required.

For future major versions, upgrade instructions will be provided here.

---

## Links

- [GitHub Repository](https://github.com/JariPie/analygits)
- [Issue Tracker](https://github.com/JariPie/analygits/issues)
- [Chrome Web Store](https://chrome.google.com/webstore/detail/analygits/EXTENSION_ID)

[Unreleased]: https://github.com/JariPie/analygits/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/JariPie/analygits/releases/tag/v1.0.0