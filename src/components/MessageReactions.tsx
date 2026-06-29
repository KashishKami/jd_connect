import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";


type Reaction = { id: string; emoji: string; employee_id: string };

export function MessageReactions({ messageId }: { messageId: string }) {
  const { employee } = useAuth();
  const qc = useQueryClient();

  const { data: reactions = [] } = useQuery<Reaction[]>({
    queryKey: ["reactions", messageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("id, emoji, employee_id")
        .eq("message_id", messageId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = reactions.reduce<Record<string, Reaction[]>>((acc, r) => {
    (acc[r.emoji] ||= []).push(r);
    return acc;
  }, {});

  const toggle = async (emoji: string) => {
    if (!employee?.id) return;
    const existing = reactions.find((r) => r.emoji === emoji && r.employee_id === employee.id);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: messageId, employee_id: employee.id, emoji });
    }
    qc.invalidateQueries({ queryKey: ["reactions", messageId] });
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, rs]) => {
        const mine = rs.some((r) => r.employee_id === employee?.id);
        return (
          <button
            key={emoji}
            onClick={() => toggle(emoji)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs hover:bg-muted transition-colors",
              mine && "border-primary bg-primary/10",
            )}
          >
            <span>{emoji}</span>
            <span className="tabular-nums text-[10px] text-muted-foreground">{rs.length}</span>
          </button>
        );
      })}
    </div>
  );
}