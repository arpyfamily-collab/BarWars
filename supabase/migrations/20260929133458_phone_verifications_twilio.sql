-- Item 16: Twilio Verify sends and checks the code, so we no longer store it
alter table public.phone_verifications alter column otp_code drop not null;
