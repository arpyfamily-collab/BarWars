/*
# Add INSERT policy to user_skins and user_skin_loadout

The existing tables have SELECT and UPDATE policies but are missing INSERT policies,
which prevents the skins shop from creating new purchase/rental records and
initializing a user's loadout row.

1. Changes
- Add `insert_own_user_skins` INSERT policy on `user_skins` (auth.uid() = user_id)
- Add `insert_own_loadout` INSERT policy on `user_skin_loadout` (auth.uid() = user_id)

2. Security
- Both policies scope TO authenticated with WITH CHECK (auth.uid() = user_id).
- No existing policies are dropped or modified.
*/

DROP POLICY IF EXISTS "insert_own_user_skins" ON user_skins;
CREATE POLICY "insert_own_user_skins"
  ON user_skins FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_loadout" ON user_skin_loadout;
CREATE POLICY "insert_own_loadout"
  ON user_skin_loadout FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
