# Installing pi-auto-review

These steps are for a coding agent asked to install pi-auto-review for its user. Run them in order. Where a step asks the user something, ask only what that step asks, end your turn, and go on when the user answers: some agents, such as pi, have no tool for asking, so a question asked mid-turn goes unseen.

1. Check that pi is installed: `pi --version`. If the command is not found, stop and tell the user to install pi first (https://pi.dev); do not install it yourself.

2. Install the package for the user:

   ```bash
   pi install git:github.com/mats16/pi-auto-review
   ```

   To pin a release, add its tag: `git:github.com/mats16/pi-auto-review@<tag>`. If `pi list` already shows pi-auto-review, from `npm:@mats16/pi-auto-review` or from git, do not install it a second time: run `pi update` with the source `pi list` shows (`pi update git:github.com/mats16/pi-auto-review`, not `--extensions`, which updates every package), and use that source in the steps below.

3. **Ask: which model should review tool calls?** Run `pi --list-models` first and offer a few of the models it lists (as `provider/model-id`), plus the choice of none, which uses the session's model. Say that each review is one request to this model before a call runs, so a fast, smaller model keeps pi responsive. If `PI_AUTO_REVIEW_MODEL` is set in the environment, say that it overrides this choice. End your turn.

4. **Ask: turn on the triage model?** Explain that it is experimental and off by default: a fast classifier (such as Databricks' OpenJev) sees the user's messages and the call first, and a call it finds routine runs without the reviewer, in a fraction of a second; it never blocks a call, but text the agent writes into a call can talk it into clearing that call. End your turn. If the user says no, go to step 6.

5. **Ask: the classifier's endpoint, model ID, and API key**, in one message:
   - The endpoint: the full `https` URL of its System One API. On Databricks, `https://<workspace>.cloud.databricks.com/ai-gateway/typesafe/v1/systemone`.
   - The model ID, as the endpoint names it. Offer `system.ai.openjev-qwen35-4b` (Databricks' OpenJev).
   - How to get the API key. Recommend a shell command that prints a token, written after a `!`, over pasting the key into the chat, where it stays in the transcript: on Databricks, `!databricks auth token --profile <profile> | jq -re .access_token`, so ask for the profile name. Use a name of only letters, digits, `-`, and `_`: the command runs in a shell, so ask again for any other.

   End your turn. If the answer leaves one of them out, ask for just that one, and end your turn again.

6. Write the answers to pi's user settings, `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json` when that is set). If the user chose none in step 3, leave out `model`, and remove an `autoReview.model` the file already has; if the user said no in step 4, leave out `triage`, and set `"enabled": false` in an `autoReview.triage` the file already has:

   ```json
   {
     "autoReview": {
       "model": "provider/model-id",
       "triage": {
         "enabled": true,
         "endpoint": "https://<workspace>.cloud.databricks.com/ai-gateway/typesafe/v1/systemone",
         "model": "system.ai.openjev-qwen35-4b",
         "apiKey": "!databricks auth token --profile <profile> | jq -re .access_token"
       }
     }
   }
   ```

   Merge it into the file: keep every other key, including the `packages` entry step 2 added. If the file is not valid JSON, stop and tell the user rather than overwrite it. Do not write it to a project's `.pi/settings.json`, which pi-auto-review ignores. Leave the other settings (`triage.confidence`, `triage.tools`, `readOnlyTools`, `log`) unset unless the user asks for them; README.md describes them.

7. Check that `pi list` shows pi-auto-review. If triage is on and its `apiKey` is a `!` command, check that the command prints a token without showing it: `key=$(<the command, without its !>) && [ -n "$key" ] && echo ok`; if it does not print `ok`, tell the user, since every triage call would fail and go to the reviewer. Then tell the user what you set, that it loads in the next pi session (restart pi; in T3 Code, start a new thread), and that `/auto-review` lists the calls it denied.

Do not edit the installed package's files. To remove it: `pi remove` with the source `pi list` shows, such as `pi remove git:github.com/mats16/pi-auto-review`.
