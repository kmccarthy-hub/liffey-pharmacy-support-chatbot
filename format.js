export function parseBoldSegments(text) {
  const segments = [];
  const pattern = /\*\*(.+?)\*\*/gs;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), bold: false });
  }

  return segments.length ? segments : [{ text, bold: false }];
}

export function parseFormattedSegments(text) {
  const normalised = text.replace(/^(\s*)[*-]\s+/gm, "$1• ");
  const segments = [];
  const pattern = /\*\*(.+?)\*\*|\*([^*\n]+?)\*/gs;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(normalised)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: normalised.slice(cursor, match.index), style: "plain" });
    }
    segments.push({ text: match[1] ?? match[2], style: match[1] ? "bold" : "italic" });
    cursor = pattern.lastIndex;
  }

  if (cursor < normalised.length) {
    segments.push({ text: normalised.slice(cursor), style: "plain" });
  }

  return segments.length ? segments : [{ text: normalised, style: "plain" }];
}

export function appendFormattedText(element, text) {
  const document = element.ownerDocument;
  for (const segment of parseFormattedSegments(text)) {
    if (segment.style === "bold") {
      const strong = document.createElement("strong");
      strong.textContent = segment.text;
      element.append(strong);
    } else if (segment.style === "italic") {
      const emphasis = document.createElement("em");
      emphasis.textContent = segment.text;
      element.append(emphasis);
    } else {
      element.append(document.createTextNode(segment.text));
    }
  }
}

export function ensureRetryGuidance(message) {
  const cleaned = String(message || "").trim();
  return /\btry again\b/i.test(cleaned)
    ? cleaned
    : `${cleaned} Please try again shortly.`.trim();
}
