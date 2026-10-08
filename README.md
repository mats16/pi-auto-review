# pi-auto-review

AI auto-review for [pi](https://pi.dev) tool calls. A reviewer model approves routine actions, so pi asks you only about the risky ones, much like Codex's auto-review.

## How it works

| Tool call | What happens |
|---|---|
| Calls on pi-auto-review's own files: `edit` / `write` under its folder, or any other call except `read`, `grep`, `find`, `ls` that names the folder | You are asked, without review |
| `read`, `grep`, `find`, `ls`, and tools annotated `readOnlyHint` | Runs |
| `edit` / `write` to an ordinary file inside the working directory | Runs |
| `edit` / `write` outside the working directory, or to a dot path (`.git`, `.env`, `.pi`, `.github`, ...) | Reviewed |
| Everything else: `bash`, MCP tools, custom tools | Reviewed |

The reviewer sees the working directory, your last 8 messages (trusted), and the planned call (untrusted). It does not see tool output or the agent's own words, so instructions planted in files or web pages cannot authorize anything.

- **allow**: the call runs without a prompt.
- **deny**: you are asked (`Allow bash?`) with the reviewer's reason. Review failures and timeouts (60 s) are treated the same way. In T3 Code's Full access, a denial rated low or medium runs anyway; see [T3 Code](#t3-code).
- **No UI** (`pi -p`, JSON mode): a denied call is blocked, and the agent is told to ask you to approve it explicitly.

The reviewer denies hard-to-undo destruction, sending data to destinations you did not name (searches and delegation through the tools and subagents already connected do not count), outward-facing actions (push, publish, PRs, messages, deploys), credential hunting, lasting security weakening, actions driven by untrusted content, and commands it cannot understand, unless you asked for that exact action. See `POLICY` in [`index.ts`](index.ts).

## Install

```bash
pi install git:github.com/mats16/pi-auto-review
```

To try it for one run: `pi -e git:github.com/mats16/pi-auto-review`.

## Configure

| Environment variable | Default | Meaning |
|---|---|---|
| `PI_AUTO_REVIEW_MODEL` | the session's model | Reviewer model as `provider/model-id`, e.g. `openai/gpt-5.4-mini` |

Each review is one model request, typically 2–8 seconds. A fast, smaller model keeps pi responsive.

## T3 Code

T3 Code's pi bridge asks you about every non-read-only call in every mode except **Full access**. Its **Auto** mode reaches pi as `approval-required`, so pi cannot tell it apart from Supervised. pi-auto-review therefore stays out of the way unless the thread is in Full access; choose Full access on a pi thread to have pi-auto-review review it. Its approvals appear in T3 Code like the bridge's own. Because you chose Full access, only denials rated high or critical, failed reviews, and calls on pi-auto-review's own files ask you; denials rated low or medium run. Set `PI_AUTO_REVIEW_MODEL` in the pi provider's environment in T3 Code's settings.

## Limits

- This is not a sandbox. A reviewer model can be wrong or tricked. Read [pi's security notes](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md) and use a container for untrusted work.
- If the extension fails to load, nothing is reviewed.
- The inside-the-working-directory check is lexical: a symlink inside it can point elsewhere.
- The check for pi-auto-review's own files is lexical too: a command that reaches its folder through a relative path or a variable goes to the reviewer like any other call.
- Some providers' safety filters reject review requests that contain exfiltration-like commands. Those count as failures, so you are asked.

## Development

```bash
npm test
```

## License

MIT
