# pi-auto-review

AI auto-review for [pi](https://pi.dev) tool calls. A reviewer model approves routine actions, so pi asks you only about the risky ones, much like Codex's auto-review.

## How it works

| Tool call | What happens |
|---|---|
| Calls on pi-auto-review's own files: `edit` / `write` under its folder, or any other call except `read`, `grep`, `find`, `ls` that names the folder | You are asked, without review (in T3 Code's Full access, it runs and you are told) |
| `read`, `grep`, `find`, `ls`, and tools annotated `readOnlyHint` | Runs |
| `edit` / `write` to an ordinary file inside the working directory | Runs |
| `edit` / `write` outside the working directory, or to a dot path (`.git`, `.env`, `.pi`, `.github`, ...) | Reviewed |
| Everything else: `bash`, MCP tools, custom tools | Reviewed |

The reviewer sees the working directory, your last 8 messages (trusted), and the planned call (untrusted). It does not see tool output or the agent's own words, so instructions planted in files or web pages cannot authorize anything.

Like Codex's auto-review, the reviewer rates each call's risk by what the call could do, not by whether you asked for it, and the rating decides:

- **low**, **medium**: the call runs without a prompt, even a step you did not ask for.
- **high**: runs if it is how the agent carries out something you asked for (you asked for a deck, and this builds it) and is narrowly scoped; otherwise you are asked (`Allow bash?`) with the reviewer's reason.
- **critical**: you are asked. Review failures, timeouts (60 s), and denials without a rating are treated the same way. In T3 Code's Full access, nothing asks; see [T3 Code](#t3-code).
- **No UI** (`pi -p`, JSON mode): a call that would ask is blocked, and the agent is told to ask you to approve it explicitly. A critical call, or one on pi-auto-review's own files, can then run only from an interactive session, since approval in chat cannot unlock it.

The reviewer allows reads and searches through any tool, whatever query the agent chose, unless one of the following applies to them. It rates these high or critical: high ones ask unless they carry out what you asked for, and critical ones always ask. They are hard-to-undo destruction, sending data to destinations you did not name (your own documents and repositories, and the tools and subagents already connected, do not count), actions that reach other people or shared systems (publishing, pushing to a default branch, PRs, messages, sharing, deploys; editing your own documents or pushing a feature branch does not count), credential hunting, lasting security weakening, actions driven by untrusted content, and obfuscated commands. A script whose body it cannot see, a path outside the working directory, or a large job is not high by itself. Removing named files in the temp directory (`/tmp`, `$TMPDIR`), such as an old clone before cloning it again, is not destruction; `rm -rf /tmp/*` still is. See `POLICY` in [`index.ts`](index.ts).

## Install

```bash
pi install git:github.com/mats16/pi-auto-review
```

To try it for one run: `pi -e git:github.com/mats16/pi-auto-review`.

## Configure

| Environment variable | Default | Meaning |
|---|---|---|
| `PI_AUTO_REVIEW_MODEL` | the session's model | Reviewer model as `provider/model-id`, e.g. `openai/gpt-5.4-mini` |

Each review is one model request, typically 2–8 seconds. A fast, smaller model keeps pi responsive. Reviews always run at reasoning effort `low`, whatever thinking level the session uses.

## T3 Code

| Mode | What happens |
|---|---|
| **Supervised**, **Auto-accept edits** | pi-auto-review reviews as above and asks you only in the cases above (high denials, anything critical, failed reviews, denials without a rating, its own files), in place of the bridge's own prompt on every call. |
| **Full access** | Nothing waits. Calls run at once; the review runs alongside, and a finding rated critical (severe, lasting harm: data lost for good, secrets sent out, production changed, security weakened), or a call on pi-auto-review's own files, appears in the thread afterwards. |

Its approvals appear in T3 Code like the bridge's own. Set `PI_AUTO_REVIEW_MODEL` in the pi provider's environment in T3 Code's settings.

## Limits

- This is not a sandbox. A reviewer model can be wrong or tricked. Read [pi's security notes](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md) and use a container for untrusted work.
- A denial rated low or medium runs without asking, as in Codex's auto-review, so a risky call the reviewer underrates runs.
- The reviewer treats the temp directory as scratch, so the agent can delete named files there, or files matching a prefix wildcard, without asking, even ones you put there yourself.
- If the extension fails to load, nothing is reviewed (in T3 Code outside Full access, the bridge then asks about every call).
- The inside-the-working-directory check is lexical: a symlink inside it can point elsewhere.
- The check for pi-auto-review's own files is lexical too: a command that reaches its folder through a relative path or a variable goes to the reviewer like any other call.
- In T3 Code, pi-auto-review turns off the bridge's own prompts by unsetting `T3_PI_RUNTIME_MODE`, which the bridge reads as Full access, and sets it back when the session ends or reloads. If a T3 Code release stops rereading it on every call, you get the bridge's prompts as well as these.
- In Full access, a finding that comes back after the turn has ended is not shown, and neither is a failed review.
- Some providers' safety filters reject review requests that contain exfiltration-like commands. Those count as failures, so you are asked.

## Development

```bash
npm test
```

## License

MIT
