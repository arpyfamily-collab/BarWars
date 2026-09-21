/*
# Fix new-account profile creation

1. Purpose
- Make the automatic profile record created during Supabase sign-up resolve the `profiles` table reliably.
- Prevent the auth trigger from depending on the caller's search path.

2. Modified database objects
- `public.handle_new_user()` now uses an explicit `public` search path and an explicit `public.profiles` table reference.
- The existing `auth.users` trigger remains in place and continues creating one profile per new account.

3. Security
- The function remains `SECURITY DEFINER` so Supabase Auth can create the profile even though normal client writes to profiles are restricted.
- The function's search path is fixed to `public` to avoid resolving attacker-controlled or unexpected objects.

4. Important notes
- No user data is deleted or changed.
- Existing profile rows and authentication accounts are preserved.
*/

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;
