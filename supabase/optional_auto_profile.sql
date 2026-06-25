-- OPTIONAL: auto-create a user_profiles row when someone signs up.
-- Apply in the Supabase SQL editor when you want self-serve onboarding.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, role)
  values (new.id, 'estimator')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
