const SHEET_ID = "1-4Ts225vZjeDYvF4enj7fp4oMqpAq_e8pjGv2-Nse9c";
const SHEET_NAME = "Untitled";
const REQUIRED_FIELDS = [
  "item_id",
  "item_name",
  "category",
  "type",
  "active_ingredient",
  "price_eur",
  "pack_size",
  "requires_pharmacist",
  "availability",
  "stock_this_week",
  "special_offer",
  "description"
];

export function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

export function recordsFromCsv(csv) {
  const rows = parseCsv(csv).filter((row) => row.some((value) => value.trim()));
  const headers = rows.shift()?.map((header) => header.trim()) || [];
  const missing = REQUIRED_FIELDS.filter((field) => !headers.includes(field));
  if (missing.length) throw new Error(`Live sheet is missing required fields: ${missing.join(", ")}`);

  return rows.slice(0, 100).map((cells) => Object.fromEntries(
    REQUIRED_FIELDS.map((field) => {
      const column = headers.indexOf(field);
      return [field, String(cells[column] || "").trim().slice(0, 800)];
    })
  ));
}

export async function fetchLiveCatalog(fetchFn = fetch, now = Date.now()) {
  const endpoint = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&_=${now}`;
  const response = await fetchFn(endpoint, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "text/csv",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache"
    }
  });

  if (!response.ok) throw new Error(`Live sheet returned HTTP ${response.status}`);
  const records = recordsFromCsv(await response.text());
  if (!records.length) throw new Error("Live sheet returned no catalogue records");

  return {
    records,
    fetchedAt: new Date(now).toISOString()
  };
}

export { REQUIRED_FIELDS, SHEET_ID, SHEET_NAME };

