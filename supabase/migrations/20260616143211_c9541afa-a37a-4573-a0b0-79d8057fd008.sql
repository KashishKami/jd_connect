REVOKE ALL ON FUNCTION public.search_mention_candidates(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_mention_candidates(text, int) TO authenticated;