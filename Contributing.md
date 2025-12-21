# Contributing to AnalyGits

Thank you for your interest in contributing to AnalyGits! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to maintain a welcoming and inclusive environment. Be respectful, constructive, and professional in all interactions.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Chrome browser (88+)
- Git
- A GitHub account
- Access to SAP Analytics Cloud (for testing)

### Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/analygits.git
   cd analygits
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development mode:**
   ```bash
   npm run dev
   ```

4. **Load the extension in Chrome:**
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

5. **Run tests:**
   ```bash
   npm test
   ```

### Project Structure

```
src/
├── background/          # Service worker (Chrome MV3)
├── popup/              
│   ├── components/      # React UI components
│   ├── context/         # React contexts (Auth)
│   ├── hooks/           # Custom React hooks
│   ├── services/        # API clients (GitHub)
│   └── utils/           # Parsers and helpers
├── diff/                # Diffing engine
└── sac/                 # SAC API integration
tests/                   # Vitest test files
```

## How to Contribute

### Reporting Bugs

1. **Search existing issues** to avoid duplicates
2. **Use the bug report template** when creating a new issue
3. **Include:**
   - Chrome version
   - Extension version
   - Steps to reproduce
   - Expected vs actual behavior
   - Console errors (if any)

### Suggesting Features

1. **Open a discussion** first for major features
2. **Explain the use case** — what problem does it solve?
3. **Consider the scope** — does it fit the extension's purpose?

### Submitting Code

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our code style (see below)

3. **Write or update tests** for your changes

4. **Run the full test suite:**
   ```bash
   npm test
   ```

5. **Commit with conventional commits:**
   ```
   feat(diff): add support for nested script objects
   fix(auth): handle token refresh edge case
   docs(readme): update installation steps
   ```

6. **Push and open a Pull Request**

### Pull Request Guidelines

- **Keep PRs focused** — one feature or fix per PR
- **Update documentation** if needed
- **Add tests** for new functionality
- **Ensure all tests pass** before requesting review
- **Respond to feedback** promptly

## Code Style

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Document public functions with JSDoc comments

### React

- Functional components with hooks
- Custom hooks for reusable logic
- Keep components focused and small
- Use TypeScript for props definitions

### Naming Conventions

- **Files:** `camelCase.ts` for utilities, `PascalCase.tsx` for components
- **Variables:** `camelCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Types/Interfaces:** `PascalCase`

### Example Code Style

```typescript
// Good: Explicit types, clear naming, documented
interface DiffResult {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  oldContent?: string;
  newContent?: string;
}

/**
 * Compares local content against GitHub repository.
 * @param localTree - Parsed content from SAC story
 * @param remoteTree - Content fetched from GitHub
 * @returns Array of diff results
 */
export function computeDiff(
  localTree: Map<string, VirtualFile>,
  remoteTree: Map<string, VirtualFile>
): DiffResult[] {
  // Implementation
}
```

```typescript
// Avoid: Unclear types, magic values, no documentation
export function diff(a: any, b: any) {
  // What is this doing?
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- adapter.test.ts

# Watch mode
npm run test:watch
```

### Writing Tests

- Place tests in the `tests/` directory
- Mirror the source file structure
- Test both happy paths and edge cases
- Use descriptive test names

```typescript
describe('parseStoryContent', () => {
  it('should extract global variables from story JSON', () => {
    // Arrange
    const input = { /* test data */ };
    
    // Act
    const result = parseStoryContent(input);
    
    // Assert
    expect(result.globalVars).toHaveLength(2);
  });

  it('should handle empty script objects gracefully', () => {
    // Test edge case
  });
});
```

## Architecture Decisions

When proposing significant changes, consider:

1. **Security** — Does this introduce any vulnerabilities?
2. **Performance** — How does it affect load time and memory?
3. **Maintainability** — Is the code easy to understand and modify?
4. **Compatibility** — Does it work across Chrome versions?

## Questions?

- **General questions:** Open a [Discussion](https://github.com/JariPie/analygits/discussions)
- **Bug reports:** Open an [Issue](https://github.com/JariPie/analygits/issues)
- **Security issues:** See [SECURITY.md](SECURITY.md)

---

Thank you for contributing to AnalyGits! 🎉