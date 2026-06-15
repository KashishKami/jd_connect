import { supabase } from "@/integrations/supabase/client";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const ALLOWED_EXT = ["pdf", "docx", "xlsx", "pptx", "png", "jpg", "jpeg", "zip"] as const;
export const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "application/zip",
  "application/x-zip-compressed",
];

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) return `File too large (max 50 MB)`;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.includes(ext as (typeof ALLOWED_EXT)[number])) {
    return `Unsupported file type. Allowed: ${ALLOWED_EXT.join(", ")}`;
  }
  return null;
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export async function signedDocUrl(path: string, download = false): Promise<string> {
  const opts: { download?: string | boolean } = download ? { download: true } : {};
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, 60 * 10, opts);
  if (error) throw error;
  return data.signedUrl;
}

export function previewable(mime: string | null | undefined, name: string): "pdf" | "image" | null {
  const m = (mime ?? "").toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("image/") || ["png", "jpg", "jpeg"].includes(ext)) return "image";
  return null;
}