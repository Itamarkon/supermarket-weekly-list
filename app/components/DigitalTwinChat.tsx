"use client";

import { FormEvent, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function DigitalTwinChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi, I am Itamar's Digital Twin. Ask me anything about his career journey, leadership, and AI delivery experience.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/digital-twin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: nextMessages.slice(-8),
        }),
      });

      const data = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !data.reply) {
        throw new Error(data.error || "Unable to get AI response.");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply! }]);
    } catch (submitError) {
      const errorMessage =
        submitError instanceof Error ? submitError.message : "Unexpected error occurred.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-black/40 p-6 md:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold text-white">Digital Twin AI Chat</h3>
        <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-200 uppercase">
          Powered by OpenRouter
        </span>
      </div>

      <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              message.role === "user"
                ? "ml-auto bg-cyan-500/20 text-cyan-50"
                : "mr-auto border border-white/10 bg-zinc-900 text-zinc-100"
            }`}
          >
            {message.content}
          </div>
        ))}

        {loading ? (
          <div className="mr-auto inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
            Thinking...
          </div>
        ) : null}
      </div>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-input">
          Ask about Itamar&apos;s career
        </label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          placeholder="Ask something like: What experience does Itamar have leading AI infrastructure delivery?"
          className="w-full resize-none rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none ring-cyan-300/40 transition placeholder:text-zinc-500 focus:ring"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            Career Q&A only. For best results, ask concise, specific questions.
          </p>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Sending..." : "Ask Digital Twin"}
          </button>
        </div>
      </form>

      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
