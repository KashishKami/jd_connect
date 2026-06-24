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

export async function uploadFiles(files: File[], scope: AttachmentScope): Promise<ChatAttachment[]> {
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
  return uploaded;
}

export function AttachmentPicker({ value, onChange, scope }: { value: ChatAttachment[]; onChange: (v: ChatAttachment[]) => void; scope: AttachmentScope }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (!scope?.id) { toast.error("Missing chat context"); return; }
    setUploading(true);
    try {
      const uploaded = await uploadFiles(files, scope);
      onChange([...value, ...uploaded]);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload files");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" multiple className="hidden" onChange={onPick} />
      <Button type="button" variant="ghost" size="icon" disabled={uploading} onClick={() => fileRef.current?.click()} title="Attach files" className="shrink-0">
        <Paperclip className="h-4 w-4" />
      </Button>
    </>
  );
}

export function PendingAttachmentList({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (att: ChatAttachment) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-3 pb-2">
      {attachments.map((a) => {
        const isImage = a.type?.startsWith("image/");
        return (
          <div key={a.path} className="relative group rounded-md border bg-card p-1 shadow-sm shrink-0">
            {isImage ? (
              <PendingImageItem attachment={a} />
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 text-xs bg-muted/50 rounded pr-8">
                <FileIcon className="h-4 w-4 text-muted-foreground" />
                <div className="max-w-28 truncate text-foreground font-medium">{a.name}</div>
                <div className="text-[10px] text-muted-foreground">{(a.size / 1024).toFixed(0)}KB</div>
              </div>
            )}
            <button
              onClick={() => onRemove(a)}
              className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full p-0.5 shadow-sm border border-destructive/20 transition-transform duration-100 scale-95 hover:scale-105"
              title="Remove file"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PendingImageItem({ attachment }: { attachment: ChatAttachment }) {
  const url = useSignedUrl(attachment.path);
  if (!url) return <div className="h-24 w-24 bg-muted animate-pulse rounded" />;
  return (
    <div className="rounded overflow-hidden max-w-24 max-h-24">
      <img src={url} alt={attachment.name} className="h-24 w-24 object-cover" />
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