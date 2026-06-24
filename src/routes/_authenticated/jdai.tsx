import { createFileRoute } from "@tanstack/react-router";
import { useRouteGuard, AccessDenied } from "@/components/PermissionGate";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, MessageSquarePlus, Trash2, FileText, ThumbsUp, ThumbsDown, Sparkles, ArrowLeft, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Wrench } from "lucide-react";
import {
  createConversation,
  listConversations,
  getConversation,
  deleteConversation,
  submitFeedback,
  renameConversation,
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
  const __guard = useRouteGuard("reports.ai_analytics");
  const qc = useQueryClient();
  const listFn = useServerFn(listConversations);
  const createFn = useServerFn(createConversation);
  const getFn = useServerFn(getConversation);
  const deleteFn = useServerFn(deleteConversation);
  const feedbackFn = useServerFn(submitFeedback);
  const renameFn = useServerFn(renameConversation);

  const { data: conversations = [] } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: () => listFn(),
    staleTime: 60_000,           // treat as fresh for 60s — avoids flicker on tab switch
    placeholderData: (prev) => prev, // keep old list visible while refetching
  });

  const [activeId, setActiveId] = useState<string | null>(null);

  // pick first conversation when none selected (only on desktop/wider screens)
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      if (!activeId && conversations.length > 0) {
        setActiveId(conversations[0].id);
      }
    }
  }, [activeId, conversations]);

  const { data: initialMessages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ["ai-messages", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      if (!activeId) return [];
      const rows = await getFn({ data: { id: activeId } });
      return rows.map((r): UIMessage => {
        const parts: any[] = [];
        if (Array.isArray(r.tool_calls)) {
          parts.push(...(r.tool_calls as any[]));
        }
        const hasSearchDoc = parts.some((p) => p.type === "tool-search_documents");
        if (!hasSearchDoc && Array.isArray(r.sources) && r.sources.length > 0) {
          parts.push({
            type: "tool-search_documents",
            toolCallId: "mock-search",
            state: "result",
            output: { results: r.sources },
          });
        }
        parts.push({ type: "text", text: r.content });

        return {
          id: r.id,
          role: r.role as "user" | "assistant",
          content: r.content,
          parts,
        };
      });
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

  const renameConv = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameFn({ data: { id, title } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
  });

  const activeConversation = conversations.find((c) => c.id === activeId);
  const activeTitle = activeConversation?.title ?? "New conversation";

  if (!__guard.isLoading && !__guard.allowed) return <AccessDenied perm="reports.ai_analytics" label="JD AI" />;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar with conversations */}
      <aside className={cn("w-full md:w-64 border-r flex flex-col bg-muted/30", activeId ? "hidden md:flex" : "flex")}>
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
                "group flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                activeId === c.id && "bg-muted font-medium",
              )}
              onClick={() => setActiveId(c.id)}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{c.title || "Untitled"}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete conversation "${c.title || "Untitled"}"?`)) delConv.mutate(c.id);
                }}
                className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 transition-opacity ml-1"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <main className={cn("flex-1 flex flex-col min-w-0", activeId ? "flex" : "hidden md:flex")}>
        {activeId ? (
          <ChatWindow
            key={activeId}
            conversationId={activeId}
            initialMessages={initialMessages}
            loadingHistory={loadingMsgs}
            title={activeTitle}
            onRename={async (newTitle) => {
              await renameConv.mutateAsync({ id: activeId, title: newTitle });
            }}
            onBack={() => setActiveId(null)}
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
  title,
  onRename,
  onBack,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  loadingHistory: boolean;
  onFeedback: (messageId: string, helpful: boolean) => void;
  title: string;
  onRename: (newTitle: string) => Promise<void>;
  onBack?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);

  useEffect(() => {
    setTempTitle(title);
  }, [title]);

  const handleSaveTitle = async () => {
    const trimmed = tempTitle.trim();
    if (!trimmed || trimmed === title) {
      setIsEditing(false);
      return;
    }
    try {
      await onRename(trimmed);
      setIsEditing(false);
    } catch (err: any) {
      toast.error("Failed to rename conversation: " + err.message);
    }
  };

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

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (status !== "streaming" && status !== "submitted") {
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages, status]);

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
    
    const isDefaultTitle = !title || title === "New conversation" || title === "Untitled";
    void sendMessage({ text });

    if (isDefaultTitle) {
      const words = text.split(/\s+/).filter(Boolean);
      const newTitle = words.slice(0, 6).join(" ") + (words.length > 6 ? "..." : "");
      if (newTitle) {
        try {
          await onRename(newTitle);
        } catch (err) {
          console.error("Failed to auto-rename conversation:", err);
        }
      }
    }
  };

  const handleSuggestion = async (text: string) => {
    if (isBusy) return;

    const isDefaultTitle = !title || title === "New conversation" || title === "Untitled";
    void sendMessage({ text });

    if (isDefaultTitle) {
      const words = text.split(/\s+/).filter(Boolean);
      const newTitle = words.slice(0, 6).join(" ") + (words.length > 6 ? "..." : "");
      if (newTitle) {
        try {
          await onRename(newTitle);
        } catch (err) {
          console.error("Failed to auto-rename conversation:", err);
        }
      }
    }
  };

  return (
    <>
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card text-card-foreground shadow-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden shrink-0"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          
          <div className="h-9 w-9 rounded-full bg-primary/10 grid place-items-center shrink-0">
            <Bot className="h-5 w-5 text-primary" />
          </div>

          {isEditing ? (
            <div className="flex items-center gap-2 max-w-sm flex-1">
              <Input
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") {
                    setTempTitle(title);
                    setIsEditing(false);
                  }
                }}
              />
            </div>
          ) : (
            <div className="min-w-0 font-medium">
              <div className="text-sm font-semibold truncate">{title || "Untitled"}</div>
            </div>
          )}
        </div>

        {/* Far Right Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditing ? (
            <>
              <Button size="icon-sm" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={handleSaveTitle} title="Save">
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon-sm" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => { setTempTitle(title); setIsEditing(false); }} title="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsEditing(true)}
              title="Rename conversation"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

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
  state?: string;
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
        {/* Tool calls — show a discreet status line only; never expose raw params/results to users */}
        {parts
          .filter((p) => p.type?.startsWith("tool-"))
          .map((p, i) => {
            const name = (p.type ?? "").replace(/^tool-/, "").replace(/_/g, " ");
            const running = p.state === "input-streaming" || p.state === "input-available";
            return (
              <div
                key={(p.toolCallId ?? "") + i}
                className="my-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Wrench className="h-3 w-3" />
                <span>{running ? `Looking up ${name}…` : `Used ${name}`}</span>
              </div>
            );
          })}

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
