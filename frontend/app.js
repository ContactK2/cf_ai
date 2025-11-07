const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const system = document.getElementById("system");
const sendBtn = document.getElementById("send");

const sessionId = (self.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);

function add(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = `${role}: ${text}`;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  add("user", text);
  input.value = "";
  sendBtn.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, message: text, system: system.value || undefined }),
    });

    const respText = await res.text();
    if (!res.ok) {
      try {
        const data = JSON.parse(respText);
        add("assistant", `Error ${res.status}: ${data.error || respText}`);
      } catch {
        add("assistant", `Error ${res.status}: ${respText}`);
      }
      return;
    }

    try {
      const data = JSON.parse(respText);
      add("assistant", data.reply);
    } catch {
      add("assistant", respText || "(no content)");
    }
  } catch (err) {
    add("assistant", `Network error: ${err?.message || err}`);
  } finally {
    sendBtn.disabled = false;
  }
});
