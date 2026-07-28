const RXNORM_BASE_URL = "https://rxnav.nlm.nih.gov/REST";
const MEDICINE_QUESTION = /\b(stock|have|sell|carry|available|rxnorm|medicine|drug)\b/i;

function cleanSearchTerm(value) {
  return String(value || "")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function extractRxNormTerm(message, records = []) {
  if (!MEDICINE_QUESTION.test(message)) return "";
  const lowerMessage = message.toLowerCase();
  const knownIngredients = records
    .map((record) => cleanSearchTerm(record.active_ingredient))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const known = knownIngredients.find((ingredient) => lowerMessage.includes(ingredient.toLowerCase()));
  if (known) return known;

  const stockQuestion = message.match(
    /\b(?:have|stock|sell|carry)\s+([a-z0-9][a-z0-9 '&-]{1,59}?)(?:\s+(?:in stock|available))?[?!.,]*$/i
  );
  if (stockQuestion) return cleanSearchTerm(stockQuestion[1]);

  const namedLookup = message.match(/\b(?:what is|look up|check)\s+([a-z0-9][a-z0-9 '&-]{1,59}?)[?!.,]*$/i);
  return namedLookup ? cleanSearchTerm(namedLookup[1]) : "";
}

function conceptsForType(payload, type) {
  const groups = payload?.allRelatedGroup?.conceptGroup || [];
  const group = groups.find((candidate) => candidate.tty === type);
  return (group?.conceptProperties || []).slice(0, 8).map((concept) => ({
    rxcui: String(concept.rxcui || "").slice(0, 30),
    name: String(concept.name || "").slice(0, 180),
    synonym: String(concept.synonym || "").slice(0, 180)
  }));
}

async function fetchJson(fetchFn, url) {
  const response = await fetchFn(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache"
    },
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error(`RxNorm returned HTTP ${response.status}`);
  return response.json();
}

export async function fetchRxNormLookup(term, fetchFn = fetch, now = Date.now()) {
  const query = cleanSearchTerm(term);
  if (!query) return null;

  const searchUrl = `${RXNORM_BASE_URL}/approximateTerm.json?term=${encodeURIComponent(query)}&maxEntries=10&_=${now}`;
  const searchPayload = await fetchJson(fetchFn, searchUrl);
  const candidates = (searchPayload?.approximateGroup?.candidate || [])
    .filter((candidate) => candidate?.rxcui && candidate?.name && candidate?.source === "RXNORM")
    .slice(0, 20);
  const exact = candidates.find((candidate) => candidate.name.toLowerCase() === query.toLowerCase());
  const match = exact || candidates[0];

  if (!match) {
    return { query, matched: false, fetchedAt: new Date(now).toISOString() };
  }

  const relatedUrl = `${RXNORM_BASE_URL}/rxcui/${encodeURIComponent(match.rxcui)}/allrelated.json?_=${now}`;
  const relatedPayload = await fetchJson(fetchFn, relatedUrl);
  return {
    query,
    matched: true,
    matchedName: String(match.name).slice(0, 180),
    rxcui: String(match.rxcui).slice(0, 30),
    ingredients: conceptsForType(relatedPayload, "IN"),
    brandedDrugs: conceptsForType(relatedPayload, "SBD"),
    clinicalDrugs: conceptsForType(relatedPayload, "SCD"),
    fetchedAt: new Date(now).toISOString()
  };
}

export function matchCatalogByIngredients(records, rxNormLookup) {
  const ingredients = new Set(
    (rxNormLookup?.ingredients || []).map((ingredient) => ingredient.name.toLowerCase())
  );
  if (!ingredients.size) return [];
  return records.filter((record) => ingredients.has(String(record.active_ingredient || "").toLowerCase()));
}

export { RXNORM_BASE_URL };
