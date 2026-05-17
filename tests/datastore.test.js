const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DataStore } = require("../server/datastore");
const { hashPassword } = require("../server/auth");

test("datastore creates searchable notes and insights", () => {
  const file = path.join(os.tmpdir(), `peblo-test-${Date.now()}.json`);
  const store = new DataStore(file);
  const user = store.createUser({ name: "Ada", email: "ada@example.com", passwordHash: hashPassword("password123") });
  const note = store.createNote(user.id, {
    title: "Project Planning",
    content: "Prepare UI mockups",
    tags: ["work", "meeting"],
    category: "Product"
  });

  assert.equal(store.listNotes(user.id, { search: "mockups" }).length, 1);
  assert.equal(store.listNotes(user.id, { tag: "work" })[0].note_id, note.note_id);
  assert.equal(store.insights(user.id).total_notes, 1);

  fs.rmSync(file, { force: true });
});
