# Which calls the triage model may clear

Decided on 2026-10-22, with Codex's auto-review (openai/codex `a6839a4`) as the model.

## The miss

The user asked the agent to report a bug to one Slack channel. The agent posted to another, with `mcp__slack__slack_write_api_call` (`chat.postMessage`), and the triage model cleared it as `connected` (0.77): its option for searching or delegating through a connected tool does not tell a search from a post. Twenty seconds later the reviewer denied the follow-up to the same thread for its destination. All four Slack writes the triage model cleared in the log reached other people (two `chat.postMessage`, a `conversations.join`, a `conversations.leave`).

## What Codex does

- Whether an MCP call is gated at all (`requires_mcp_tool_approval`): `destructiveHint: true` gates it, `readOnlyHint: true` does not, and otherwise only `destructiveHint: false` with `openWorldHint: false` skips the gate; a missing hint counts as `true`. `approval_mode` per server or tool overrides it.
- Where its fast scorer may approve without the reviewer: per kind of action (`computer_use`, `shell`, `file_changes`, `mcp`, `network`, `permissions`, `other_tools`), `disabled`, `synchronous`, or `adaptive`. Only `computer_use` is `adaptive` by default; `mcp` and `shell` go to the reviewer every time. It never splits MCP by whether a tool writes.

## The hints here

From each server's `tools/list` (pi's MCP extension passes all four hints on; T3 Code's bridge passes none):

- `slack_write_api_call`, `slack_batch_write_api_call`: `readOnlyHint: false` only. Codex would gate them.
- `web_search`: no hints. Codex would gate it.
- chrome-devtools' input and navigation tools, `genie_ask`: `readOnlyHint: false`. dbsql's `execute_sql`: none.
- Glean's `create_go_link` claims `readOnlyHint: true` though it creates a link: a hint is the server's word, and it already runs unreviewed.
- No tool that writes declares both `destructiveHint: false` and `openWorldHint: false`.
- `mcp__t3-code__*` and extension tools such as `compact_context`: none.

## The log

`~/.pi/agent/pi-auto-review.jsonl` and `.1`, 2026-10-20 02:11 to 10-21 15:27 UTC (37 hours): 6,082 calls judged, 4,945 by the triage model. The T3 Code status tools it cleared (580) have since moved to `autoReview.readOnlyTools`, so 5,502 calls would be judged now, 4,365 (79%) by the triage model. Of those, the calls that are not `bash`, `edit`, or `write`:

| Tool | Cleared by triage | Reviewed |
|---|---|---|
| `mcp__web_search__web_search` | 320 | 1 |
| `mcp__t3-code__delegate_task` | 154 | 18 |
| `compact_context` | 5 | 2 |
| `mcp__slack__slack_write_api_call` | 4 | 9 (1 denied: the follow-up above) |

A reviewed call takes 3.34 s at the median (4.61 s mean), a triage call 0.63 s (0.66 s), so each call moved to the reviewer adds 2.7 to 4.0 s.

## Options

| | Stops the miss | Calls moved to the reviewer (37 h) | Added wait | Ways around it | Setting |
|---|---|---|---|---|---|
| **A** Scopes, as Codex: `triage.scopes` picks kinds (`shell`, `files`, `mcp`, `other`), `mcp` off by default | Yes | 478 (web search, delegation, Slack) | 22–32 min | Turning `mcp` on brings the miss back with the searches; a write tool from an extension (`other`) still goes to triage | One switch per kind; coarse |
| **B** Hints, as `requires_mcp_tool_approval`: a call Codex would gate skips triage; no hints counts as gated | Yes | 483 (every tool above: none declares both hints `false`) | 22–32 min | A server that lies (`create_go_link`); here it changes nothing, since every tool without `readOnlyHint` is gated | No setting, but its effect depends on each server's hints, which the user cannot see |
| **C** Names: a tool named `write`, `post`, `send`, `delete`, `update`, ... skips triage | Yes, by luck of the name | 4 | under 1 min | `execute_sql`, `genie_ask`, `navigate_page`, `fill_form`, `t3_pending_request_respond`, `schedule_task` write without such a word; a looser list catches `list_scheduled_tasks` | None, but a guess |
| **A per tool** (recommended): only pi's `bash`, `powershell`, `edit`, `write` go to triage, and the MCP and extension tools named in `triage.tools` | Yes | 483 by default; 163 with `web_search` named; 9 with `delegate_task` too | 22–32, 7–11, or under 1 min | A name the user lists is trusted, as `readOnlyTools` is, but its calls are still judged by triage, not run | One list of names, the shape of `readOnlyTools` |

The triage model's share of the 5,502 calls: 79% now, 71% by default, 76% with `web_search` named, 79% with `delegate_task` too.

## Decision

A per tool. It is Codex's default (MCP and other tools go to the reviewer) and fails closed as the rules ask: a tool nobody named goes to the reviewer, whatever its server says. Codex's scope switch would make the user choose between the miss and 320 searches' worth of waiting; a list lets them keep the searches without the posts. Hints decide nothing new here: the only tools a careful server could mark safe (`destructiveHint: false`, `openWorldHint: false`) already declare `readOnlyHint`, and T3 Code's tools have none. Names guess.

- **`bash`, `powershell`, `edit`, `write`**: still triaged, as now. `bash` is most of the triage model's work (3,880 of 4,945) and its questions were tuned on it. A shell command that posts (`curl -X POST` to a chat API) still goes to triage: its `others` option catches those, but it is the same classifier (see README's Limits).
- **`web_search`**: off by default, since its server gives no hints and the query leaves the machine. README suggests naming it: a search is routine in POLICY, and the triage model's `has_secret` question catches a secret in the query, which the eval checks.
- **`delegate_task`**: off by default. The task can go to another provider, whose calls this extension does not check, or ask for Full access, and only the reviewer knows POLICY's rule for that. Name it if the wait costs more.
- **`compact_context`**: off by default (5 calls in 37 hours); naming it is harmless.

Not done: Codex's hint rule for tools that declare both hints `false`; add it when a server here declares them on a tool that writes.

## Measured

On the eval's cases (81 synthesized, 80 history), OpenJev at `confidence` 0.75, one request per case, through the extension's own `review()` with the reviewer stubbed out, before and after this change:

| | Before | After |
|---|---|---|
| Synthesized calls that should run, cleared | 20 of 39 (51%) | 12 of 39 (31%) |
| Synthesized calls that should ask, cleared | 0 of 42 | 0 of 42 |
| History, cleared | 55 of 80 (69%) | 47 of 80 (59%) |
| Margin (synthetic asks): the closest call, in logits from clearing | 0.02, `gh issue comment` | 0.02, the same |
| Closest MCP call that should ask | 0.51, a subagent asked to turn the reviewer off (`loosens` alone held it) | not judged |

The closest call is a shell command that posts, which this change leaves to triage (README's Limits). The eval gained the miss as a case (a bug report posted to a channel the user did not name), which now goes to the reviewer, and the reviewer denies it.
