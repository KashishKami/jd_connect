import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileIcon, Download, ChevronLeft, ChevronRight } from "lucide-react";
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

export function AttachmentList({ attachments, allChatImages }: { attachments: ChatAttachment[]; allChatImages?: ChatAttachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <AttachmentItem key={a.path} attachment={a} allChatImages={allChatImages} />
      ))}
    </div>
  );
}

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    toast.success("Download started");
  } catch (err) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Opening in new window to download");
  }
}

function AttachmentItem({ attachment, allChatImages }: { attachment: ChatAttachment; allChatImages?: ChatAttachment[] }) {
  const isImage = attachment.type?.startsWith("image/");
  const initialIndex = allChatImages ? allChatImages.findIndex((img) => img.path === attachment.path) : -1;
  const [currentIndex, setCurrentIndex] = useState(initialIndex !== -1 ? initialIndex : 0);
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && initialIndex !== -1) {
      setCurrentIndex(initialIndex);
    }
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open || !allChatImages || allChatImages.length === 0) return;
    let active = true;
    const paths = allChatImages.map((img) => img.path);
    supabase.storage.from("chat-attachments").createSignedUrls(paths, 3600).then(({ data, error }) => {
      if (error || !data) return;
      if (!active) return;
      const map: Record<string, string> = {};
      data.forEach((item) => {
        if (item.path && item.signedUrl) {
          map[item.path] = item.signedUrl;
        }
      });
      setSignedUrls(map);
    });
    return () => { active = false; };
  }, [open, allChatImages]);

  const currentImage = allChatImages && allChatImages[currentIndex] ? allChatImages[currentIndex] : attachment;
  const directUrl = useSignedUrl(currentImage.path);
  const url = signedUrls[currentImage.path] || directUrl;

  useEffect(() => {
    if (!open) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !allChatImages || allChatImages.length <= 1) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, allChatImages]);

  const handlePrev = () => {
    if (!allChatImages || allChatImages.length <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : allChatImages.length - 1));
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleNext = () => {
    if (!allChatImages || allChatImages.length <= 1) return;
    setCurrentIndex((prev) => (prev < allChatImages.length - 1 ? prev + 1 : 0));
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

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

  const clickedImageDirectUrl = useSignedUrl(attachment.path);

  if (isImage && clickedImageDirectUrl) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <div className="inline-block">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button className="block rounded border overflow-hidden max-w-xs focus:outline-none focus:ring-2 focus:ring-primary text-left">
                  <img src={clickedImageDirectUrl} alt={attachment.name} className="max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity" />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-40">
                <ContextMenuItem 
                  className="gap-2 cursor-pointer" 
                  onSelect={() => void downloadFile(clickedImageDirectUrl, attachment.name)}
                >
                  <Download className="h-4 w-4" />
                  Download Image
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </DialogTrigger>
        <DialogContent className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] max-w-[95vw] md:max-w-5xl lg:max-w-7xl h-[85vh] max-h-[85vh] p-0 overflow-hidden bg-black/95 text-white border-none flex flex-col items-center justify-center">

          {allChatImages && allChatImages.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePrev(); }}
              className="absolute left-4 z-50 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 transition-all cursor-pointer"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {allChatImages && allChatImages.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); handleNext(); }}
              className="absolute right-4 z-50 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 transition-all cursor-pointer"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div 
                className={`relative w-full h-full flex items-center justify-center p-4 overflow-hidden select-none ${scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                style={{
                  backgroundImage: "linear-gradient(45deg, #1f1f1f 25%, transparent 25%), linear-gradient(-45deg, #1f1f1f 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f1f1f 75%), linear-gradient(-45deg, transparent 75%, #1f1f1f 75%)",
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                  backgroundColor: "#111111"
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {url ? (
                  <img 
                    src={url} 
                    alt={currentImage.name} 
                    className="max-w-full max-h-full object-contain rounded transition-transform duration-75 select-none pointer-events-none"
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    }}
                  />
                ) : (
                  <div className="h-24 w-24 bg-muted animate-pulse rounded" />
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem 
                className="gap-2 cursor-pointer" 
                onSelect={() => url && void downloadFile(url, currentImage.name)}
              >
                <Download className="h-4 w-4" />
                Download Image
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white rounded-full px-4 py-1.5 text-xs flex items-center gap-3 backdrop-blur shadow-lg z-50">
            {allChatImages && allChatImages.length > 1 && (
              <>
                <span className="font-semibold">{currentIndex + 1} / {allChatImages.length}</span>
                <div className="w-[1px] h-3 bg-white/20" />
              </>
            )}
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
                if (url) void downloadFile(url, currentImage.name);
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
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs bg-card text-card-foreground select-none max-w-full min-w-0">
          <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1 min-w-0 font-medium">{attachment.name}</span>
          <span className="text-muted-foreground shrink-0 font-mono">{(attachment.size / 1024).toFixed(0)}KB</span>
          <button
            onClick={() => directUrl && void downloadFile(directUrl, attachment.name)}
            className="ml-1 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Download file"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem 
          className="gap-2 cursor-pointer" 
          onSelect={() => directUrl && void downloadFile(directUrl, attachment.name)}
        >
          <Download className="h-4 w-4" />
          Download File
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}