import test from "node:test";
import assert from "node:assert/strict";
import { parseBoldSegments } from "../format.js";

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

