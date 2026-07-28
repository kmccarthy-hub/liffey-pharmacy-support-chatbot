import test from "node:test";
import assert from "node:assert/strict";
import { parseBoldSegments, parseFormattedSegments } from "../format.js";

test("bold Markdown markers become formatted segments", () => {
  assert.deepEqual(parseBoldSegments("Call **112** or **999** now."), [
    { text: "Call ", bold: false },
    { text: "112", bold: true },
    { text: " or ", bold: false },
    { text: "999", bold: true },
    { text: " now.", bold: false }
  ]);
});

test("plain and unmatched Markdown stays plain text", () => {
  assert.deepEqual(parseBoldSegments("Do not display **broken markup"), [
    { text: "Do not display **broken markup", bold: false }
  ]);
});

test("safe formatter handles list markers, bold, and italic text", () => {
  assert.deepEqual(parseFormattedSegments("* **Sunscreen** – *half price*\n- Vitamin D"), [
    { text: "• ", style: "plain" },
    { text: "Sunscreen", style: "bold" },
    { text: " – ", style: "plain" },
    { text: "half price", style: "italic" },
    { text: "\n• Vitamin D", style: "plain" }
  ]);
});
