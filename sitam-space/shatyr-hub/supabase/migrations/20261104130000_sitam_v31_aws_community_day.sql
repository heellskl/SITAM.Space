/* SITAM SPACE v31 — AWS Student Community Day Kaskelen (27 Nov 2026), sent by the user 2026-11-04.
   Hosted by the AWS Student Builders Group community. Poster in public/events/. Registration on Meetup.
   The description is base64 (dot for slash): the Supabase SQL editor misreads long English texts. Plain statements, safe to run more than once. */
insert into public.events (kind, title, description, starts_at, room, speaker, speaker_role, tags, poster_url, capacity)
select 'industrial'::public.event_kind, 'AWS Student Community Day Kaskelen',
  convert_from(decode(replace('UmVnaXN0cmF0aW9uIGlzIG9wZW4uIEFXUyBTdHVkZW50IEJ1aWxkZXIgR3JvdXAgYXQgU0RVIFVuaXZlcnNpdHkgYnJpbmdzIHN0dWRlbnRzIHRvZ2V0aGVy
IGZvciBhIGZ1bGwgZGF5IG9mIGNsb3VkIHRlY2hub2xvZ2llcywgdGFsa3MgZnJvbSBpbmR1c3RyeSBwcmFjdGl0aW9uZXJzIGFuZCBuZXR3b3JraW5nIHdp
dGggc3R1ZGVudHMgYW5kIHRlY2ggcHJvZmVzc2lvbmFscy4gQSBncmVhdCBvcHBvcnR1bml0eSB0byBsZWFybiBkaXJlY3RseSBmcm9tIHByb2Zlc3Npb25h
bHMsIGFzayBxdWVzdGlvbnMgYW5kIGdldCBpbnNpZ2h0cyBpbnRvIGJ1aWxkaW5nIGEgY2FyZWVyIGluIHRlY2guIDI3IE5vdmVtYmVyIDIwMjYsIDEwOjAw
4oCTMTc6MDAsIEJsdWUgSGFsbCwgU0RVIExpZmUsIEthc2tlbGVuLiBGcmVlLCBieSByZWdpc3RyYXRpb24uIFNlYXRzIGFyZSBsaW1pdGVkLiBSZWdpc3Rl
ciBvbiBNZWV0dXA6IGh0dHBzOi8vd3d3Lm1lZXR1cC5jb20vYXdzLXNiZy1hdC1zdWxleW1hbi1kZW1pcmVsLXVuaXZlcnNpdHkvZXZlbnRzLzMxNzEwMzc5
NS8gLiBDb21lIHdpdGggeW91ciBmcmllbmRzIGFuZCBncm91cG1hdGVzLg==', '.', chr(47)), 'base64'), 'UTF8'),
  '2026-11-27 10:00:00+05'::timestamptz, 'Blue Hall, SDU Life', null, null, array['AWS', 'Cloud', 'Networking', 'Career']::text[], '/events/aws-student-community-day.jpg', 300
 where not exists (select 1 from public.events where lower(title) = lower('AWS Student Community Day Kaskelen') and starts_at::date = ('2026-11-27 10:00:00+05'::timestamptz)::date);
insert into public.event_hosts (event_id, lab_id)
select e.id, l.id from public.events e, public.labs l
 where e.title = 'AWS Student Community Day Kaskelen' and l.slug = 'aws-student-builders-group'
   and not exists (select 1 from public.event_hosts h where h.event_id = e.id and h.lab_id = l.id);
