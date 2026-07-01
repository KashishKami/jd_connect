import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileIcon, Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

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

export function PendingImageItem({ attachment }: { attachment: ChatAttachment }) {
  const url = useSignedUrl(attachment.path);
  if (!url) return <div className="h-24 w-24 bg-muted animate-pulse rounded" />;
  return (
    <div className="rounded overflow-hidden max-w-24 max-h-24">
      <img src={url} alt={attachment.name} className="h-24 w-24 object-cover" />
    </div>
  );
}

export function useSignedUrl(path: string) {
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

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "download.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    toast.success("Image download started");
  } catch (err) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.download = filename || "download.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Opening image in new window to download");
  }
}

function AttachmentItem({ attachment }: { attachment: ChatAttachment }) {
  const url = useSignedUrl(attachment.path);
  const isImage = attachment.type?.startsWith("image/");
  
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [open]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const zoomFactor = 0.15;
    setScale((prev) => {
      let newScale = prev + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
      return Math.max(0.5, Math.min(newScale, 5));
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (isImage && url) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <div className="inline-block">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button className="block rounded border overflow-hidden max-w-xs focus:outline-none focus:ring-2 focus:ring-primary text-left">
                  <img src={url} alt={attachment.name} className="max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-40">
                <ContextMenuItem 
                  className="gap-2 cursor-pointer" 
                  onSelect={() => void downloadImage(url, attachment.name)}
                >
                  <Download className="h-4 w-4" />
                  Download Image
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </DialogTrigger>
        <DialogContent className="max-w-[95vw] md:max-w-5xl lg:max-w-7xl h-[85vh] max-h-[85vh] p-0 overflow-hidden bg-black/95 text-white border-none flex flex-col items-center justify-center">
          {/* Custom prominent close button to guarantee contrast and z-index visibility */}
          <DialogClose asChild>
            <button className="absolute right-4 top-4 z-50 rounded-full p-2 bg-black/50 hover:bg-black/80 text-white/80 hover:text-white transition-colors border border-white/20 cursor-pointer">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </DialogClose>

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div 
                className={`relative w-full h-full flex items-center justify-center p-4 overflow-hidden select-none ${scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img 
                  src={url} 
                  alt={attachment.name} 
                  className="max-w-full max-h-full object-contain rounded transition-transform duration-75 select-none pointer-events-none"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  }}
                />
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem 
                className="gap-2 cursor-pointer" 
                onSelect={() => void downloadImage(url, attachment.name)}
              >
                <Download className="h-4 w-4" />
                Download Image
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          {/* Floating Controls Bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white rounded-full px-4 py-1.5 text-xs flex items-center gap-3 backdrop-blur shadow-lg z-50">
            <span className="font-medium opacity-80">Scroll to Zoom · Drag to Pan</span>
            <div className="w-[1px] h-3 bg-white/20" />
            <span className="font-semibold tabular-nums">{Math.round(scale * 100)}%</span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setScale(1);
                setPosition({ x: 0, y: 0 });
              }}
              className="hover:text-primary transition-colors font-bold underline cursor-pointer"
            >
              Reset
            </button>
            <div className="w-[1px] h-3 bg-white/20" />
            <button 
              onClick={(e) => {
                e.stopPropagation();
                void downloadImage(url, attachment.name);
              }}
              className="hover:text-primary transition-colors font-bold flex items-center gap-1 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          </div>
        </DialogContent>
      </Dialog>
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