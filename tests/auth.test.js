const test = require("node:test");
const assert = require("node:assert/strict");
const { createToken, hashPassword, verifyPassword, verifyToken } = require("../server/auth");

test("password hashes verify only with the original password", () => {
  const hash = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", hash), true);
  assert.equal(verifyPassword("wrong password", hash), false);
});

test("signed tokens round-trip with the same secret", () => {
  const token = createToken("USR_TEST", "secret-one");
  assert.equal(verifyToken(token, "secret-one").sub, "USR_TEST");
  assert.equal(verifyToken(token, "secret-two"), null);
});
