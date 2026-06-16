import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileIcon, Download } from "lucide-react";
import { toast } from "sonner";

export type ChatAttachment = {
  path: string;
  name: string;
  size: number;
  type: string;
};

const MAX_SIZE = 10 * 1024 * 1024;

export type AttachmentScope =
  | { kind: "channel"; id: string }
  | { kind: "conversation"; id: string };

export function AttachmentPicker({ value, onChange, scope }: { value: ChatAttachment[]; onChange: (v: ChatAttachment[]) => void; scope: AttachmentScope }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (!scope?.id) { toast.error("Missing chat context"); return; }
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      const prefix = scope.kind === "channel" ? `channel/${scope.id}` : `conv/${scope.id}`;
      const uploaded: ChatAttachment[] = [];
      for (const f of files) {
        if (f.size > MAX_SIZE) { toast.error(`${f.name} exceeds 10MB`); continue; }
        const path = `${prefix}/${uid}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from("chat-attachments").upload(path, f, { contentType: f.type });
        if (error) { toast.error(error.message); continue; }
        uploaded.push({ path, name: f.name, size: f.size, type: f.type });
      }
      onChange([...value, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (att: ChatAttachment) => {
    await supabase.storage.from("chat-attachments").remove([att.path]);
    onChange(value.filter((a) => a.path !== att.path));
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((a) => (
            <div key={a.path} className="flex items-center gap-1.5 rounded border bg-muted px-2 py-1 text-xs">
              <FileIcon className="h-3 w-3" />
              <span className="max-w-32 truncate">{a.name}</span>
              <button onClick={() => remove(a)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" multiple className="hidden" onChange={onPick} />
      <Button type="button" variant="ghost" size="icon" disabled={uploading} onClick={() => fileRef.current?.click()} title="Attach files">
        <Paperclip className="h-4 w-4" />
      </Button>
    </div>
  );
}

function useSignedUrl(path: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage.from("chat-attachments").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}

export function AttachmentList({ attachments }: { attachments: ChatAttachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) => <AttachmentItem key={a.path} attachment={a} />)}
    </div>
  );
}

function AttachmentItem({ attachment }: { attachment: ChatAttachment }) {
  const url = useSignedUrl(attachment.path);
  const isImage = attachment.type?.startsWith("image/");
  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block rounded border overflow-hidden max-w-xs">
        <img src={url} alt={attachment.name} className="max-h-48 object-cover" />
      </a>
    );
  }
  return (
    <a href={url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs hover:bg-muted">
      <FileIcon className="h-4 w-4" />
      <span className="truncate max-w-40">{attachment.name}</span>
      <span className="text-muted-foreground">{(attachment.size / 1024).toFixed(0)}KB</span>
      <Download className="h-3 w-3 text-muted-foreground" />
    </a>
  );
}