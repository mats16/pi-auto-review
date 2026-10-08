import assert from "node:assert/strict";
import { test } from "node:test";
import { homedir } from "node:os";
import { needsHuman, needsReview, parseVerdict, touches } from "./index.ts";

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
	assert.equal(touches(self, "read", { path: `${self}/index.ts` }, cwd), false);
});

test("needsHuman lets full access skip low and medium denials only", () => {
	const deny = (risk: string) => ({ outcome: "deny" as const, risk, reason: "" });
	assert.equal(needsHuman({ outcome: "allow", risk: "low", reason: "" }, undefined), false);
	assert.equal(needsHuman(deny("medium"), "full-access"), false);
	assert.equal(needsHuman(deny("low"), "full-access"), false);
	assert.equal(needsHuman(deny("high"), "full-access"), true);
	assert.equal(needsHuman(deny("unknown"), "full-access"), true);
	assert.equal(needsHuman(deny("medium"), undefined), true);
});
