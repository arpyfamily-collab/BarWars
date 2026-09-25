/*
# Create armory table — War Bond Armory

1. New Tables
- `armory`
  - `id` (uuid, primary key)
  - `donor_user_id` (uuid, foreign key to auth.users — the student who donated the bracelet)
  - `current_venue_id` (uuid, foreign key to venues — the bar where the bracelet is available)
  - `bracelet_drop_id` (uuid, nullable, foreign key to bracelet_drops — linked drop for offer details)
  - `offer_type` (text — e.g. 'no_cover', 'drink_credit', 'vip_entry')
  - `offer_value` (text — human-readable description of the offer, e.g. 'No cover' or '$10 drink credit')
  - `status` (text — 'available' or 'claimed', defaults to 'available')
  - `claimed_by` (uuid, nullable — the user who claimed the bracelet)
  - `claimed_at` (timestamptz, nullable — when the bracelet was claimed)
  - `created_at` (timestamptz, defaults to now() — when the bracelet was donated)

2. Security
- Enable RLS on `armory`.
- SELECT: any authenticated user can see armory entries (the armory is a shared marketplace).
- INSERT: authenticated users can donate bracelets.
- UPDATE: authenticated users can claim bracelets (set status, claimed_by, claimed_at).
- DELETE: not needed for now.

3. Important Notes
- Donor identity is never shown to claimers — the UI displays "a fellow soldier" instead.
- One claim per user per week is enforced in the API route, not at the database level.
- The `bracelet_drops` table reference is optional — armory rows can exist with just offer_type/offer_value.
*/

CREATE TABLE IF NOT EXISTS armory (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_venue_id   uuid REFERENCES venues(id) ON DELETE SET NULL,
  bracelet_drop_id   uuid,
  offer_type         text NOT NULL DEFAULT 'no_cover',
  offer_value        text NOT NULL,
  status             text NOT NULL DEFAULT 'available',
  claimed_by         uuid,
  claimed_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE armory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_armory" ON armory;
CREATE POLICY "select_armory"
  ON armory FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_armory" ON armory;
CREATE POLICY "insert_armory"
  ON armory FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_armory" ON armory;
CREATE POLICY "update_armory"
  ON armory FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_armory_status ON armory(status);
CREATE INDEX IF NOT EXISTS idx_armory_claimed_by ON armory(claimed_by);
CREATE INDEX IF NOT EXISTS idx_armory_current_venue_id ON armory(current_venue_id);
