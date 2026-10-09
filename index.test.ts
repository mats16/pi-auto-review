import assert from "node:assert/strict";
import { test } from "node:test";
import { homedir } from "node:os";
import autoReview, { needsReview, parseVerdict, touches } from "./index.ts";

const cwd = "/work/project";

test("needsReview skips read-only tools and ordinary edits inside cwd", () => {
	assert.equal(needsReview("read", { path: "/etc/passwd" }, cwd), false);
	assert.equal(needsReview("mcp_tool", {}, cwd, true), false);
	assert.equal(needsReview("edit", { path: "src/a.ts" }, cwd), false);
	assert.equal(needsReview("write", { path: "/work/project/README.md" }, cwd), false);
});

test("needsReview reviews commands, edits outside cwd, and dot paths", () => {
	assert.equal(needsReview("bash", { command: "ls" }, cwd), true);
	assert.equal(needsReview("mcp_tool", {}, cwd), true);
	assert.equal(needsReview("write", { path: "../other/a.ts" }, cwd), true);
	assert.equal(needsReview("write", { path: "/work/project-evil/a.ts" }, cwd), true);
	assert.equal(needsReview("edit", { path: "/etc/hosts" }, cwd), true);
	assert.equal(needsReview("write", { path: "." }, cwd), true);
	assert.equal(needsReview("write", { path: ".git/hooks/pre-commit" }, cwd), true);
	assert.equal(needsReview("edit", { path: "src/.env" }, cwd), true);
	assert.equal(needsReview("edit", {}, cwd), true);
});

test("needsReview resolves paths like pi's file tools", () => {
	assert.equal(needsReview("write", { path: "~/bin/tool" }, cwd), true);
	assert.equal(needsReview("write", { path: "@/etc/hosts" }, cwd), true);
	assert.equal(needsReview("write", { path: "file:///etc/hosts" }, cwd), true);
	assert.equal(needsReview("edit", { path: "@src/a.ts" }, cwd), false);
	assert.equal(needsReview("edit", { path: "..notes.md" }, cwd), true); // dot path, still reviewed
});

test("parseVerdict reads JSON, even inside a code fence", () => {
	assert.deepEqual(parseVerdict('{"outcome":"allow","risk":"low","reason":"ok"}'), { outcome: "allow", risk: "low", reason: "ok" });
	assert.equal(parseVerdict('```json\n{"outcome":"deny","risk":"high","reason":"push"}\n```')?.outcome, "deny");
});

test("parseVerdict rejects anything it cannot trust", () => {
	assert.equal(parseVerdict("allow"), undefined);
	assert.equal(parseVerdict('{"outcome":"yes"}'), undefined);
	assert.equal(parseVerdict("{not json}"), undefined);
	assert.equal(parseVerdict('{"outcome":"allow","risk":"critical","reason":"x"}')?.outcome, "deny");
	assert.deepEqual(parseVerdict('{"outcome":"allow","risk":"Critical","reason":"x"}'), { outcome: "deny", risk: "critical", reason: "x" });
	assert.equal(parseVerdict('{"outcome":"deny","reason":"x"}')?.outcome, "deny"); // no rating, a human decides
	assert.equal(parseVerdict('{"outcome":"deny","risk":"high","reason":"x"}')?.outcome, "deny");
});

test("parseVerdict lets a denial below high run, as Codex's auto-review does", () => {
	assert.equal(parseVerdict('{"outcome":"deny","risk":"medium","reason":"not asked for"}')?.outcome, "allow");
	assert.equal(parseVerdict('{"outcome":"deny","risk":"Low","reason":"x"}')?.outcome, "allow");
	assert.equal(parseVerdict('{"outcome":"allow","risk":"high","reason":"the user asked for this push"}')?.outcome, "allow");
});

test("touches catches calls on the extension's own files", () => {
	const self = `${homedir()}/ext/pi-auto-review`;
	assert.equal(touches(self, "write", { path: `${self}/index.ts` }, cwd), true);
	assert.equal(touches(self, "edit", { path: "~/ext/pi-auto-review/index.ts" }, cwd), true);
	assert.equal(touches(self, "write", { path: `${self}/..x` }, cwd), true);
	assert.equal(touches(self, "edit", { path: "src/a.ts" }, cwd), false);
	assert.equal(touches(self, "edit", { path: `${self}-other/a.ts` }, cwd), false);
	assert.equal(touches(self, "bash", { command: `sed -i '' s/a/b/ ${self}/index.ts` }, cwd), true);
	assert.equal(touches(self, "bash", { command: "cd ~/ext/pi-auto-review && sed -i '' s/a/b/ index.ts" }, cwd), true);
	assert.equal(touches(self, "bash", { command: "npm test" }, cwd), false);
	const win = "C:\\Users\\alice\\ext\\pi-auto-review";
	assert.equal(touches(win, "bash", { command: `printf x > "${win}\\index.ts"` }, "C:\\work"), true);
	assert.equal(touches(self, "read", { path: `${self}/index.ts` }, cwd), false);
});

/** Loads the extension as T3 Code would start pi in the given mode. */
function load(mode: string | undefined): Record<string, any> {
	if (mode === undefined) delete process.env.T3_PI_RUNTIME_MODE;
	else process.env.T3_PI_RUNTIME_MODE = mode;
	const handlers: Record<string, any> = {};
	autoReview({ on: (event: string, handler: any) => (handlers[event] = handler), getAllTools: () => [] } as any);
	return handlers;
}

/** Runs one bash call under a T3 mode, with a reviewer that denies at the given risk. */
async function runCall(mode: string | undefined, risk: string, command = "x") {
	const handlers = load(mode);
	const text = JSON.stringify({ outcome: "deny", risk, reason: "r" });
	const seen: string[] = [];
	const ctx = {
		cwd,
		hasUI: true,
		model: {},
		sessionManager: { getBranch: () => [] },
		modelRegistry: { complete: async () => (seen.push("review"), { stopReason: "stop", content: [{ type: "text", text }] }) },
		ui: { confirm: async () => (seen.push("confirm"), false), notify: () => seen.push("notify") },
	};
	const result = await handlers.tool_call({ toolName: "bash", input: { command } }, ctx);
	await new Promise((resolve) => setImmediate(resolve));
	return { blocked: result?.block === true, seen, mode: process.env.T3_PI_RUNTIME_MODE };
}

test("outside full access, the reviewer replaces T3's prompts and asks only on high-risk denials", async () => {
	assert.deepEqual(await runCall("approval-required", "high"), { blocked: true, seen: ["review", "confirm"], mode: undefined });
	assert.deepEqual(await runCall("auto-accept-edits", "unknown"), { blocked: true, seen: ["review", "confirm"], mode: undefined });
	assert.deepEqual(await runCall("approval-required", "medium"), { blocked: false, seen: ["review"], mode: undefined });
});

test("a reload hands T3's prompts back until the extension loads again", async () => {
	const handlers = load("approval-required");
	assert.equal(process.env.T3_PI_RUNTIME_MODE, undefined);
	await handlers.session_shutdown({ type: "session_shutdown", reason: "reload" });
	assert.equal(process.env.T3_PI_RUNTIME_MODE, "approval-required");
	assert.equal(load(undefined).session_shutdown, undefined); // plain pi has no T3 mode to hand back
});

test("full access never waits and shows only critical findings and self calls", async () => {
	assert.deepEqual(await runCall("full-access", "critical"), { blocked: false, seen: ["review", "notify"], mode: "full-access" });
	assert.deepEqual(await runCall("full-access", "high"), { blocked: false, seen: ["review"], mode: "full-access" });
	assert.deepEqual(await runCall("full-access", "low", `cat ${import.meta.dirname}/index.ts`), { blocked: false, seen: ["notify"], mode: "full-access" });
});
