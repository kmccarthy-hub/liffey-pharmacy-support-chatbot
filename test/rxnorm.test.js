import test from "node:test";
import assert from "node:assert/strict";
import {
  extractRxNormTerm,
  fetchRxNormLookup,
  matchCatalogByIngredients
} from "../api/rxnorm.js";

test("medicine term extraction uses a known live-sheet ingredient", () => {
  const records = [{ active_ingredient: "Ibuprofen" }];
  assert.equal(extractRxNormTerm("Do you have ibuprofen tablets?", records), "Ibuprofen");
});

test("medicine term extraction supports an unknown requested brand", () => {
  assert.equal(extractRxNormTerm("Do you have Advil in stock?", []), "Advil");
  assert.equal(extractRxNormTerm("Can I order food?", []), "");
});

test("RxNorm lookup uses live no-cache requests and extracts related concepts", async () => {
  const calls = [];
  const fetchDouble = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("approximateTerm")) {
      return {
        ok: true,
        async json() {
          return {
            approximateGroup: {
              candidate: [{ rxcui: "153010", name: "Advil", source: "RXNORM" }]
            }
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          allRelatedGroup: {
            conceptGroup: [
              { tty: "IN", conceptProperties: [{ rxcui: "5640", name: "ibuprofen" }] },
              { tty: "SBD", conceptProperties: [{ rxcui: "153008", name: "ibuprofen 200 MG Oral Tablet [Advil]" }] },
              { tty: "SCD", conceptProperties: [{ rxcui: "310965", name: "ibuprofen 200 MG Oral Tablet" }] }
            ]
          }
        };
      }
    };
  };

  const result = await fetchRxNormLookup("Advil", fetchDouble, 12345);
  assert.equal(result.rxcui, "153010");
  assert.equal(result.ingredients[0].name, "ibuprofen");
  assert.equal(result.brandedDrugs[0].name, "ibuprofen 200 MG Oral Tablet [Advil]");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.options.cache === "no-store"));
  assert.ok(calls.every((call) => call.options.headers["Cache-Control"].includes("no-cache")));
  assert.ok(calls.every((call) => String(call.url).includes("_=12345")));
});

test("RxNorm ingredient matches a generic item from the live catalogue", () => {
  const records = [
    { item_name: "Ibuprofen 200mg Tablets", active_ingredient: "Ibuprofen" },
    { item_name: "Sunscreen", active_ingredient: "" }
  ];
  const matches = matchCatalogByIngredients(records, {
    ingredients: [{ name: "ibuprofen" }]
  });
  assert.deepEqual(matches, [records[0]]);
});
