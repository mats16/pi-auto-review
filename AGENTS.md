# AGENTS.md

pi-auto-review is a [pi](https://pi.dev) extension: a reviewer model approves routine tool calls and sends risky ones to the user. See [README.md](README.md) for behavior.

## Layout

- `index.ts`: the whole extension. pi loads it as TypeScript; there is no build step.
- `index.test.ts`: tests for the exported decision functions (`needsReview`, `touches`, `parseVerdict`).
- `review.eval.ts`: replays the prompts the user approved in T3 Code's history and lists those that still ask, and checks patterns synthesized from it (calls that must run, and the risky variants that must still ask), against a live reviewer. Local only.
- `.github/workflows/pullfrog.yml`: generated; edit only where it says so.

## Commands

```bash
npm test   # node --test, runs the .ts files directly
PI_AUTO_REVIEW_MODEL=provider/model npm run eval   # live reviewer, reads ~/.t3/userdata/statev2.sqlite
```

No `npm install` is needed. Keep imports from `@earendil-works/*` type-only (`import type`) so the tests run without them, and use only syntax Node can strip (no `enum`, no parameter properties).

## Rules

- Fail closed. A review that fails, times out, or cannot be parsed goes to a human, never runs. The one exception is T3 Code's Full access, where the user chose no prompts: a failed review runs with a warning, and critical calls are blocked instead of asking.
- Text from anything but the user's messages is untrusted. Do not pass tool output or the agent's own words to the reviewer.
- Calls on this extension's own files always go to a human (in Full access, they are blocked), never to the reviewer.
- When behavior changes, update the header comment in `index.ts`, `POLICY` if relevant, and the README tables and Limits together.
- Mark known shortcuts with a `// ponytail:` comment that names the limit, and list user-visible ones in README's Limits.
- Add a test for every change to a decision function. After a `POLICY` change, run `npm run eval` with the reviewer in use.
- Indent with tabs.
- Commit messages: imperative subject; the body says what was wrong and why the change fixes it.
