import test from "node:test";
import assert from "node:assert/strict";
import { runWithToken, getMetaToken } from "./session.js";

test("getMetaToken returns undefined outside a session", () => {
  assert.equal(getMetaToken(), undefined);
});

test("runWithToken exposes the token inside the callback", () => {
  let observed: string | undefined;
  runWithToken("test-token-abc", () => {
    observed = getMetaToken();
  });
  assert.equal(observed, "test-token-abc");
});

test("runWithToken restores absence of token after callback returns", () => {
  runWithToken("transient", () => {});
  assert.equal(getMetaToken(), undefined);
});

test("nested runWithToken shadows outer token", () => {
  const observations: Array<string | undefined> = [];
  runWithToken("outer", () => {
    observations.push(getMetaToken());
    runWithToken("inner", () => {
      observations.push(getMetaToken());
    });
    observations.push(getMetaToken());
  });
  assert.deepEqual(observations, ["outer", "inner", "outer"]);
});

test("concurrent runWithToken calls keep tokens isolated", async () => {
  const results: Array<string | undefined> = [];
  await Promise.all([
    runWithToken("alpha", async () => {
      await new Promise((r) => setTimeout(r, 10));
      results.push(getMetaToken());
    }),
    runWithToken("beta", async () => {
      await new Promise((r) => setTimeout(r, 5));
      results.push(getMetaToken());
    }),
  ]);
  assert.deepEqual(results.sort(), ["alpha", "beta"]);
});
