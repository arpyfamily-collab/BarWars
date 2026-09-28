-- Item 12b: unsold Ghost reports post an anonymized summary to the public war feed
alter type public.turf_event_type add value if not exists 'ghost_report';
