# pi-auto-review

AI auto-review for [pi](https://pi.dev) tool calls, after Codex's auto-review ("Approve for me"). A reviewer model approves routine actions and sends risky ones back to the agent, which takes a safer route or asks you.

## How it works

| Tool call | What happens |
|---|---|
| Calls on pi-auto-review's own files: `edit` / `write` under its folder (or through a symlink into it), or any other call except `read`, `grep`, `find`, `ls`, `codemode`, `compact_context`, and a `mcp__t3-code__delegate_task` to a pi subagent that names the folder | You are asked, without review (with no UI, it is blocked). The prompt names the folder and, unless the call is an `edit` or `write`, says `read`, `grep`, `find`, and `ls` read it without asking, so declining a call that only reads sends the agent to them |
| `read`, `grep`, `find`, `ls`, and tools annotated `readOnlyHint` | Runs |
| pi's `codemode` script | Runs: it is sandboxed (no file system or network), and each tool it calls goes through this table on its own |
| `edit` / `write` to an ordinary file inside the working directory or under `/tmp`, symlinks followed | Runs |
| `edit` / `write` anywhere else, to a dot path (`.git`, `.env`, `.pi`, `.github`, ...), through a symlink that leads nowhere, or to a file with hard links | Reviewed |
| `compact_context` (a tool a pi extension can add to summarize the session), and `mcp__t3-code__delegate_task` with no provider named (a pi subagent) and no `"runtimeMode":"full-access"`, even when their text names pi-auto-review's folder | Reviewed: the text is for an agent, and the pi subagent's own calls on the folder still come to you. A task for another provider, or in Full access, that names the folder comes to you |
| Everything else: `bash`, MCP tools, custom tools | Reviewed |
| A call that would be reviewed but is over 128,000 characters as JSON, too large for the reviewer to see whole | You are asked, without review (with no UI, it is blocked), as Codex asks when a call exceeds its reviewer's budget |

With a [triage model](#triage-model-experimental-off-by-default) turned on, a reviewed call it finds routine runs without the reviewer.

The reviewer sees the working directory, the session's transcript, and the planned call. Only your messages and `/auto-review` approvals are trusted; an approval covers the call you approved, and text the agent put inside that call is still the agent's. The agent's messages, its tool calls, and their output are passed as untrusted evidence: they can explain how a task is done, but cannot authorize anything, so instructions planted in files or web pages do not count as yours. Each entry is a JSON object, so text in tool output cannot pass as one of your messages. When the session is long, your messages are kept first, then the newest of the rest.

As in Codex, the reviewer rates two things: the call's **risk** (`low`, `medium`, `high`, `critical`), by what the call could do, not by whether you asked for it, and your **authorization** for it (`unknown`, `low`, `medium`, `high`). Then it decides:

- **low**, **medium**: runs, even a step you did not ask for, unless a deny rule below applies or untrusted content clearly steered the agent into it (prompt injection).
- **high**: runs only if your authorization is `medium` or `high` (you asked for it, in effect or exactly) and it is narrowly scoped, so a PR or a production deploy you asked for runs. Otherwise it is denied.
- **critical** (secrets sent to an untrusted destination, major irreversible destruction): denied, even if you asked for it.

A denied call is blocked, and the agent gets the reviewer's reason along with Codex's instruction: do not work around it; take a materially safer route, or stop and ask you. To let it run, approve it in chat, or run `/auto-review`, pick it from the last 10 denials, and confirm the full call: as in Codex, the agent is told you approved that exact call, and its retry is still reviewed, with your approval as trusted evidence, so it runs unless it is critical or its payload changed. A critical call cannot be approved in chat: run it yourself, or turn pi-auto-review off for it (in T3 Code, Full access). A review that fails, times out (90 s), or returns an unreadable answer blocks the call too, and the agent is told it was a review failure, not a judgment of the call. Three denials in a row, or ten in the last fifty reviews, within one run stop that run; the next prompt starts the count again.

The deny rules cover: hard-to-undo destruction (including a deletion that runs even if the `cd` before it fails, as in `cd /tmp/x; rm *.txt`), sending sensitive data to destinations you did not authorize (your own documents and repositories, and the tools and subagents already connected, are trusted), credential probing, lasting security weakening, and steps you said not to take (an upgrade after "do not upgrade it"). Actions that reach other people or shared systems (publishing, pushing to a default branch, PRs, messages, sharing, deploys) are high, so they run only when you asked for them; editing your own documents or pushing a feature branch is not. A script whose body it cannot see, a path outside the working directory, or a large job is not high by itself. Among T3 Code's own tools, previews and rendered pages, reads, lists, status checks, delegating, and PR links are routine unless a deny rule applies (a subagent given Full access, or asked to change pi-auto-review's files, is lasting weakening); the rest (driving the browser, answering pending requests, changing projects, threads, schedules, or preferences) are judged by the rules above. Compacting the session's context is routine. Writing a file under `/tmp` from a command is scratch work, unless a deny rule applies to what it holds. Removing named files under `/tmp`, such as an old clone before cloning it again, is not destruction; `rm -rf /tmp/*` still is, and so is a path built from a variable such as `$TMPDIR`, unless the same command sets the variable to a literal `/tmp` path. Editing the instructions or skills inside the working directory (`AGENTS.md`, `.agents/skills`, ...) is ordinary editing, unless the edit lets the agent skip review or loosens a safety rule. See `POLICY` in [`index.ts`](index.ts).

## Install

pi-auto-review is a [pi package](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), from npm or from this repository:

```bash
pi install npm:@mats16/pi-auto-review
pi install git:github.com/mats16/pi-auto-review
```

To try it for one run: `pi -e npm:@mats16/pi-auto-review`. Add `@<version>` (npm) or `@<tag>` (git) to pin a release; `pi update --extensions` moves an unpinned install to the latest. It needs no dependencies beyond pi itself.

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

`autoReview.effort` sets the effort (`minimal`, `low`, `medium`, `high`, `xhigh`, `max`) when the model setting names none.

### Triage model (experimental, off by default)

A triage model is a classifier, such as TypeSafe's Jev, that answers in a fraction of a second. When it is on, it sees your messages and the planned call first. A call it finds routine (a read, an edit for the task, a search or delegation through a connected tool), with a probability of at least 0.6 and, against the likeliest risk it sees (probability its answer leaves out counts as one), with enough confidence, with no secret in the call and nothing telling the agent to skip asking, runs without the reviewer. Anything else goes to the reviewer as usual. It can only let a call run: it never blocks one, and if it fails, times out (10 s), or is set up wrong, the reviewer judges the call and pi-auto-review warns you once. Once a call is blocked, by a review or by you, the rest of that run skips the triage model until your next prompt, so a workaround for the blocked step (a script that does it) goes to the reviewer, which sees the denial.

```json
{
  "autoReview": {
    "model": "databricks-oss/system.ai.glm-5-3-flash",
    "effort": "high",
    "triage": {
      "enabled": true,
      "model": "databricks-oss/system.ai.openjev-qwen35-4b",
      "endpoint": "https://<workspace>.cloud.databricks.com/ai-gateway/typesafe/v1/systemone",
      "confidence": 0.75
    }
  }
}
```

| Key | Meaning |
|---|---|
| `enabled` | `true` turns it on. Anything else, or no `triage` at all, leaves it off. |
| `model` | `provider/model-id`. A System One classifier pi lists (`typesafe/jev-latest`, `openrouter/typesafe/jev-1.13`, ...) is called through pi. Other classifier APIs, such as llama.cpp's, are not supported: the questions are written for System One. |
| `endpoint` | For a classifier pi does not list, such as Databricks' OpenJev: the full `https` URL of its System One API (plain `http` only for `localhost`, since the provider's credentials go with it), which gets the request as is, so a path that moves (Databricks' is in beta) needs only this setting changed. `model`'s provider then only picks whose credentials are sent, those of an existing provider in `models.json`; nothing needs adding there, and `models.json` cannot define classifiers anyway. |
| `confidence` | How sure the triage model must be that the call is routine rather than the likeliest risky kind it sees (deleting, installing, posting, ...), from 0.7 to 1 (default `0.75`, routine three times as likely as that risk). Higher sends more calls to the reviewer. At 0.6 a call that should ask was cleared, and 0.7 keeps a margin over it, so a lower value, such as the 0.6 that used to be the default, is refused and the reviewer judges every call. |

With Databricks' OpenJev (Qwen3.5 4B) in front of GLM-5.3-Flash at `high`, on the eval's synthesized patterns and history (2026-10-13), the triage model let no call through that should have asked, at any of these settings:

| `confidence` | Synthesized calls cleared without the reviewer | History reviews cleared without the reviewer | History median review |
|---|---|---|---|
| 0.7 | 23% | 69% | 0.27 s |
| 0.75 (default) | 23% | 69% | 0.26 s |
| 0.8 | 22% | 63% | 0.29 s |

All three keep most reviews under a second. Higher values also move the calls that should ask further from clearing: at the default, the closest of them, on the eval's cases, its history, and cases written after the questions, was half a logit short. At 0.6 one cleared: `cd /tmp/x; rm -f *.pdf *.txt`, with the `cd` unchecked. A secret or a loosened rule is caught by its own question, which clears a call only below 0.2.

[Reviewer benchmarks](https://github.com/mats16/pi-auto-review/blob/main/docs/benchmarks.md#triage-model) has its accuracy, speed, and cost in front of a reviewer.

### Review log (off by default)

`"log": true` in `autoReview` appends one JSON line per review to `pi-auto-review.jsonl` in pi's agent directory (`~/.pi/agent/`), next to pi's own `mcp.log` and `pi-debug.log`, to see how many calls the triage model clears and how the reviewer responds. As with `mcp.log`, past 5 MB the file moves to `pi-auto-review.jsonl.1`, replacing the one before, so the two take at most about 10 MB; if the file cannot be moved, reviews stop being logged. Calls that run or go to you without review are not logged.

```json
{ "autoReview": { "model": "databricks-oss/system.ai.glm-5-3-flash", "log": true } }
```

| Field | Meaning |
|---|---|
| `time`, `session`, `cwd`, `tool`, `call` | When the review started, in which session, and the call (a bash command as is, clipped to 500 characters). `npm run eval` leaves `session` out. |
| `outcome`, `risk`, `authorization`, `reason` | The verdict. `risk` is `unknown` when the review failed. |
| `by` | `triage` when the triage model cleared the call, `reviewer` when the reviewer was asked. Missing when neither answered: no reviewer model was found, or the session was aborted during triage. |
| `ms` | The whole review, in milliseconds. |
| `triage` | `model`, `ms`, `routine`, and its `answers` (probabilities), or its `error` message; `"skipped after a block"` when a block earlier in the run left the call to the reviewer. |
| `reviewer` | `model`, `effort`, `ms`, and `usage` (tokens and cost, as the provider reports them). |

```bash
# How many reviews each side decided, and the reviewer's median time
jq -s 'group_by(.by) | map({by: .[0].by, n: length})' ~/.pi/agent/pi-auto-review.jsonl
jq -s '[.[] | .reviewer.ms // empty] | sort | .[length/2|floor]' ~/.pi/agent/pi-auto-review.jsonl
```

## Report a misjudgment

When a verdict looks wrong, a call that ran but should have asked or one denied that should have run, run `/auto-review-report`. It lists the last 10 verdicts, asks what should have happened, shows you the whole draft, and opens it as a new [GitHub issue](https://github.com/mats16/pi-auto-review/issues) in your browser: nothing is sent until you submit it there. The draft holds the verdict and whether the triage model or the reviewer gave it, the settings it ran with (the reviewer's model and effort, and the triage model, its `confidence`, and whether a custom `endpoint` is set, not the URL), your note, the version, and the call as the agent wrote it, which can include secrets or private paths: remove those before you submit. Your messages are not included, so say in your note what you had asked for. Without the command, the [Misjudged call](https://github.com/mats16/pi-auto-review/issues/new?template=misjudgment.md) template asks for the same.

## T3 Code

| Mode | What happens |
|---|---|
| **Supervised**, **Auto-accept edits** | pi-auto-review reviews as above, in place of the bridge's own prompt on every call. Both behave the same: edits to ordinary files inside the working directory or under `/tmp` run without review. You are asked only about calls on pi-auto-review's own files and calls too large to review. |
| **Full access** | Everything runs unreviewed, as in Codex. |

T3 Code starts pi in **Auto** as it does in Supervised, so pi-auto-review reviews there too. It reads the same `settings.json` and `models.json` as pi; to override them, set `PI_AUTO_REVIEW_MODEL` in the pi provider's environment in T3 Code's settings.

## Limits

- This is not a sandbox. A reviewer model can be wrong or tricked. Read [pi's security notes](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md) and use a container for untrusted work.
- The reviewer's outcome stands, as in Codex, so a risky call it underrates, or a high one it wrongly thinks you asked for, runs. Only `critical` is enforced in code.
- The reviewer reads tool output and the agent's words as evidence. They cannot authorize anything, but text planted there can still mislead its judgment of what a call does.
- Unlike Codex's reviewer, it cannot run commands to check a target (what `rm -rf` would delete, whether a repository is private): it judges from the transcript, and leans toward denying when that is not enough.
- Long sessions are cut to fit: your messages first, then the newest of the rest. A step you ruled out is kept unless your messages alone fill the budget.
- In Full access, nothing is reviewed, including calls on pi-auto-review's own files.
- `/auto-review` lists the denials since pi-auto-review loaded, and `/auto-review-report` the verdicts, so a reload or a new session clears both lists. `/auto-review-report` cannot report a call that went to you without review.
- `/auto-review-report` opens the draft with the OS's opener (`open`, `xdg-open`, `rundll32`); where none works, copy the URL it shows. A draft too long for a URL loses the end of the call. On Windows, `rundll32` can fail on a URL over about 2,000 characters, which a long call or note reaches; the URL it shows still works.
- An `/auto-review` approval stays in the transcript, as in Codex, so only the reviewer keeps it to one retry: the same call repeated later can be allowed again.
- `/tmp` is scratch: `edit` and `write` there run without review, as inside the working directory, and the reviewer lets commands write there too, so the agent can write or overwrite any file there (a command, unlike `edit` and `write`, can follow a symlink there elsewhere, and `edit` and `write` follow one made after pi-auto-review checked the path), and delete named files there, or files matching a prefix wildcard, or a folder named by a variable the same command sets, without asking, even ones you put there yourself.
- The agent can edit the instructions and skills inside the working directory without review, so an edit the reviewer misreads as harmless shapes later sessions.
- If the extension fails to load, nothing is reviewed (in T3 Code outside Full access, the bridge then asks about every call).
- The check for pi-auto-review's own files is lexical too: a command that reaches its folder through a relative path or a variable goes to the reviewer like any other call.
- `codemode` is trusted by name to be pi's sandbox: its own `models.*` calls (classifiers, image generation) reach the providers in `models.json` without review, though every tool it calls is checked.
- A compaction note, or a task for a pi subagent outside Full access, that names pi-auto-review's folder goes to the reviewer, not to you; the subagent asks you about its own calls on the folder. A delegation is taken to be for pi only when it names no provider (`target.providerInstanceId`, `target.driverKind`), so a task for this same pi instance named explicitly comes to you. `compact_context` is trusted by its name: another extension's tool of that name that does more than summarize goes to the reviewer, not to you, when it names the folder. Other tools that only pass text to an agent (`t3_thread_send`, ...) still come to you when they name the folder.
- In T3 Code, pi-auto-review turns off the bridge's own prompts by unsetting `T3_PI_RUNTIME_MODE`, which the bridge reads as Full access, and sets it back when the session ends or reloads. If a T3 Code release stops rereading it on every call, you get the bridge's prompts as well as these.
- Through the Responses API, every review asks for a strict JSON schema; a gateway that rejects that fails every review, so every reviewed call is blocked. Other APIs answer in plain text, where other JSON beside the verdict fails the review.
- A call of up to 128,000 characters goes to the reviewer whole, with the transcript (up to 48,000) and the policy. A reviewer whose context window cannot hold that fails the review, so the call is blocked as a review failure instead of coming to you; pick a model with a large window (GLM-5.3-Flash has a million tokens). In a call that large, a risky line is one among thousands: the eval checks one in the middle and one at the end, but the reviewer can still miss it.
- Some providers' safety filters reject review requests that contain exfiltration-like commands. Those count as failures, so the call is blocked.
- The triage model sees only your messages and the call. Until a call is blocked in the run, it cannot see what the agent did before, such as a script it wrote that the call runs.
- The triage model reads the call's text, which the agent wrote, and small classifiers do not treat it as hostile: text in a call can talk it into rating the call routine, and the call then runs without the reviewer. It also sees only your messages and the call, not the agent's words or tool output, so it cannot tell when untrusted content steered the agent; the reviewer can. This is why it is off by default.
- The triage model's questions were tuned on the eval's own cases, and the default `confidence` and the 0.2 for its two flags were chosen on its answers to those, the history, and cases written later; few of the calls that should ask came close. Its answers shift with the order of their options and the model's version. Rerun `npm run eval` when you change either.
- The review log keeps each call as the agent wrote it, and the reviewer's reason, which can quote it, secrets included: delete `pi-auto-review.jsonl` and its `.1` to start over. Only you can read a file it creates. It keeps at most about 10 MB, so older reviews are lost; copy the `.1` away to keep them. If the file cannot be moved to `.1`, reviews stop being logged rather than letting it grow. The call, the reason, and errors keep their first 500 characters, and a line still over 16,000 characters, such as one with a custom triage endpoint's oversized answers, keeps only the verdict. Two pi processes rotating it at the same moment can replace the full `.1` with a nearly empty one. A failed write is skipped without notice.
- Databricks limits OpenJev's input tokens per minute for a workspace. Over the limit, the reviewer judges the calls, so reviews slow down but do not fail.

## Development

```bash
npm test
```

## License

MIT
