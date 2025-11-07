export interface Env {
  AI: any;
  CHAT_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat" && request.method === "POST") {
      let bodyText = "";
      try {
        bodyText = await request.text();
      } catch {}

      const { sessionId = "default" } = safeJson(bodyText) || {};

      const id = env.CHAT_ROOM.idFromName(String(sessionId));
      const stub = env.CHAT_ROOM.get(id);

      return stub.fetch("https://chat.room/do", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyText || "{}",
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

function safeJson(text: string | null) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export { ChatRoom } from "./ChatRoom";

