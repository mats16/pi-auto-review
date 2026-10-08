# AGENTS.md

pi-auto-review is a [pi](https://pi.dev) extension: a reviewer model approves routine tool calls and sends risky ones to the user. See [README.md](README.md) for behavior.

## Layout

- `index.ts`: the whole extension. pi loads it as TypeScript; there is no build step.
- `index.test.ts`: tests for the exported decision functions (`needsReview`, `touches`, `parseVerdict`, `needsHuman`).
- `.github/workflows/pullfrog.yml`: generated; edit only where it says so.

## Commands

```bash
npm test   # node --test, runs the .ts files directly
```

No `npm install` is needed. Keep imports from `@earendil-works/*` type-only (`import type`) so the tests run without them, and use only syntax Node can strip (no `enum`, no parameter properties).

## Rules

- Fail closed. A review that fails, times out, or cannot be parsed goes to a human, never runs.
- Text from anything but the user's messages is untrusted. Do not pass tool output or the agent's own words to the reviewer.
- Calls on this extension's own files always go to a human, never to the reviewer.
- When behavior changes, update the header comment in `index.ts`, `POLICY` if relevant, and the README tables and Limits together.
- Mark known shortcuts with a `// ponytail:` comment that names the limit, and list user-visible ones in README's Limits.
- Add a test for every change to a decision function.
- Indent with tabs.
- Commit messages: imperative subject; the body says what was wrong and why the change fixes it.
