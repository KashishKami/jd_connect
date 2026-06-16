import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function usePermissions() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["my-permissions", user?.id],
    enabled: !!user?.id,
    staleTime: 60 * 1000, // 60 s — short enough to reflect role changes promptly
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_permissions");
      if (error) throw error;
      return new Set<string>((data as string[]) ?? []);
    },
  });
  const set = q.data ?? new Set<string>();
  return {
    isLoading: q.isLoading,
    permissions: set,
    can: (key: string) => set.has(key),
    canAny: (...keys: string[]) => keys.some((k) => set.has(k)),
    canAll: (...keys: string[]) => keys.every((k) => set.has(k)),
  };
}