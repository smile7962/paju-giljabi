// Run in v2/worker: node --test
// All prompts and addresses in these tests are synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "./ai-draft.js";

const valid = {
  purpose: "가상 현장 확인", address: "합성 가상현장", visitTime: "14:00",
  attendees: "가상 관계자", check: "자재 적치 확인", action: "가상 관계자에게 정리 요청"
};
const root = "https://smile7962.github.io";
const endpoint = "https://worker.example/draft";
const access = "test-very-long-demo-token-1234567890";
const env = {
  GEMINI_API_KEY: "test-placeholder-not-real",
  TRIPON_DEMO_TOKEN: access,
  GEMINI_MODEL: "gemini-3.5-flash-lite",
  DRAFT_RATE_LIMITER: { limit: async () => ({ success: true }) }
};
function request(body = valid, token = access, origin = root) {
  return new Request(endpoint, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json",
      Authorization: "Bearer " + token },
    body: JSON.stringify(body)
  });
}
function fakeGemini(data) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("missing token fails with 401 before Gemini call", async () => {
  const result = await handler.fetch(request(valid, "wrong"), env);
  assert.equal(result.status, 401);
});
test("wrong Origin is rejected", async () => {
  const result = await handler.fetch(request(valid, access, "https://evil.example"), env);
  assert.equal(result.status, 403);
});
test("fails closed if rate limiting not configured", async () => {
  const result = await handler.fetch(request(), { ...env, DRAFT_RATE_LIMITER: undefined });
  assert.equal(result.status, 503);
});
test("enforces rate limit", async () => {
  const result = await handler.fetch(request(), {
    ...env, DRAFT_RATE_LIMITER: { limit: async () => ({ success: false }) }
  });
  assert.equal(result.status, 429);
});
test("valid structured Gemini output is delivered", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => fakeGemini({ purpose: valid.purpose, check: valid.check, action: valid.action });
  try {
    const result = await handler.fetch(request(), env);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { purpose: valid.purpose, check: valid.check, action: valid.action });
  } finally { globalThis.fetch = originalFetch; }
});
test("prevents invented completed action from a blank action field", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => fakeGemini({ purpose: valid.purpose, check: valid.check, action: "공사중지 명령 완료" });
  try {
    const result = await handler.fetch(request({ ...valid, action: "" }), env);
    assert.equal(result.status, 422);
  } finally { globalThis.fetch = originalFetch; }
});
test("rejects unexpected PII fields before AI call", async () => {
  const result = await handler.fetch(request({ ...valid, residentId: "fake-id" }), env);
  assert.equal(result.status, 422);
});
test("rejects duplicate-location fields for a different visit", async () => {
  const result = await handler.fetch(request({ ...valid, stopId: "S02" }), env);
  assert.equal(result.status, 422);
});


test("Gemini outbound payload uses documented responseFormat JSON schema, never leaks photo/HWPX", async () => {
  const originalFetch = globalThis.fetch;
  const outbound = [];
  globalThis.fetch = async (url, options) => {
    outbound.push({ url, options, body: JSON.parse(options.body) });
    return fakeGemini({ purpose: valid.purpose, check: valid.check, action: valid.action });
  };
  try {
    const result = await handler.fetch(request(), env);
    assert.equal(result.status, 200);
    assert.equal(outbound.length, 1);
    const call = outbound[0];
    assert.match(call.url, /models\/gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(call.options.headers["x-goog-api-key"], env.GEMINI_API_KEY);
    const generation = call.body.generationConfig;
    assert.equal(generation.responseFormat.text.mimeType, "APPLICATION_JSON");
    assert.deepEqual(generation.responseFormat.text.schema.required, ["purpose", "check", "action"]);
    assert.deepEqual(Object.keys(generation.responseFormat.text.schema.properties),
      ["purpose", "check", "action"]);
    assert.equal(call.body.contents[0].role, "user");
    const input = JSON.parse(call.body.contents[0].parts[0].text);
    assert.deepEqual(Object.keys(input),
      ["purpose", "address", "visitTime", "attendees", "check", "action"]);
    assert.ok(!JSON.stringify(call.body).includes(env.GEMINI_API_KEY));
    assert.ok(!JSON.stringify(call.body).includes(env.TRIPON_DEMO_TOKEN));
    assert.ok(!JSON.stringify(call.body).includes("HWPX"));
    const output = JSON.stringify(await result.json());
    assert.ok(!output.includes(env.GEMINI_API_KEY));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini model denied returns safe diagnosis without provider response body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("INVALID_SECRET_PROVIDER_DETAIL", {status:403});
  try {
    const result = await handler.fetch(request(), env);
    assert.equal(result.status, 502);
    const data = await result.json();
    assert.equal(data.code, "PROVIDER_AUTH");
    assert.ok(!JSON.stringify(data).includes("INVALID_SECRET_PROVIDER_DETAIL"));
  } finally { globalThis.fetch = originalFetch; }
});

test("Gemini model not found and quota errors have distinct safe error codes", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, code] of [[404,"PROVIDER_MODEL"],[429,"PROVIDER_QUOTA"]]) {
      globalThis.fetch = async () => new Response("SECRET", {status});
      const result = await handler.fetch(request(), env);
      assert.equal(result.status, 502);
      assert.equal((await result.json()).code, code);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("Gemini empty or malformed structured outputs are rejected", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => fakeGemini({purpose:"",check:"",action:""});
    let result = await handler.fetch(request(), env);
    assert.equal(result.status, 200);
    globalThis.fetch = async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{text:"not-json"}] } }]
    }), {status:200});
    result = await handler.fetch(request(), env);
    assert.equal(result.status, 422);
    assert.equal((await result.json()).code, "PROVIDER_INVALID_JSON");
    globalThis.fetch = async () => new Response(JSON.stringify({
      candidates: [{ content: {parts:[]} }]
    }), {status:200});
    result = await handler.fetch(request(), env);
    assert.equal(result.status, 422);
    assert.equal((await result.json()).code, "PROVIDER_EMPTY");
  } finally { globalThis.fetch = originalFetch; }
});

test("CORS preflight only answers approved origin, server rejects missing required security bindings", async () => {
  const preflight = new Request(endpoint, {
    method:"OPTIONS", headers:{Origin:root}
  });
  let result = await handler.fetch(preflight, env);
  assert.equal(result.status, 204);
  assert.equal(result.headers.get("access-control-allow-origin"), root);
  result = await handler.fetch(request(), {...env, GEMINI_API_KEY: undefined});
  assert.equal(result.status, 503);
  result = await handler.fetch(request(), {...env, TRIPON_DEMO_TOKEN: undefined});
  assert.equal(result.status, 503);
});

test("non-JSON requests and oversized inputs are rejected before Gemini", async () => {
  const plain = new Request(endpoint, {
    method:"POST", headers:{Origin:root, Authorization:"Bearer "+access,
      "Content-Type":"text/plain"},
    body:"not JSON"
  });
  let result = await handler.fetch(plain, env);
  assert.equal(result.status, 415);
  const large = request({...valid, check:"x".repeat(4001)});
  result = await handler.fetch(large, env);
  assert.equal(result.status, 422);
});
