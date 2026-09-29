-- Item 12 leftover: badges earned from spy reports
alter type public.spy_badge_type add value if not exists 'informant';
alter type public.spy_badge_type add value if not exists 'field_agent';
alter type public.spy_badge_type add value if not exists 'spymaster';
