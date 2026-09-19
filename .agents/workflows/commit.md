---
description: Group, verify, and commit changes consistently following Conventional Commits and project verification standards.
---

# Commit Convention & Verification Workflow

> [!CAUTION]
> **STRICT WARNING: NEVER BYPASS GIT HOOKS OR VERIFICATION CHECKS!**
> Never use `--no-verify`, `-n`, or disable hooks when committing.
> If any pre-commit verification or check fails (typecheck, tests, build, commit lint), **fix the underlying code or commit message until it passes naturally**.
> Bypassing checks is a severe breach of code integrity standards.

Use this workflow **ONLY when the user explicitly requests or confirms a commit**.
**NEVER automatically commit changes** after creating or modifying files. Always report changes first and wait for user confirmation.

---

## 1. Pre-Commit Verification (Health Check)

Before running `git commit`, the agent **MUST** validate and ensure all project verification checks pass:

1. **Code Formatting (Prettier):**
   - Run: `npm run format` (or verify with `npm run format:check`)
   - Ensure all files follow project formatting conventions.
2. **Linting & Auto-fix (ESLint):**
   - Run: `npm run lint:fix`
   - Verify with `npm run lint` that 0 lint errors remain.
3. **Static Typecheck (TypeScript):**
   - Run: `npm run check`
   - Must pass with 0 errors (`tsc --noEmit`).
4. **Unit Tests (Vitest):**
   - Run: `npm test`
   - All unit test suites must pass with zero failures.
5. **Extension Bundle Build (esbuild):**
   - Run: `npm run build`
   - Ensure the extension bundles into `dist/extension.js` without bundle or syntax errors.
6. **Security & Zero Token Leakage Invariant:**
   - Verify that **no** SonarQube tokens, credentials, or secrets are hardcoded in test files, fixtures, workspace settings, or source code.
   - Confirm tokens are persisted strictly via `context.secrets` and not exposed in URLs, logs, or Webview messages.
7. **Code Hygiene & Diff Cleanliness:**
   - Ensure no temporary `console.log`, debugging dumps, or leftover scratch code remain.
   - Check whitespace and diff cleanliness: `git diff --check`.

---

## 2. Grouping & Staging

1. Inspect modified and untracked files:
   - `git status --short`
   - `git diff --name-only`
   - `git diff`
2. Group changes logically by module/feature/ticket. **Do not combine unrelated changes into a single commit.**
3. Stage only files relevant to the intended atomic commit (`git add <file1> <file2>`).

---

## 3. Commit Message Format (Conventional Commits)

Commit messages must strictly follow the Conventional Commits specification:

- **Structure:**
  ```text
  <type>(<scope>): <subject>

  - <bullet point explaining change 1>
  - <bullet point explaining change 2>
  ```
- **Allowed Types:**
  - `feat`: New feature or user-facing capability
  - `fix`: Bug fix
  - `refactor`: Code refactoring without behavioral changes
  - `test`: Adding or updating test suites
  - `docs`: Documentation updates (README, SPEC, CONTEXT, tickets)
  - `chore`: Maintenance, dependencies, config, or build scripts
  - `style`: Formatting, CSS/styling adjustments without logic changes
  - `perf`: Performance improvements
  - `ci`: CI/CD pipeline changes
  - `build`: Build system or dependency changes
- **Scope (Optional but recommended):**
  - Project module or domain: `detector`, `client`, `dispatcher`, `webview`, `security`, `config`, `views`, `tests`, `build`.
- **Subject:**
  - Written in English in the imperative mood (e.g., `add feature`, `fix issue`, not `added` or `fixing`).
  - Lowercase (except for proper nouns, acronyms, or ticket names).
  - Maximum 72–100 characters.
  - **Do NOT end with a period (`.`)**.
- **Body:**
  - Leave exactly **one blank line** between subject and body.
  - Use bullet points (`- `) explaining what changed and the rationale.
  - Maximum 100–120 characters per line.
- **AI Attribution Prohibition:**
  - **NEVER** add `Co-Authored-By: Claude ...`, `Co-Authored-By: Gemini ...`, or any bot/AI attribution trailers to commit messages.

---

## 4. Execution & Error Handling

1. Execute `git commit -m "<message>"`.
2. If any check or hook fails:
   - Inspect failure logs in detail (e.g., Prettier formatting, ESLint rules, TypeScript compiler, Vitest, or esbuild output).
   - Fix the root cause directly in the code or message.
   - **NEVER attempt to bypass with `git commit --no-verify`**.
   - Re-run verification and commit.
3. After committing, verify repository status and report:
   - Short commit hash (7 characters).
   - Commit subject.
   - Summary of changes included in the commit.
