# Repository Guidelines

This repository contains `copydiff`, a Bun + TypeScript CLI that augments `git diff` output with copy/clone awareness. Use the notes below to navigate the codebase, run the tool locally, and contribute changes consistently.

## Project Structure & Module Organization

- `src/` holds all runtime TypeScript. `src/cli.ts` is the entrypoint used by the `copydiff` bin.
- `src/clone/` integrates `jscpd` for clone detection; `src/diff/` parses Git diffs; `src/render/` handles terminal and HTML rendering.
- Shared helpers live in `src/cache.ts`, `src/git.ts`, `src/overlay.ts`, and `src/ansi.ts`.
- Root config lives in `tsconfig.json` and `package.json`; usage details are in `README.md`.

## Build, Test, and Development Commands

- `bun install` installs dependencies.
- `bun link` registers the local CLI so `copydiff` resolves on your PATH.
- `bun run lint` runs ESLint over `src/`.
- `bun run format` formats `src/` with Prettier.
- Example local run without linking: `bun src/cli.ts --stdin` or `bun src/cli.ts base..head`.

## Coding Style & Naming Conventions

- TypeScript with ESM imports, 2-space indentation, semicolons, and double-quoted strings.
- Keep file and directory names lowercase and descriptive (see `src/clone/`, `src/render/`).
- Run `bun run format` before pushing to align with Prettier output.

## Testing Guidelines

- No automated test runner is configured yet.
- Validate changes by running the CLI against real diffs, e.g. `git diff --color=always | copydiff --stdin`.
- If you add tests, document the framework and wire a `package.json` script.

## Commit & Pull Request Guidelines

- Existing history uses short, lowercase subjects (e.g. `init`); keep commit messages concise and imperative.
- PRs should include a brief summary, manual test commands, and sample output (terminal diff or `--html` output) for rendering changes.

## Configuration & Runtime Notes

- When `--cache on`, the tool writes clone caches under `.git/copydiff/cache`; do not commit these files.
- `--ignore` accepts comma-separated globs for `jscpd` scanning.
