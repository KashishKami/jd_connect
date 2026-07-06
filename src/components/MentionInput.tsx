import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type Candidate = { id: string; username: string; alias_name: string | null; full_name: string };

export type MentionInputHandle = { focus: () => void };

export const MentionInput = forwardRef<MentionInputHandle, {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}>(function MentionInput({ value, onChange, onSubmit, placeholder, maxLength, className }, fwdRef) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<Candidate[]>([]);
  const [active, setActive] = useState(0);

  useImperativeHandle(fwdRef, () => ({ focus: () => inputRef.current?.focus() }));

  const wrap = (before: string, after = before) => {
    const el = inputRef.current; if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + before.length + selected.length;
      el.setSelectionRange(pos, pos);
    });
  };
  const prefix = (p: string) => {
    const el = inputRef.current; if (!el) return;
    const start = el.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const newVal = value.slice(0, lineStart) + p + value.slice(lineStart);
    onChange(newVal);
    requestAnimationFrame(() => { el.focus(); const pos = start + p.length; el.setSelectionRange(pos, pos); });
  };

  const detect = (v: string, caret: number) => {
    const left = v.slice(0, caret);
    const m = /(?:^|\s)@([A-Za-z0-9_]{0,32})$/.exec(left);
    setQuery(m ? m[1] : null);
  };

  useEffect(() => {
    if (query === null) { setItems([]); return; }
    let cancelled = false;
    void (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }>)(
      "search_mention_candidates", { _q: query, _limit: 8 },
    ).then(({ data }) => { if (!cancelled) { setItems((data ?? []) as Candidate[]); setActive(0); } });
    return () => { cancelled = true; };
  }, [query]);

  const insert = (c: Candidate) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? value.length;
    const left = value.slice(0, caret);
    const right = value.slice(caret);
    const newLeft = left.replace(/@([A-Za-z0-9_]{0,32})$/, `@${c.username} `);
    const newVal = newLeft + right;
    onChange(newVal);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = newLeft.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const showSuggestions = query !== null && items.length > 0;

  return (
    <div className={`relative flex-1 ${className ?? ""}`}>
      {showSuggestions && (
        <div className="absolute bottom-full left-0 mb-1 w-72 max-h-60 overflow-auto rounded-md border bg-popover shadow z-50">
          {items.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insert(c); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${i === active ? "bg-muted" : ""}`}
            >
              <div className="font-medium">@{c.username}</div>
              <div className="text-xs text-muted-foreground truncate">{c.alias_name || c.full_name}</div>
            </button>
          ))}
        </div>
      )}
      <Textarea
        ref={inputRef}
        value={value}
        rows={2}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyUp={(e) => {
          const t = e.currentTarget;
          detect(t.value, t.selectionStart ?? t.value.length);
        }}
        onClick={(e) => {
          const t = e.currentTarget;
          detect(t.value, t.selectionStart ?? t.value.length);
        }}
        onKeyDown={(e) => {
          if (showSuggestions) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(items[active]); return; }
            if (e.key === "Escape") { e.preventDefault(); setQuery(null); return; }
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); wrap("**"); return; }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") { e.preventDefault(); wrap("*"); return; }
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        className="min-h-[44px] resize-y"
      />
    </div>
  );
});

function highlightMentions(text: string, isCurrentUser?: boolean): React.ReactNode {
  const parts = text.split(/(@[A-Za-z0-9_]{2,32})/g);
  return parts.map((p, i) =>
    /^@[A-Za-z0-9_]{2,32}$/.test(p) ? (
      <span
        key={i}
        className={
          isCurrentUser
            ? "text-white font-medium"
            : "text-primary font-medium"
        }
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function processChildren(children: React.ReactNode, isCurrentUser?: boolean): React.ReactNode {
  if (typeof children === "string") return highlightMentions(children, isCurrentUser);
  if (Array.isArray(children)) return children.map((c, i) => <React.Fragment key={i}>{processChildren(c, isCurrentUser)}</React.Fragment>);
  return children;
}

export function encodeQuote(msgId: string, senderName: string, body: string): string {
  const cleanBody = body.replace(/\[QUOTE\|.*?\]\n?/g, "");
  const truncated = cleanBody.length > 200 ? cleanBody.slice(0, 200) + "..." : cleanBody;
  const safeSender = senderName.replace(/\|/g, "-");
  const safeBody = truncated.replace(/\|/g, "-").replace(/\n/g, " ");
  return `[QUOTE|${msgId}|${safeSender}|${safeBody}]\n`;
}

export type ParsedQuote = {
  msgId: string;
  senderName: string;
  quoteBody: string;
  remainingText: string;
};

export function parseQuote(body: string): ParsedQuote | null {
  if (!body.startsWith("[QUOTE|")) return null;
  let closingIdx = body.indexOf("]\n");
  let newlineLen = 2;
  if (closingIdx === -1) {
    closingIdx = body.indexOf("]\r\n");
    newlineLen = 3;
  }
  if (closingIdx === -1) {
    closingIdx = body.indexOf("]");
    newlineLen = 1;
  }
  if (closingIdx === -1) return null;
  const quotePart = body.slice(7, closingIdx);
  const remainingText = body.slice(closingIdx + newlineLen).replace(/^[\r\n]+/, "");
  const parts = quotePart.split("|");
  if (parts.length < 3) return null;
  const msgId = parts[0];
  const senderName = parts[1];
  const quoteBody = parts.slice(2).join("|");
  return { msgId, senderName, quoteBody, remainingText };
}

export function stripQuote(body: string | null | undefined): string {
  if (!body) return "";
  return body.replace(/\[QUOTE\|.*?\][\r\n]*/g, "");
}

export function renderMessageBody(body: string, isCurrentUser?: boolean) {
  const parsed = parseQuote(body);
  const displayBody = parsed ? parsed.remainingText : body;
  return (
    <div className="space-y-1">
      {parsed && (
        <div
          onClick={() => {
            const el = document.getElementById(`message-${parsed.msgId}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              const oldBg = el.style.backgroundColor;
              const oldTransition = el.style.transition;
              el.style.transition = "background-color 0.2s ease-in-out";
              el.style.backgroundColor = "#fbbf24";
              setTimeout(() => {
                el.style.backgroundColor = oldBg;
                setTimeout(() => {
                  el.style.transition = oldTransition;
                }, 300);
              }, 1000);
            }
          }}
          className={`border-l-4 ${isCurrentUser ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground" : "border-primary/50 bg-primary/5 text-foreground"} rounded-r-md px-3 py-1 text-xs cursor-pointer opacity-90 select-none max-w-full`}
        >
          <div className="font-semibold text-[10px] uppercase tracking-wider">{parsed.senderName}</div>
          <div className="truncate text-[11px] opacity-80">{parsed.quoteBody}</div>
        </div>
      )}
      <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-1 [&_h1]:text-base [&_h2]:text-sm [&_h1]:mt-1 [&_h2]:mt-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-1">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p>{processChildren(children, isCurrentUser)}</p>,
            li: ({ children }) => <li>{processChildren(children, isCurrentUser)}</li>,
          }}
        >
          {displayBody}
        </ReactMarkdown>
      </div>
    </div>
  );
}