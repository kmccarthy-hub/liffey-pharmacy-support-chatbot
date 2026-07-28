import { appendFormattedText } from "./format.js?v=3";

const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const messages = document.querySelector("#messages");
const sendButton = document.querySelector("#send-button");
const clearButton = document.querySelector("#clear-chat");
const connectionLabel = document.querySelector("#connection-label");
const suggestions = document.querySelector(".suggestions");

const welcomeHtml = messages.innerHTML;
const conversation = [];
const apiEndpoint = window.LIFFEY_CONFIG?.apiEndpoint;

function appendMessage(role, text, extraClass = "") {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"} ${extraClass}`.trim();

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "AI assistant";

  const paragraph = document.createElement("p");
  appendFormattedText(paragraph, text);
  article.append(label, paragraph);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function showTyping() {
  const article = document.createElement("article");
  article.className = "message assistant-message typing";
  article.setAttribute("aria-label", "AI assistant is responding");
  article.innerHTML = "<span></span><span></span><span></span>";
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function setConnection(text, isError = false) {
  connectionLabel.innerHTML = "";
  const dot = document.createElement("span");
  dot.className = `status-dot${isError ? " error" : ""}`;
  dot.setAttribute("aria-hidden", "true");
  connectionLabel.append(dot, document.createTextNode(text));
}

async function sendMessage(question) {
  const cleaned = question.trim();
  if (!cleaned || sendButton.disabled) return;

  appendMessage("user", cleaned);
  input.value = "";
  input.focus();
  sendButton.disabled = true;
  suggestions.hidden = true;
  setConnection("Gemini is thinking…");
  const typing = showTyping();

  try {
    if (!apiEndpoint || apiEndpoint.includes("YOUR-VERCEL")) {
      throw new Error("The secure AI endpoint has not been configured yet.");
    }

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: cleaned, history: conversation.slice(-8) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The AI service could not respond.");

    typing.remove();
    appendMessage("assistant", data.reply);
    conversation.push(
      { role: "user", text: cleaned },
      { role: "model", text: data.reply }
    );
    const fetchedTime = data.liveData?.fetchedAt
      ? new Date(data.liveData.fetchedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        })
      : "just now";
    const recordCount = data.liveData?.recordCount ? ` · ${data.liveData.recordCount} items` : "";
    setConnection(`Live data${recordCount} · fetched ${fetchedTime}`);
  } catch (error) {
    typing.remove();
    const message = error instanceof TypeError
      ? "The secure AI service could not be reached."
      : error.message;
    appendMessage("assistant", `${message} Please try again shortly.`, "error-message");
    setConnection("AI connection unavailable", true);
  } finally {
    sendButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.question));
});

clearButton.addEventListener("click", () => {
  conversation.length = 0;
  messages.innerHTML = welcomeHtml;
  suggestions.hidden = false;
  setConnection("AI assistant ready");
  input.focus();
});
