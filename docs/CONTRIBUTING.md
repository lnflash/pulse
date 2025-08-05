# Contributing to Pulse

Thank you for your interest in contributing to Pulse! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Respect differing opinions and experiences

## How to Contribute

### Reporting Issues

1. Check existing issues to avoid duplicates
2. Use issue templates when available
3. Provide clear reproduction steps
4. Include relevant system information

### Submitting Pull Requests

1. **Fork and Clone**
   ```bash
   git clone https://github.com/[your-username]/pulse.git
   cd pulse
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Your Changes**
   - Follow existing code style
   - Add tests for new features
   - Update documentation as needed
   - Keep commits focused and atomic

4. **Test Your Changes**
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```

5. **Submit PR**
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe what changes you made and why
   - Include screenshots for UI changes

## Development Guidelines

### Code Style

- Use TypeScript for type safety
- Follow ESLint configuration
- Use Prettier for formatting
- Write self-documenting code
- Add comments only when necessary

### Testing

- Write unit tests for new functions
- Add integration tests for new features
- Ensure all tests pass before submitting
- Maintain or improve code coverage

### Documentation

- Update README.md if adding new features
- Document new environment variables
- Add JSDoc comments for public APIs
- Update relevant docs in the docs/ folder

### Commit Messages

Follow conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

Types: feat, fix, docs, style, refactor, test, chore

Example:
```
feat(voice): add natural language processing for voice commands

- Added 200+ command variations
- Improved voice recognition accuracy
- Added user feedback for commands
```

## Review Process

1. All PRs require at least one review
2. CI checks must pass
3. Address reviewer feedback
4. Squash commits if requested
5. Maintainers will merge when ready

## Getting Help

- Join our Discord community
- Ask questions in GitHub Discussions
- Tag @maintainers for urgent issues
- Check documentation and FAQs first

## Recognition

Contributors will be:
- Listed in our Contributors section
- Mentioned in release notes
- Given credit in commits

Thank you for helping make Pulse better!