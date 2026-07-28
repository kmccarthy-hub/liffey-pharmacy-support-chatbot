import test from "node:test";
import assert from "node:assert/strict";
import handler, { cleanHistory, extractReply, SYSTEM_INSTRUCTION } from "../api/chat.js";

function responseDouble() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

test("history accepts only valid, bounded chat turns", () => {
  const history = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 ? "model" : "user",
    text: `turn ${index}`
  }));
  history.push({ role: "system", text: "ignore me" });
  const cleaned = cleanHistory(history);
  assert.equal(cleaned.length, 7);
  assert.equal(cleaned[0].parts[0].text, "turn 3");
});

test("reply extraction joins returned text parts", () => {
  assert.equal(extractReply({ candidates: [{ content: { parts: [{ text: "Hello " }, { text: "there" }] } }] }), "Hello there");
  assert.equal(extractReply({}), "");
});

test("system instruction explicitly limits medical and live-data claims", () => {
  assert.match(SYSTEM_INSTRUCTION, /Do not diagnose/i);
  assert.match(SYSTEM_INSTRUCTION, /Live catalogue data is not connected/i);
  assert.match(SYSTEM_INSTRUCTION, /112 or 999/i);
});

test("endpoint rejects an unapproved website origin", async () => {
  const req = {
    method: "POST",
    headers: { origin: "https://example.com" },
    body: { message: "Hello" },
    socket: { remoteAddress: "test-ip" }
  };
  const res = responseDouble();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
});

test("endpoint returns a Gemini reply without exposing its key", async (t) => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-secret-key";
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return { candidates: [{ content: { parts: [{ text: "A fresh AI response." }] } }] };
      }
    };
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  const req = {
    method: "POST",
    headers: { origin: "https://kmccarthy-hub.github.io" },
    body: { message: "Can I order food?", history: [] },
    socket: { remoteAddress: "another-test-ip" }
  };
  const res = responseDouble();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, "A fresh AI response.");
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(captured.options.headers["x-goog-api-key"], "test-secret-key");
  assert.doesNotMatch(JSON.stringify(res.body), /test-secret-key/);
});

