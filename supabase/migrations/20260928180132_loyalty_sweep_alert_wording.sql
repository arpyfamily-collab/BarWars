-- "Loyalty sweep sent to 1 members" -> "1 member"
create or replace function public.tg_loyalty_sweep_wording()
returns trigger language plpgsql as $$
begin
  if new.kind = 'loyalty_sweep' then new.headline := regexp_replace(new.headline, '^Loyalty sweep sent to 1 members$', 'Loyalty sweep sent to 1 member'); end if;
  return new;
end $$;
drop trigger if exists loyalty_sweep_wording on public.leadership_alerts;
create trigger loyalty_sweep_wording before insert on public.leadership_alerts for each row execute function public.tg_loyalty_sweep_wording();
