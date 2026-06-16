import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<Candidate[]>([]);
  const [active, setActive] = useState(0);

  useImperativeHandle(fwdRef, () => ({ focus: () => inputRef.current?.focus() }));

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
      <Input
        ref={inputRef}
        value={value}
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
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    </div>
  );
});

export function renderMessageBody(body: string) {
  const parts = body.split(/(@[A-Za-z0-9_]{2,32})/g);
  return parts.map((p, i) =>
    /^@[A-Za-z0-9_]{2,32}$/.test(p) ? (
      <span key={i} className="text-primary font-medium bg-primary/10 rounded px-1">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}