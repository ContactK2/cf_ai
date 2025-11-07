export interface Env {
  AI: any;
  MODEL?: string;
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

export class ChatRoom {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request) {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    let payload: any;
    try {
      payload = await req.json<any>();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { message, sessionId = "default", system } = payload || {};
    if (!message || typeof message !== "string") {
      return Response.json({ error: "Missing 'message'" }, { status: 400 });
    }

    const key = `history:${sessionId}`;
    const history: Msg[] = (await this.state.storage.get<Msg[]>(key)) ?? [];

    const messages: Msg[] = [
      ...(system ? [{ role: "system", content: String(system) }] : []),
      ...history,
      { role: "user", content: message },
    ];

    // Prefer configured model from env; otherwise try a set of known-good fallbacks.
    const preferredModel = (this.env as any)?.MODEL as string | undefined;
    const candidates = [
      preferredModel,
      "@cf/meta/llama-3.1-70b-instruct",
      "@cf/meta/llama-3.1-8b-instruct",
      "@cf/meta/llama-3.2-11b-vision-instruct",
      "@cf/meta/llama-3.2-3b-instruct",
      "@cf/mistral/mistral-7b-instruct-v0.2",
    ].filter(Boolean) as string[];

    let assistant = "";
    const hasAI = (this.env as any)?.AI && typeof (this.env as any).AI.run === "function";
    if (!hasAI) {
      // Local dev fallback when Workers AI binding is unavailable (e.g., `wrangler dev --local`).
      assistant = mockReply(messages);
    } else {
      let lastErr: any = null;
      for (const model of candidates) {
        try {
          const aiResult: any = await (this.env as any).AI.run(model, { messages });
          assistant =
            typeof aiResult === "string"
              ? aiResult
              : aiResult?.response ?? aiResult?.output_text ?? aiResult?.result ?? JSON.stringify(aiResult);
          lastErr = null;
          break;
        } catch (err: any) {
          lastErr = err;
          const msg = String(err?.message ?? err);
          // Try next model if this one isn't available.
          const retriable = /no such model|model not found|5007|task/i.test(msg);
          if (!retriable) break;
        }
      }
      if (lastErr) {
        return Response.json({ error: `AI error: ${lastErr?.message ?? String(lastErr)}` }, { status: 500 });
      }
    }

    const updated: Msg[] = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: assistant },
    ];

    const MAX_TURNS = 30; // keep context bounded
    const trimmed = updated.slice(-MAX_TURNS * 2);
    await this.state.storage.put(key, trimmed);

    return Response.json({ reply: assistant });
  }
}

function mockReply(messages: Msg[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const sys = messages.find((m) => m.role === "system")?.content;
  const pre = sys ? `[system-ok] ` : "";
  // Simple helpful echo with tiny guidance for local mode.
  return `${pre}Local mock: I received "${lastUser}". Switch to remote dev (wrangler dev) to use Workers AI.`;
}
