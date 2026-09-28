-- Ole Miss students use @go.olemiss.edu; count subdomains of an allowed domain
create or replace function public.edu_email_ok(p_user uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users u, public.app_settings s, lateral jsonb_array_elements_text(s.value->'domains') d(dom)
                  where u.id = p_user and s.key = 'edu_gate' and u.email_confirmed_at is not null
                    and (lower(split_part(u.email, '@', 2)) = lower(d.dom) or lower(split_part(u.email, '@', 2)) like '%.' || lower(d.dom)));
$$;
update public.profiles p set edu_verified = public.edu_email_ok(p.id);
