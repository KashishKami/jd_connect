import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider, embedTextViaGateway } from "@/lib/ai-gateway.server";

type ChatBody = {
  messages?: UIMessage[];
  conversationId?: string;
};

const SYSTEM_PROMPT = `You are JD AI, the internal assistant for JD Connect — a company workforce platform.

You answer questions using ONLY:
- Company documents (via the search_documents tool)
- Sales data (via get_sales_metrics)
- Attendance data (via get_attendance_metrics)
- Break data (via get_break_metrics)
- Workforce data (via get_workforce_metrics)

Rules:
1. Always call the relevant tool(s) before answering operational or document questions. Never guess.
2. When you cite a document, mention its title clearly.
3. Respect permissions — tools already scope results to the caller's role. If a tool returns no data, say so honestly.
4. Be concise. Use bullet points and tables for metrics.
5. If the question is outside JD Connect's scope, reply: "I can only help with company documents, sales, attendance, breaks, and workforce data. For other matters, please contact Adam."
6. If you don't have enough information, say: "I don't have that information in JD Connect. Please contact Adam."
7. Never invent numbers, names, or document titles.

Today's date: ${new Date().toISOString().slice(0, 10)}.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server not configured", { status: 500 });
        }
        if (!LOVABLE_API_KEY) {
          return new Response("LOVABLE_API_KEY missing", { status: 500 });
        }

        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userRes, error: uErr } = await supabase.auth.getUser();
        if (uErr || !userRes.user) return new Response("Unauthorized", { status: 401 });
        const userId = userRes.user.id;

        const body = (await request.json()) as ChatBody;
        const messages = body.messages;
        if (!Array.isArray(messages)) {
          return new Response("messages required", { status: 400 });
        }
        const conversationId = body.conversationId;

        const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
        const model = gateway("google/gemini-3-flash-preview");

        const tools = {
          search_documents: tool({
            description:
              "Semantic search across company documents the caller can access. Use for SOPs, policies, scripts, training, FAQs.",
            inputSchema: z.object({
              query: z.string().min(2).describe("The user's question to search for"),
              limit: z.number().int().min(1).max(10).optional(),
            }),
            execute: async ({ query, limit = 5 }) => {
              try {
                const vec = await embedTextViaGateway(LOVABLE_API_KEY, query);
                const { data, error } = await supabase.rpc("match_knowledge", {
                  query_embedding: vec as unknown as string,
                  match_count: limit,
                  min_similarity: 0.3,
                });
                if (error) return { error: error.message, results: [] };
                return {
                  results: (data ?? []).map((r) => ({
                    document_id: r.document_id,
                    title: r.document_title,
                    version: r.document_version,
                    similarity: Number(r.similarity?.toFixed(3)),
                    excerpt: r.content,
                  })),
                };
              } catch (e) {
                return { error: e instanceof Error ? e.message : String(e), results: [] };
              }
            },
          }),
          get_sales_metrics: tool({
            description:
              "Aggregated sales: gross/net revenue, count, refunds, chargebacks, top agents. Scoped to caller role automatically.",
            inputSchema: z.object({
              from: z.string().describe("ISO date YYYY-MM-DD inclusive"),
              to: z.string().describe("ISO date YYYY-MM-DD inclusive"),
            }),
            execute: async ({ from, to }) => {
              const { data, error } = await supabase.rpc("ai_sales_summary", { _from: from, _to: to });
              if (error) return { error: error.message };
              return data?.[0] ?? { scope: "none" };
            },
          }),
          get_attendance_metrics: tool({
            description: "Attendance metrics for a date range: present/absent/half-day/on-leave, attendance rate.",
            inputSchema: z.object({
              from: z.string(),
              to: z.string(),
            }),
            execute: async ({ from, to }) => {
              const { data, error } = await supabase.rpc("ai_attendance_summary", { _from: from, _to: to });
              if (error) return { error: error.message };
              return data?.[0] ?? { scope: "none" };
            },
          }),
          get_break_metrics: tool({
            description: "Break metrics: who is currently on break, exceeded breaks, totals for a date range.",
            inputSchema: z.object({
              from: z.string(),
              to: z.string(),
            }),
            execute: async ({ from, to }) => {
              const { data, error } = await supabase.rpc("ai_break_summary", { _from: from, _to: to });
              if (error) return { error: error.message };
              return data?.[0] ?? { scope: "none" };
            },
          }),
          get_workforce_metrics: tool({
            description: "Workforce composition: active employees, breakdown by department, centre, and role.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await supabase.rpc("ai_workforce_summary");
              if (error) return { error: error.message };
              return data?.[0] ?? { scope: "none" };
            },
          }),
        };

        const modelMessages = await convertToModelMessages(messages);
        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(8),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ messages: finalMessages }) => {
            if (!conversationId) return;
            try {
              const last = finalMessages[finalMessages.length - 1];
              const prevUser = [...finalMessages].reverse().find((m) => m.role === "user");

              const userText = textFromParts(prevUser?.parts);
              const assistantText = textFromParts(last?.parts);
              const toolCalls = last?.parts?.filter((p) => p.type?.startsWith?.("tool-")) ?? [];
              const sources = extractSources(last?.parts);

              if (prevUser && userText) {
                await supabase.from("ai_messages").insert({
                  conversation_id: conversationId,
                  role: "user",
                  content: userText,
                });
              }
              if (last && last.role === "assistant" && assistantText) {
                await supabase
                  .from("ai_messages")
                  .insert({
                    conversation_id: conversationId,
                    role: "assistant",
                    content: assistantText,
                    sources: sources.length ? (JSON.parse(JSON.stringify(sources))) : null,
                    tool_calls: toolCalls.length ? (JSON.parse(JSON.stringify(toolCalls))) : null,
                  });

                await supabase.from("ai_conversations")
                  .update({ updated_at: new Date().toISOString() })
                  .eq("id", conversationId);

                await supabase.from("ai_analytics").insert({
                  user_id: userId,
                  conversation_id: conversationId,
                  question: userText,
                  answered: Boolean(assistantText),
                  document_ids: sources.map((s) => s.document_id),
                  intent: toolCalls.map((t) => t.type).join(",") || null,
                });
              }
            } catch (e) {
              console.error("[jdai] persist failed", e);
            }
          },
        });
      },
    },
  },
});

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p): p is { type: string; text: string } => !!p && typeof p === "object" && (p as { type?: string }).type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

type ToolPart = { type: string; output?: { results?: Array<{ document_id: string; title: string }> } };
function extractSources(parts: unknown): Array<{ document_id: string; title: string }> {
  if (!Array.isArray(parts)) return [];
  const sources: Array<{ document_id: string; title: string }> = [];
  for (const p of parts as ToolPart[]) {
    if (p?.type === "tool-search_documents" && p.output?.results) {
      for (const r of p.output.results) {
        if (!sources.some((s) => s.document_id === r.document_id)) {
          sources.push({ document_id: r.document_id, title: r.title });
        }
      }
    }
  }
  return sources;
}