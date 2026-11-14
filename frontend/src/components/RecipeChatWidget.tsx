"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { askRecipeAssistantAction } from "@/app/actions/recipes";
import type { ChatTurn } from "@/lib/api-client";

interface RecipeChatWidgetProps {
  recipeId: string;
  recipeTitle: string;
}

interface ChatMessage {
  id: number;
  role: "user" | "model";
  content: string;
}

const MAX_MESSAGE_LENGTH = 500;
// Client-side cap on how much history we send — a first line of defense.
// The backend clamps its own copy of the history regardless of what's sent.
const MAX_HISTORY_TURNS_SENT = 10;

const GENERIC_ERROR = "Couldn't get a response. Please try again.";

/**
 * Floating AI assistant scoped to a single recipe. Renders a FAB that opens
 * a small chat panel; conversation state is held only in this component's
 * React state (ephemeral — nothing is persisted, and a full page reload
 * starts fresh by design).
 *
 * Minimize vs close are intentionally different:
 * - Minimize (header button or Escape) hides the panel but keeps `messages`,
 *   so reopening via the FAB resumes the same conversation.
 * - Close (header X button) hides the panel AND clears `messages`/input/error,
 *   so reopening starts a brand new conversation.
 */
export function RecipeChatWidget({ recipeId, recipeTitle }: RecipeChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to the latest message/typing indicator. Also re-runs when the
  // panel reopens (isOpen) so resuming a minimized conversation scrolls to
  // the latest turn instead of staying at the top of a freshly-mounted list.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending, isOpen]);

  // Focus the input whenever the panel opens (fresh open or resumed via minimize).
  useEffect(() => {
    if (isOpen) {
      textareaRef.current?.focus();
    }
  }, [isOpen]);

  // Escape minimizes (non-destructive) — deliberately does NOT clear history,
  // so an accidental key press can't wipe a conversation.
  useEffect(() => {
    if (!isOpen) return;
    function onEscape(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [isOpen]);

  function handleClose() {
    setIsOpen(false);
    setMessages([]);
    setInput("");
    setError(null);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;

    const messageId = nextId.current++;

    // Snapshot prior turns BEFORE appending the new message — `history` must
    // represent only what came before this question, per the backend contract.
    const history: ChatTurn[] = messages
      .slice(-MAX_HISTORY_TURNS_SENT)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { id: messageId, role: "user", content: text }]);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const result = await askRecipeAssistantAction(recipeId, text, history);
      if (result.success && result.reply) {
        setMessages((prev) => [...prev, { id: nextId.current++, role: "model", content: result.reply! }]);
      } else {
        // Roll back the optimistic user message and restore the input so the
        // user can just hit send again. This also prevents an unanswered
        // turn from lingering in `messages` — if it did, the next attempt
        // would send it as history immediately followed by a new question,
        // i.e. two consecutive "user" turns, which the Gemini API rejects.
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        setInput(text);
        setError(result.error || GENERIC_ERROR);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setInput(text);
      setError(GENERIC_ERROR);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Ignore Enter presses that are part of IME composition (e.g. typing
    // Japanese/Chinese/Korean via a composition dialog) so committing a
    // candidate doesn't prematurely submit the message.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <>
      {/* Collapsed FAB */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open recipe assistant"
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}

      {/* Open panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={`Recipe assistant for ${recipeTitle}`}
          className="fixed bottom-6 right-6 z-40 flex h-[32rem] max-h-[80vh] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
            <div className="flex items-center gap-2 overflow-hidden">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0 text-primary" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {recipeTitle}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Minimize chat"
                title="Minimize"
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M3 10a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close chat"
                title="Close (clears conversation)"
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                Ask me anything about{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{recipeTitle}</span> —
                substitutions, timing, temperatures, technique…
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-white"
                      : "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
                  }`}
                >
                  {m.content}
                </p>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start" aria-live="polite" aria-label="Assistant is typing">
                <div className="flex items-center gap-1.5 rounded-2xl bg-zinc-100 px-3 py-2.5 dark:bg-zinc-700">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                </div>
              </div>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <p
              role="alert"
              className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400"
            >
              {error}
            </p>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 border-t border-zinc-100 p-3 dark:border-zinc-700">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={isSending}
              rows={2}
              placeholder="Ask a question…"
              aria-label="Your question"
              className="max-h-24 flex-1 resize-none overflow-y-auto rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isSending || !input.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925a1.5 1.5 0 001.442 1.086h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
