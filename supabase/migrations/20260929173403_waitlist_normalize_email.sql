-- Waitlist (barwars.app): one signup per person regardless of capitals or stray spaces
create or replace function public.tg_waitlist_normalize()
returns trigger language plpgsql as $$
begin
  new.email := lower(btrim(new.email));
  if new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'BAD_EMAIL'; end if;
  new.source := left(coalesce(nullif(btrim(new.source), ''), 'landing_page'), 100);
  new.campus := left(nullif(btrim(new.campus), ''), 100);
  return new;
end $$;
drop trigger if exists waitlist_normalize on public.waitlist;
create trigger waitlist_normalize before insert or update on public.waitlist for each row execute function public.tg_waitlist_normalize();
update public.waitlist set email = email;
