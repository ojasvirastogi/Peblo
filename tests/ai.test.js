const test = require("node:test");
const assert = require("node:assert/strict");
const { localAiSummary, titleFromText } = require("../server/ai");

test("local AI fallback returns summary, actions, and title", () => {
  const output = localAiSummary(`Sprint planning for Peblo notes.
Prepare UI mockups for the share page.
Review API structure before demo.`);

  assert.match(output.summary, /Sprint planning/);
  assert.deepEqual(output.action_items, ["Prepare UI mockups for the share page.", "Review API structure before demo."]);
  assert.equal(output.suggested_title, "Sprint Planning For Peblo Notes.");
});

test("titleFromText cleans markdown-like text", () => {
  assert.equal(titleFromText("## weekly project sync notes and blockers"), "Weekly Project Sync Notes And Blockers");
});
