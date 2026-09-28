-- War Comms Phase 1 (To-Do item 18): new channel types
alter type public.channel_type add value if not exists 'regiment';
alter type public.channel_type add value if not exists 'war_side';
