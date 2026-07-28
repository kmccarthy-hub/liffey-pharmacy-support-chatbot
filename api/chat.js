const ALLOWED_ORIGINS = new Set([
  "https://kmccarthy-hub.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

const SYSTEM_INSTRUCTION = `You are the Liffey Pharmacy Support Assistant, an AI agent for a clearly fictional Irish community pharmacy created for an academic demonstration.

Your scope in this first build:
- Help with general, non-personalised questions about typical community-pharmacy products and services.
- Never claim that you can see live prices, stock, offers, opening hours, prescriptions, customer records, or pharmacy records. Live catalogue data is not connected in this build.
- Do not diagnose, recommend treatments for an individual's symptoms, assess interactions, interpret prescriptions, or provide personalised medical advice. Explain that a pharmacist or appropriate healthcare professional should help.
- If a message suggests immediate danger, severe symptoms, overdose, poisoning, self-harm, or another emergency, advise contacting emergency services on 112 or 999 in Ireland now. Do not attempt a diagnosis.
- For questions outside pharmacy support, politely say you are not designed to answer them and briefly redirect to pharmacy-related support. Respond naturally to the exact question so it is clear you understood it; do not use a canned one-line refusal.
- Never ask for or encourage personal, medical, prescription, payment, or contact information. If supplied, advise the user not to share it in chat.
- Be honest about uncertainty. Do not invent facts about Liffey Pharmacy.
- Use concise, friendly Irish English. Clearly identify yourself as an AI if asked.`;

const requestLog = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isRateLimited(req) {
  const rawIp = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const ip = String(rawIp).split(",")[0].trim();
  const now = Date.now();
  const recent = (requestLog.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-8).flatMap((turn) => {
    if (!turn || !["user", "model"].includes(turn.role) || typeof turn.text !== "string") return [];
    const text = turn.text.trim().slice(0, 1200);
    return text ? [{ role: turn.role, parts: [{ text }] }] : [];
  });
}

function extractReply(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("").trim();
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (req.headers.origin && !ALLOWED_ORIGINS.has(req.headers.origin)) {
    return res.status(403).json({ error: "This website is not permitted to use the assistant." });
  }
  if (isRateLimited(req)) {
    return res.status(429).json({ error: "The assistant is receiving too many requests. Please wait a minute." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  if (!apiKey) return res.status(503).json({ error: "The AI service has not been configured." });

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "Please enter a message." });
  if (message.length > 800) return res.status(400).json({ error: "Please keep your message under 800 characters." });

  const contents = [
    ...cleanHistory(req.body?.history),
    { role: "user", parts: [{ text: message }] }
  ];

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 420
        }
      })
    });

    const payload = await geminiResponse.json().catch(() => ({}));
    if (!geminiResponse.ok) {
      console.error("Gemini API error", geminiResponse.status, payload?.error?.status || "unknown");
      const status = geminiResponse.status === 429 ? 429 : 502;
      const messageText = status === 429
        ? "The free AI service has reached its current limit. Please try again shortly."
        : "The AI service could not complete the request.";
      return res.status(status).json({ error: messageText });
    }

    const reply = extractReply(payload);
    if (!reply) return res.status(502).json({ error: "The AI returned an empty response." });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ reply, model });
  } catch (error) {
    console.error("Chat endpoint failure", error instanceof Error ? error.message : "unknown");
    return res.status(502).json({ error: "The AI service is temporarily unavailable." });
  }
}

export { cleanHistory, extractReply, SYSTEM_INSTRUCTION };

