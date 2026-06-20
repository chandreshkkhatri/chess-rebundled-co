# AI Agent Instructions

This file contains instructions for AI coding assistants working in this repository.

## Developer Rules & Responsibilities

1. **Documentation Maintenance**:
   - Always maintain and update the application documentation located in the [docs](file:///home/ubuntu/code/chess-rebundled/docs) directory.
   - For every new feature, page, or major refactor, create or update markdown documentation in `docs/` detailing the architecture, components, state management, and user guides.
   - Keep instructions up to date for local testing, environment variables, and build verification.

2. **Git Commit Hygiene**:
   - Make logical commits from time to time as features or iterations are completed.
   - Use clear, descriptive, and professional commit messages following conventional commit guidelines (e.g., `feat(frontend): add coordinate trainer page`, `fix(practice): resolve Stockfish integration type error`).
   - Run linter (`pnpm run lint`) and TypeScript checks (`pnpm exec tsc --noEmit`) before committing.

3. **Improvement Iteration Scope** *(effective from 2026-06-20)*:
   - All autonomous improvement iterations **must be non-feature improvements only**.
   - Valid categories: bug fixes, code quality / refactoring, performance optimisations, accessibility improvements, type-safety improvements, removing dead code, improving error handling, reducing bundle size, improving test coverage, and documentation updates.
   - **Do NOT** add new user-facing features, pages, or UI elements during autonomous iterations unless explicitly requested by the user.
