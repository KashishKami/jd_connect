/**
 * Server-only document text extraction. Returns plain text or null when the
 * file type is not supported / extraction failed.
 */

export async function extractTextFromBuffer(
  buf: ArrayBuffer,
  fileName: string,
  mime?: string | null,
): Promise<string | null> {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const m = (mime || "").toLowerCase();

  try {
    if (ext === "pdf" || m === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      return (result?.text ?? "").trim() || null;
    }
    if (ext === "docx" || m.includes("wordprocessingml")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
      return (result?.value ?? "").trim() || null;
    }
    if (ext === "txt" || ext === "md" || m.startsWith("text/")) {
      return new TextDecoder().decode(buf).trim() || null;
    }
  } catch (err) {
    console.error("[jdai-extract] failed", fileName, err);
    return null;
  }
  return null;
}

/**
 * Naive chunker: ~maxChars per chunk with overlap, prefers paragraph/sentence
 * boundaries.
 */
export function chunkText(text: string, maxChars = 1200, overlap = 200): string[] {
  const clean = text.replace(/\u0000/g, "").replace(/\r\n/g, "\n");
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + maxChars);
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const boundary = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
      );
      if (boundary > maxChars * 0.5) end = start + boundary + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks.filter((c) => c.length > 30);
}