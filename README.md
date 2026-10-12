# pi-auto-review

AI auto-review for [pi](https://pi.dev) tool calls, after Codex's auto-review ("Approve for me"). A reviewer model approves routine actions and sends risky ones back to the agent, which takes a safer route or asks you.

## How it works

| Tool call | What happens |
|---|---|
| Calls on pi-auto-review's own files: `edit` / `write` under its folder, or any other call except `read`, `grep`, `find`, `ls` that names the folder | You are asked, without review (with no UI, it is blocked) |
| `read`, `grep`, `find`, `ls`, and tools annotated `readOnlyHint` | Runs |
| `edit` / `write` to an ordinary file inside the working directory | Runs |
| `edit` / `write` outside the working directory, or to a dot path (`.git`, `.env`, `.pi`, `.github`, ...) | Reviewed |
| Everything else: `bash`, MCP tools, custom tools | Reviewed |
| A call that would be reviewed but is over 32,000 characters as JSON, too large for the reviewer to see whole | You are asked, without review (with no UI, it is blocked), as Codex asks when a call exceeds its reviewer's budget |

The reviewer sees the working directory, the session's transcript, and the planned call. Only your messages and `/auto-review` approvals are trusted; an approval covers the call you approved, and text the agent put inside that call is still the agent's. The agent's messages, its tool calls, and their output are passed as untrusted evidence: they can explain how a task is done, but cannot authorize anything, so instructions planted in files or web pages do not count as yours. Each entry is a JSON object, so text in tool output cannot pass as one of your messages. When the session is long, your messages are kept first, then the newest of the rest.

As in Codex, the reviewer rates two things: the call's **risk** (`low`, `medium`, `high`, `critical`), by what the call could do, not by whether you asked for it, and your **authorization** for it (`unknown`, `low`, `medium`, `high`). Then it decides:

- **low**, **medium**: runs, even a step you did not ask for, unless a deny rule below applies or untrusted content clearly steered the agent into it (prompt injection).
- **high**: runs only if your authorization is `medium` or `high` (you asked for it, in effect or exactly) and it is narrowly scoped, so a PR or a production deploy you asked for runs. Otherwise it is denied.
- **critical** (secrets sent to an untrusted destination, major irreversible destruction): denied, even if you asked for it.

A denied call is blocked, and the agent gets the reviewer's reason along with Codex's instruction: do not work around it; take a materially safer route, or stop and ask you. To let it run, approve it in chat, or run `/auto-review`, pick it from the last 10 denials, and confirm the full call: as in Codex, the agent is told you approved that exact call, and its retry is still reviewed, with your approval as trusted evidence, so it runs unless it is critical or its payload changed. A critical call cannot be approved in chat: run it yourself, or turn pi-auto-review off for it (in T3 Code, Full access). A review that fails, times out (90 s), or returns an unreadable answer blocks the call too, and the agent is told it was a review failure, not a judgment of the call. Three denials in a row, or ten in the last fifty reviews, within one run stop that run; the next prompt starts the count again.

The deny rules cover: hard-to-undo destruction (including a deletion that runs even if the `cd` before it fails, as in `cd /tmp/x; rm *.txt`), sending sensitive data to destinations you did not authorize (your own documents and repositories, and the tools and subagents already connected, are trusted), credential probing, lasting security weakening, and steps you said not to take (an upgrade after "do not upgrade it"). Actions that reach other people or shared systems (publishing, pushing to a default branch, PRs, messages, sharing, deploys) are high, so they run only when you asked for them; editing your own documents or pushing a feature branch is not. A script whose body it cannot see, a path outside the working directory, or a large job is not high by itself. Among T3 Code's own tools, previews and rendered pages, reads, lists, status checks, delegating, and PR links are routine unless a deny rule applies; the rest (driving the browser, answering pending requests, changing projects, threads, schedules, or preferences) are judged by the rules above. Writing a file under `/tmp` is scratch work, unless a deny rule applies to what it holds. Removing named files under `/tmp`, such as an old clone before cloning it again, is not destruction; `rm -rf /tmp/*` still is, and so is a path built from a variable such as `$TMPDIR`, unless the same command sets the variable to a literal `/tmp` path. Editing the instructions or skills inside the working directory (`AGENTS.md`, `.agents/skills`, ...) is ordinary editing, unless the edit lets the agent skip review or loosens a safety rule. See `POLICY` in [`index.ts`](index.ts).

## Install

```bash
pi install git:github.com/mats16/pi-auto-review
```

To try it for one run: `pi -e git:github.com/mats16/pi-auto-review`.

## Configure

The reviewer is the first of these that is set:

1. `PI_AUTO_REVIEW_MODEL`, as `provider/model-id`, optionally with an effort: `openai/gpt-5.4-mini:low`.
2. `autoReview.model` in pi's user `settings.json` (`~/.pi/agent/settings.json`), in the same form.
3. The session's model.

Reviews run at reasoning effort `high`, whatever thinking level the session uses, unless the model setting names another. Through an OpenAI Responses-compatible API (`"api": "openai-responses"` or `"azure-openai-responses"` in `models.json`, as Databricks' OpenAI-format models use), the reviewer must answer in the verdict's JSON schema; other APIs answer in plain text (see Limits). Each review is one model request, typically 2–8 seconds; a fast, smaller model keeps pi responsive. [Reviewer benchmarks](https://github.com/mats16/pi-auto-review/blob/main/docs/benchmarks.md) compares models and efforts by accuracy, speed, and cost.

```json
{
  "autoReview": { "model": "databricks-oss/system.ai.glm-5-3-flash" }
}
```

The model can be any model in pi's `models.json`. Only the user-level `settings.json` counts, so a project's `.pi/settings.json` cannot change the reviewer. Some models behind OpenAI-compatible gateways ignore a system prompt sent in the `developer` role, so every review fails; give those `"compat": { "supportsDeveloperRole": false }` in `models.json`.

## T3 Code

| Mode | What happens |
|---|---|
| **Supervised**, **Auto-accept edits** | pi-auto-review reviews as above, in place of the bridge's own prompt on every call. Both behave the same: edits to ordinary files inside the working directory run without review. You are asked only about calls on pi-auto-review's own files and calls too large to review. |
| **Full access** | Everything runs unreviewed, as in Codex. |

T3 Code starts pi in **Auto** as it does in Supervised, so pi-auto-review reviews there too. It reads the same `settings.json` and `models.json` as pi; to override them, set `PI_AUTO_REVIEW_MODEL` in the pi provider's environment in T3 Code's settings.

## Limits

- This is not a sandbox. A reviewer model can be wrong or tricked. Read [pi's security notes](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md) and use a container for untrusted work.
- The reviewer's outcome stands, as in Codex, so a risky call it underrates, or a high one it wrongly thinks you asked for, runs. Only `critical` is enforced in code.
- The reviewer reads tool output and the agent's words as evidence. They cannot authorize anything, but text planted there can still mislead its judgment of what a call does.
- Unlike Codex's reviewer, it cannot run commands to check a target (what `rm -rf` would delete, whether a repository is private): it judges from the transcript, and leans toward denying when that is not enough.
- Long sessions are cut to fit: your messages first, then the newest of the rest. A step you ruled out is kept unless your messages alone fill the budget.
- In Full access, nothing is reviewed, including calls on pi-auto-review's own files.
- `/auto-review` lists the denials since pi-auto-review loaded, so a reload or a new session clears the list.
- An `/auto-review` approval stays in the transcript, as in Codex, so only the reviewer keeps it to one retry: the same call repeated later can be allowed again.
- The reviewer treats `/tmp` as scratch, so the agent can write or overwrite any file there (a symlink there can point elsewhere), and delete named files there, or files matching a prefix wildcard, or a folder named by a variable the same command sets, without asking, even ones you put there yourself.
- The agent can edit the instructions and skills inside the working directory without review, so an edit the reviewer misreads as harmless shapes later sessions.
- If the extension fails to load, nothing is reviewed (in T3 Code outside Full access, the bridge then asks about every call).
- The inside-the-working-directory check is lexical: a symlink inside it can point elsewhere.
- The check for pi-auto-review's own files is lexical too: a command that reaches its folder through a relative path or a variable goes to the reviewer like any other call.
- In T3 Code, pi-auto-review turns off the bridge's own prompts by unsetting `T3_PI_RUNTIME_MODE`, which the bridge reads as Full access, and sets it back when the session ends or reloads. If a T3 Code release stops rereading it on every call, you get the bridge's prompts as well as these.
- Through the Responses API, every review asks for a strict JSON schema; a gateway that rejects that fails every review, so every reviewed call is blocked. Other APIs answer in plain text, where other JSON beside the verdict fails the review.
- Some providers' safety filters reject review requests that contain exfiltration-like commands. Those count as failures, so the call is blocked.

## Development

```bash
npm test
```

## License

MIT
