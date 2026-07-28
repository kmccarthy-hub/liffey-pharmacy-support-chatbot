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
  assert.match(SYSTEM_INSTRUCTION, /fresh LIVE_CATALOG_DATA/i);
  assert.match(SYSTEM_INSTRUCTION, /untrusted reference data/i);
  assert.match(SYSTEM_INSTRUCTION, /LIVE_RXNORM_DATA/i);
  assert.match(SYSTEM_INSTRUCTION, /requested brand itself is not listed/i);
  assert.match(SYSTEM_INSTRUCTION, /never call it an equivalent, alternative, substitute/i);
  assert.match(SYSTEM_INSTRUCTION, /listed for this week/i);
  assert.match(SYSTEM_INSTRUCTION, /112 or 999/i);
});

test("endpoint combines live RxNorm identity data with a live catalogue ingredient match", async (t) => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-secret-key";
  let geminiRequest;
  global.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes("docs.google.com")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return 'item_id,item_name,category,type,active_ingredient,price_eur,pack_size,requires_pharmacist,availability,stock_this_week,special_offer,description\nP013,Ibuprofen 200mg Tablets,Pain Relief,Medicine,Ibuprofen,4,16 tablets,No,In stock,35,Buy one get one half price,Pain relief tablets';
        }
      };
    }
    if (target.includes("approximateTerm")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { approximateGroup: { candidate: [{ rxcui: "153010", name: "Advil", source: "RXNORM" }] } };
        }
      };
    }
    if (target.includes("allrelated")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            allRelatedGroup: {
              conceptGroup: [
                { tty: "IN", conceptProperties: [{ rxcui: "5640", name: "ibuprofen" }] },
                { tty: "SBD", conceptProperties: [{ rxcui: "153008", name: "ibuprofen 200 MG Oral Tablet [Advil]" }] }
              ]
            }
          };
        }
      };
    }
    geminiRequest = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return { candidates: [{ content: { parts: [{ text: "Advil is not listed, but generic ibuprofen is listed." }] } }] };
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
    body: { message: "Do you have Advil in stock?", history: [] },
    socket: { remoteAddress: "rxnorm-test-ip" }
  };
  const res = responseDouble();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.liveData.sources, ["Google Sheet", "RxNorm"]);
  assert.equal(res.body.liveData.rxNorm.rxcui, "153010");
  const prompt = JSON.stringify(geminiRequest.contents);
  assert.match(prompt, /LIVE_RXNORM_DATA/);
  assert.match(prompt, /ibuprofen 200 MG Oral Tablet \[Advil\]/);
  assert.match(prompt, /Ibuprofen 200mg Tablets/);
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
    if (String(url).includes("docs.google.com")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return 'item_id,item_name,category,type,active_ingredient,price_eur,pack_size,requires_pharmacist,availability,stock_this_week,special_offer,description\nP024,Sunscreen SPF50 Lotion,Skin Care,Product,,13,200ml,No,In stock,29,Buy one get one half price,Light lotion';
        }
      };
    }
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
  assert.equal(res.body.liveData.source, "Google Sheet");
  assert.equal(res.body.liveData.recordCount, 1);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(captured.options.headers["x-goog-api-key"], "test-secret-key");
  assert.doesNotMatch(JSON.stringify(res.body), /test-secret-key/);
});
