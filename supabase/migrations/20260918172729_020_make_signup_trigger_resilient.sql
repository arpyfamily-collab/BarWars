/*
# Make signup profile creation resilient

1. Purpose
- Ensure a new Supabase account is not rejected because optional profile metadata is missing or because profile creation encounters a recoverable conflict.

2. Modified database objects
- `public.handle_new_user()` now inserts a profile with an explicit `ON CONFLICT (id) DO NOTHING` safeguard.
- The trigger continues to use the authenticated user's ID and optional full name.

3. Security
- The function remains `SECURITY DEFINER` and keeps `search_path = public`.
- No client role gains permission to create or modify another user's profile.

4. Important notes
- No existing accounts or profile rows are deleted.
- A profile is still created for every normal new account; the conflict safeguard only prevents a duplicate profile from aborting signup.
*/

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
