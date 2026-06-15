import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, MessageSquarePlus, Trash2, FileText, ThumbsUp, ThumbsDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
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
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import {
  createConversation,
  listConversations,
  getConversation,
  deleteConversation,
  submitFeedback,
} from "@/lib/jdai.functions";

export const Route = createFileRoute("/_authenticated/jdai")({
  component: JDAIPage,
});

const SUGGESTIONS = [
  "What were our total sales last week?",
  "Who is on break right now?",
  "How many employees do we have in each department?",
  "What is our refund policy?",
];

function JDAIPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversations);
  const createFn = useServerFn(createConversation);
  const getFn = useServerFn(getConversation);
  const deleteFn = useServerFn(deleteConversation);
  const feedbackFn = useServerFn(submitFeedback);

  const { data: conversations = [] } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: () => listFn(),
  });

  const [activeId, setActiveId] = useState<string | null>(null);

  // pick first conversation when none selected
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  const { data: initialMessages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ["ai-messages", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      if (!activeId) return [];
      const rows = await getFn({ data: { id: activeId } });
      return rows.map((r): UIMessage => ({
        id: r.id,
        role: r.role as "user" | "assistant",
        parts: [{ type: "text", text: r.content }],
      }));
    },
  });

  const newConv = useMutation({
    mutationFn: () => createFn({ data: { title: "New conversation" } }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      setActiveId(c.id);
    },
  });

  const delConv = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      if (activeId === id) setActiveId(null);
    },
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar with conversations */}
      <aside className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b">
          <Button
            className="w-full"
            size="sm"
            onClick={() => newConv.mutate()}
            disabled={newConv.isPending}
          >
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            New conversation
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-3 text-center">
              No conversations yet
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                activeId === c.id && "bg-muted font-medium",
              )}
              onClick={() => setActiveId(c.id)}
            >
              <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{c.title || "Untitled"}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this conversation?")) delConv.mutate(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        {activeId ? (
          <ChatWindow
            key={activeId}
            conversationId={activeId}
            initialMessages={initialMessages}
            loadingHistory={loadingMsgs}
            onFeedback={(messageId, helpful) =>
              feedbackFn({ data: { messageId, helpful } })
                .then(() => toast.success("Thanks for your feedback"))
                .catch((e: Error) => toast.error(e.message))
            }
          />
        ) : (
          <EmptyHero onStart={() => newConv.mutate()} />
        )}
      </main>
    </div>
  );
}

function EmptyHero({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 grid place-items-center mb-4">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">JD AI</h1>
      <p className="text-muted-foreground max-w-md mb-6">
        Ask about company documents, sales, attendance, breaks, or your workforce.
      </p>
      <Button onClick={onStart}>
        <MessageSquarePlus className="h-4 w-4 mr-2" />
        Start a conversation
      </Button>
    </div>
  );
}

function ChatWindow({
  conversationId,
  initialMessages,
  loadingHistory,
  onFeedback,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  loadingHistory: boolean;
  onFeedback: (messageId: string, helpful: boolean) => void;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { conversationId },
        fetch: async (input, init) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          return fetch(input, { ...init, headers });
        },
      }),
    [conversationId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message),
  });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId, status]);

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isBusy) return;
    setInput("");
    await sendMessage({ text });
  };

  const handleSuggestion = async (text: string) => {
    if (isBusy) return;
    await sendMessage({ text });
  };

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent>
          {loadingHistory && (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          )}
          {!loadingHistory && messages.length === 0 && (
            <ConversationEmptyState
              icon={<Sparkles className="h-10 w-10 text-primary" />}
              title="Ask JD AI anything"
              description="I can search company documents and answer questions about sales, attendance, breaks, and workforce."
            >
              <div className="grid sm:grid-cols-2 gap-2 mt-4 max-w-xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestion(s)}
                    className="text-left text-sm rounded-md border bg-card hover:bg-accent p-3 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          )}

          {messages.map((m) => (
            <MessageBlock key={m.id} message={m} onFeedback={onFeedback} />
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

      <div className="border-t bg-background p-4">
        {error && (
          <p className="text-xs text-destructive mb-2">{error.message}</p>
        )}
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
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!input.trim() || isBusy} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}

type AnyPart = {
  type: string;
  text?: string;
  toolCallId?: string;
  state?: ToolPart["state"];
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function MessageBlock({
  message,
  onFeedback,
}: {
  message: UIMessage;
  onFeedback: (messageId: string, helpful: boolean) => void;
}) {
  const parts = (message.parts ?? []) as AnyPart[];
  const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
  const sources = collectSources(parts);

  return (
    <Message from={message.role}>
      <MessageContent>
        {/* Tool calls */}
        {parts
          .filter((p) => p.type?.startsWith("tool-"))
          .map((p, i) => (
            <Tool key={(p.toolCallId ?? "") + i} defaultOpen={false} className="my-2">
              <ToolHeader type={p.type as `tool-${string}`} state={p.state ?? "output-available"} />
              <ToolContent>
                {p.input !== undefined && <ToolInput input={p.input} />}
                {(p.output !== undefined || p.errorText) && (
                  <ToolOutput output={renderToolOutput(p)} errorText={p.errorText} />
                )}
              </ToolContent>
            </Tool>
          ))}

        {text && message.role === "assistant" ? (
          <MessageResponse>{text}</MessageResponse>
        ) : (
          text && <div className="whitespace-pre-wrap">{text}</div>
        )}

        {/* Sources */}
        {message.role === "assistant" && sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sources.map((s) => (
              <Link
                key={s.document_id}
                to="/knowledge/$id"
                params={{ id: s.document_id }}
                className="inline-flex items-center gap-1 text-xs rounded-md border bg-card px-2 py-1 hover:bg-accent"
              >
                <FileText className="h-3 w-3" />
                {s.title}
              </Link>
            ))}
          </div>
        )}

        {/* Feedback */}
        {message.role === "assistant" && text && (
          <div className="mt-3 flex items-center gap-1 text-muted-foreground">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onFeedback(message.id, true)}
              aria-label="Helpful"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onFeedback(message.id, false)}
              aria-label="Not helpful"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </MessageContent>
    </Message>
  );
}

function collectSources(parts: AnyPart[]): Array<{ document_id: string; title: string }> {
  const out: Array<{ document_id: string; title: string }> = [];
  for (const p of parts) {
    if (p.type === "tool-search_documents") {
      const o = p.output as { results?: Array<{ document_id: string; title: string }> } | undefined;
      for (const r of o?.results ?? []) {
        if (!out.some((s) => s.document_id === r.document_id)) {
          out.push({ document_id: r.document_id, title: r.title });
        }
      }
    }
  }
  return out;
}

function renderToolOutput(p: AnyPart) {
  if (p.output === undefined) return null;
  return (
    <pre className="text-xs overflow-auto max-h-64 bg-muted/50 p-2 rounded">
      {JSON.stringify(p.output, null, 2)}
    </pre>
  );
}