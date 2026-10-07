import assert from "node:assert/strict";
import test from "node:test";
import { categoryDescendants, categoryOptions, categoryPath, filterProblems } from "../src/lib/catalog.ts";
import { appendMockTurn, createMockAttempt } from "../src/mocks/interview.ts";
import seed from "../supabase/seed-data.json" with { type: "json" };
const { categories } = seed;

const filters = { categoryId: "all", difficulty: "all", query: "" };
const fixture = (id, overrides = {}) => ({ id, versionId: `version-${id}`, title: id, shortDescription: "A scenario", categoryIds: ["sim-to-real"], difficulty: "intermediate", tags: ["Control"], status: "published", ...overrides });

test("a parent category includes descendants at arbitrary depth and secondary memberships", () => {
  const tree = [...categories, { id: "deep-topic", slug: "deep-topic", name: "Deep topic", parentId: "sim-to-real" }, { id: "deeper-topic", slug: "deeper-topic", name: "Deeper topic", parentId: "deep-topic" }];
  const problem = fixture("multi-category", { categoryIds: ["computer-vision", "deeper-topic"] });
  assert.deepEqual(filterProblems([problem], tree, { ...filters, categoryId: "physical-ai" }).map((item) => item.id), ["multi-category"]);
  assert.equal(categoryOptions(tree).find((item) => item.id === "deeper-topic").depth, 4);
  assert.equal(categoryPath(tree, "deeper-topic"), "AI / Physical AI / Sim-to-Real / Deep topic / Deeper topic");
});

test("empty categories return no problems and malformed cycles terminate", () => {
  assert.deepEqual(filterProblems([fixture("drone")], categories, { ...filters, categoryId: "security" }), []);
  const cycle = [{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "a" }];
  assert.equal(categoryDescendants(cycle, "a").size, 2);
  assert.equal(categoryPath(cycle, "a"), "B / A");
});

test("published filtering excludes draft, needs-review and archived data and preserves repository order", () => {
  const items = [fixture("basics", { difficulty: "beginner" }), fixture("draft", { status: "draft" }), fixture("review", { status: "needs_review" }), fixture("archived", { status: "archived" }), fixture("drone")];
  assert.deepEqual(filterProblems(items, categories, filters).map((item) => item.id), ["basics", "drone"]);
});

test("category, difficulty and normalized text filters combine without a question type", () => {
  const items = [fixture("Drone"), fixture("Basics", { difficulty: "beginner" }), fixture("Expert", { difficulty: "advanced" })];
  assert.deepEqual(filterProblems(items, categories, { categoryId: "ai", difficulty: "intermediate", query: "  CONTROL  " }).map((item) => item.id), ["Drone"]);
  assert.deepEqual(filterProblems(items, categories, { ...filters, difficulty: "beginner" }).map((item) => item.id), ["Basics"]);
  assert.deepEqual(filterProblems(items, categories, { ...filters, difficulty: "advanced" }).map((item) => item.id), ["Expert"]);
});

test("mock feedback is content-independent and does not deliver a hint or an answer", () => {
  const attempt = createMockAttempt(fixture("drone", { versionId: "pv-drone-1" }));
  const first = appendMockTurn(attempt, "I would predict a state transition.", "2026-10-05T10:00:00Z");
  const second = appendMockTurn(attempt, "I am still considering the scenario.", "2026-10-05T10:00:00Z");
  assert.equal(first.messages.at(-1).content, second.messages.at(-1).content);
  assert.equal(first.demoProgress, second.demoProgress);
  assert.equal(first.messages.filter((message) => message.role === "system_hint").length, 0);
  assert.deepEqual(first.hintsUsed, []);
  assert.equal(attempt.messages.length, 2);
  assert.equal(first.messages.length, 4);
});

test("empty, oversize and completed-session messages do not mutate the mock session", () => {
  const attempt = createMockAttempt(fixture("drone", { versionId: "pv-drone-1" }));
  assert.equal(appendMockTurn(attempt, "   ", "now"), attempt);
  assert.equal(appendMockTurn(attempt, "x".repeat(4001), "now"), attempt);
  const completed = { ...attempt, status: "completed" };
  assert.equal(appendMockTurn(completed, "Another message", "now"), completed);
});

test("long mock conversations never claim completion or a correctness score", () => {
  let attempt = createMockAttempt(fixture("drone", { versionId: "pv-drone-1" }));
  for (let i = 0; i < 20; i++) attempt = appendMockTurn(attempt, `Reasoning ${i}`, "2026-10-05T10:00:00Z");
  assert.equal(attempt.demoProgress, 75);
  assert.equal(attempt.status, "in_progress");
  assert.equal(new Set(attempt.messages.map((message) => message.id)).size, attempt.messages.length);
});
