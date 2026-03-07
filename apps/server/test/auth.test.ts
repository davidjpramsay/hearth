import assert from "node:assert/strict";
import test from "node:test";
import { verifyAdminPassword } from "../src/routes/auth";

test("verifyAdminPassword requires initialized admin credentials", () => {
  const result = verifyAdminPassword({
    storedPasswordHash: null,
    password: "secret-pass",
    comparePassword: () => true,
  });

  assert.equal(result, "setup-required");
});

test("verifyAdminPassword authorizes matching credentials", () => {
  let compareCalls = 0;

  const result = verifyAdminPassword({
    storedPasswordHash: "stored-hash",
    password: "secret-pass",
    comparePassword: (password, hash) => {
      compareCalls += 1;
      assert.equal(password, "secret-pass");
      assert.equal(hash, "stored-hash");
      return true;
    },
  });

  assert.equal(result, "authorized");
  assert.equal(compareCalls, 1);
});

test("verifyAdminPassword rejects invalid credentials", () => {
  const result = verifyAdminPassword({
    storedPasswordHash: "stored-hash",
    password: "wrong-pass",
    comparePassword: () => false,
  });

  assert.equal(result, "invalid");
});
