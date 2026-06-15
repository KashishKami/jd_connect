import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Create a new AI conversation for the current user. */
export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    const { data: row, error } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: userId,
        employee_id: emp?.id ?? null,
        title: data.title ?? "New conversation",
      })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_messages")
      .select("id, role, content, sources, tool_calls, created_at")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_conversations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string; helpful: boolean; comment?: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_feedback").upsert(
      {
        message_id: data.messageId,
        user_id: context.userId,
        helpful: data.helpful,
        comment: data.comment ?? null,
      },
      { onConflict: "message_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Index a document version: extract text, chunk, embed, store. */
export const indexDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string; versionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: ver, error: vErr } = await supabase
      .from("document_versions")
      .select("id, document_id, file_path, file_name, mime_type")
      .eq("id", data.versionId)
      .single();
    if (vErr || !ver) throw new Error("Version not found");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from("documents")
      .download(ver.file_path);
    if (dlErr || !file) throw new Error("Failed to download file");
    const buf = await file.arrayBuffer();

    const { extractTextFromBuffer, chunkText } = await import("@/lib/jdai-extract.server");
    const text = await extractTextFromBuffer(buf, ver.file_name, ver.mime_type);
    if (!text) {
      return { indexed: 0, skipped: true, reason: "unsupported_or_empty" };
    }

    const chunks = chunkText(text);
    const { embedTextViaGateway } = await import("@/lib/ai-gateway.server");

    // Wipe previous embeddings for this version
    await supabaseAdmin
      .from("knowledge_embeddings")
      .delete()
      .eq("version_id", ver.id);

    let inserted = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      try {
        const vec = await embedTextViaGateway(key, c);
        const { error } = await supabaseAdmin.from("knowledge_embeddings").insert({
          document_id: ver.document_id,
          version_id: ver.id,
          chunk_index: i,
          content: c,
          token_count: Math.ceil(c.length / 4),
          embedding: vec as unknown as string,
        });
        if (!error) inserted++;
      } catch (e) {
        console.error("[indexDocumentVersion] chunk failed", i, e);
      }
    }

    return { indexed: inserted, total_chunks: chunks.length, skipped: false };
  });

export const reindexDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase
      .from("documents")
      .select("id, current_version_id")
      .eq("id", data.documentId)
      .single();
    if (!doc?.current_version_id) throw new Error("No current version");
    return indexDocumentVersion({ data: { documentId: doc.id, versionId: doc.current_version_id } });
  });