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

export function appendFormattedText(element, text) {
  const document = element.ownerDocument;
  for (const segment of parseBoldSegments(text)) {
    if (segment.bold) {
      const strong = document.createElement("strong");
      strong.textContent = segment.text;
      element.append(strong);
    } else {
      element.append(document.createTextNode(segment.text));
    }
  }
}

