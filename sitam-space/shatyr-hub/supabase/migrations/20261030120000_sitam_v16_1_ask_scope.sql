/* SITAM SPACE v16.1 — Ask SITAM: search only the kind of page the person asks about
   ("which lab…" → labs only, "who can supervise…" → researchers, …). match_documents gets filter_types.
   Re-runnable. */

drop function if exists public.match_documents(extensions.vector, int, float);
create or replace function public.match_documents(query_embedding extensions.vector(384), match_count int default 8,
                                                  min_similarity float default 0.2, filter_types text[] default null)
returns table (id bigint, source_type text, source_id text, title text, url text, content text, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select d.id, d.source_type, d.source_id, d.title, d.url, d.content, 1 - (d.embedding <=> query_embedding) as similarity
    from public.ai_documents d
   where d.embedding is not null
     and (filter_types is null or cardinality(filter_types) = 0 or d.source_type = any(filter_types))
     and 1 - (d.embedding <=> query_embedding) >= min_similarity
   order by d.embedding <=> query_embedding
   limit greatest(1, least(match_count, 20))
$$;
revoke execute on function public.match_documents(extensions.vector, int, float, text[]) from anon, public;
grant execute on function public.match_documents(extensions.vector, int, float, text[]) to authenticated, service_role;
