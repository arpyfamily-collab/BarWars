-- Item 12a: intel cells get a private War Comms chat
alter type public.channel_type add value if not exists 'intel_cell';
