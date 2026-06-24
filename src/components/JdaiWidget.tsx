import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouterState, Link } from "@tanstack/react-router";
import { X, Maximize2, Sparkles, FileText, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { createConversation, renameConversation } from "@/lib/jdai.functions";

const SUGGESTIONS = [
  "What were our total sales last week?",
  "Who is on break right now?",
  "How many employees in each department?",
  "What is our refund policy?",
];

type AnyPart = {
  type: string;
  text?: string;
  output?: unknown;
};

export function JdaiWidget() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(() => crypto.randomUUID());

  // Hide on the full-page JD AI route and on auth route
  if (pathname.startsWith("/jdai") || pathname.startsWith("/auth")) return null;

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open JD AI"
          className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all grid place-items-center"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-40 w-[380px] max-w-[calc(100vw-2rem)]",
            "h-[600px] max-h-[calc(100vh-2rem)] bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden",
          )}
        >
          <header className="h-12 px-3 flex items-center gap-2 border-b bg-muted/30 shrink-0">
            <div className="h-7 w-7 rounded-md bg-primary/10 grid place-items-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-tight">JD AI</div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                Company assistant
              </div>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setSessionKey(crypto.randomUUID())}
              aria-label="New chat"
              title="New chat"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" asChild aria-label="Open full page" title="Open full page">
              <Link to="/jdai">
                <Maximize2 className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <WidgetChat key={sessionKey} sessionId={sessionKey} />
        </div>
      )}
    </>
  );
}

function WidgetChat({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createConversation);
  const renameFn = useServerFn(renameConversation);

  // Lazily-created conversation ID — null until the first message is sent
  const [conversationId, setConversationId] = useState<string | null>(null);
  const creationPromiseRef = useRef<Promise<string> | null>(null);

  /** Ensure a conversation exists in the DB, create one if not. Returns its id. */
  const ensureConversation = (): Promise<string> => {
    if (creationPromiseRef.current) return creationPromiseRef.current;

    const promise = (async () => {
      const conv = await createFn({ data: { title: "New conversation" } });
      setConversationId(conv.id);
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      return conv.id;
    })();

    creationPromiseRef.current = promise;
    return promise;
  };

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: conversationId ? { conversationId } : {},
        fetch: async (input, init) => {
          // Make sure a conversation exists before each request and inject its id
          const convId = await ensureConversation();
          const body = JSON.parse((init?.body as string) ?? "{}");
          body.conversationId = convId;
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          return fetch(input, { ...init, headers, body: JSON.stringify(body) });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: sessionId,
    transport,
    onError: (e) => toast.error(e.message),
  });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [status]);

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isBusy) return;
    setInput("");
    void sendMessage({ text });
    // Auto-name the conversation from the first query
    const convId = await ensureConversation();
    if (messages.length === 0) {
      const words = text.split(/\s+/).filter(Boolean);
      const newTitle = words.slice(0, 6).join(" ") + (words.length > 6 ? "..." : "");
      try {
        await renameFn({ data: { id: convId, title: newTitle } });
        qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      } catch { /* silent */ }
    }
  };

  const handleSuggestion = async (text: string) => {
    if (isBusy) return;
    void sendMessage({ text });
    const convId = await ensureConversation();
    if (messages.length === 0) {
      const words = text.split(/\s+/).filter(Boolean);
      const newTitle = words.slice(0, 6).join(" ") + (words.length > 6 ? "..." : "");
      try {
        await renameFn({ data: { id: convId, title: newTitle } });
        qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      } catch { /* silent */ }
    }
  };

  return (
    <>
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="px-3 py-3">
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={<Sparkles className="h-8 w-8 text-primary" />}
              title="Ask JD AI"
              description="Try one of these to get started"
            >
              <div className="grid gap-1.5 mt-3 w-full">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestion(s)}
                    className="text-left text-xs rounded-md border bg-card hover:bg-accent p-2 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          )}

          {messages.map((m) => (
            <MiniMessage key={m.id} message={m} />
          ))}

          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Thinking…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t bg-background p-2 shrink-0">
        {error && <p className="text-[11px] text-destructive mb-1 px-1">{error.message}</p>}
        <PromptInput
          onSubmit={(_msg, e) => {
            e?.preventDefault?.();
            handleSubmit();
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask JD AI…"
            disabled={isBusy}
            className="min-h-[44px] text-base md:text-sm"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!input.trim() || isBusy} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}

function MiniMessage({ message }: { message: UIMessage }) {
  const parts = (message.parts ?? []) as AnyPart[];
  const text = parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n");

  const sources: Array<{ document_id: string; title: string }> = [];
  for (const p of parts) {
    if (p.type === "tool-search_documents") {
      const o = p.output as { results?: Array<{ document_id: string; title: string }> } | undefined;
      for (const r of o?.results ?? []) {
        if (!sources.some((s) => s.document_id === r.document_id)) {
          sources.push({ document_id: r.document_id, title: r.title });
        }
      }
    }
  }

  if (!text && sources.length === 0) {
    // Show a subtle "working" hint when only tool calls exist so far
    if (message.role === "assistant") {
      return (
        <Message from="assistant">
          <MessageContent>
            <Shimmer>Searching…</Shimmer>
          </MessageContent>
        </Message>
      );
    }
    return null;
  }

  return (
    <Message from={message.role}>
      <MessageContent>
        {text && message.role === "assistant" ? (
          <MessageResponse>{text}</MessageResponse>
        ) : (
          text && <div className="whitespace-pre-wrap text-sm">{text}</div>
        )}
        {message.role === "assistant" && sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sources.map((s) => (
              <Link
                key={s.document_id}
                to="/knowledge/$id"
                params={{ id: s.document_id }}
                className="inline-flex items-center gap-1 text-[11px] rounded-md border bg-card px-1.5 py-0.5 hover:bg-accent"
              >
                <FileText className="h-3 w-3" />
                <span className="truncate max-w-[160px]">{s.title}</span>
              </Link>
            ))}
          </div>
        )}
      </MessageContent>
    </Message>
  );
}