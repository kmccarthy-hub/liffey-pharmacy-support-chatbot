import test from "node:test";
import assert from "node:assert/strict";
import { fetchLiveCatalog, parseCsv, recordsFromCsv } from "../api/sheet.js";

const HEADERS = "item_id,item_name,category,type,active_ingredient,price_eur,pack_size,requires_pharmacist,availability,stock_this_week,special_offer,description";
const ROW = 'P024,"Sunscreen SPF50 Lotion",Skin Care,Product,,13,200ml,No,"In stock",29,"Buy one get one half price","Light, easy-to-apply lotion"';

test("CSV parser handles quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsv('name,description\nItem,"A comma, and ""quotes"""'), [
    ["name", "description"],
    ["Item", 'A comma, and "quotes"']
  ]);
});

test("sheet rows are converted into the required catalogue fields", () => {
  const records = recordsFromCsv(`${HEADERS}\n${ROW}`);
  assert.equal(records.length, 1);
  assert.equal(records[0].item_name, "Sunscreen SPF50 Lotion");
  assert.equal(records[0].stock_this_week, "29");
  assert.equal(records[0].description, "Light, easy-to-apply lotion");
});

test("live fetch disables caching and adds a unique request value", async () => {
  let captured;
  const result = await fetchLiveCatalog(async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      async text() { return `${HEADERS}\n${ROW}`; }
    };
  }, 1785272400000);

  assert.match(captured.url, /_\=1785272400000/);
  assert.equal(captured.options.cache, "no-store");
  assert.match(captured.options.headers["Cache-Control"], /no-store/);
  assert.equal(result.records.length, 1);
  assert.equal(result.fetchedAt, "2026-07-28T21:00:00.000Z");
});

test("missing required columns are rejected", () => {
  assert.throws(() => recordsFromCsv("item_id,item_name\nP001,Paracetamol"), /missing required fields/i);
});

