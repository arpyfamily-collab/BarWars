/*
# Create predictions + prediction_lines tables — War Room Intel

1. New Tables

- `predictions`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to auth.uid() — the student making the prediction)
  - `prediction_type` (text — 'daily_dropper' | 'weekly_over_under' | 'season_most_drops')
  - `target_venue_id` (uuid, nullable — which bar the user predicted, for daily_dropper and season_most_drops)
  - `guess_value` (text, nullable — 'over' | 'under' for weekly_over_under)
  - `prediction_date` (date — the date the prediction applies to; for daily it's today, for weekly it's the Monday of that week)
  - `result` (text, nullable — 'win' | 'loss' | null when pending)
  - `payout_bonds` (integer, default 0 — Valor Bonds earned if the prediction was correct)
  - `resolved_at` (timestamptz, nullable — when the result was determined)
  - `created_at` (timestamptz, defaults to now())

  Unique constraint on (user_id, prediction_type, prediction_date) to prevent duplicate submissions.

- `prediction_lines`
  - `id` (uuid, primary key)
  - `prediction_type` (text — 'weekly_over_under' | 'daily_dropper')
  - `prediction_date` (date — the date/week the line applies to)
  - `line_value` (integer — the over/under threshold, e.g. 5 means "over/under 5 drops this week")
  - `created_at` (timestamptz, defaults to now())

  Unique constraint on (prediction_type, prediction_date) so only one line per type per date.

2. Security
- Enable RLS on both tables.
- predictions: owner-scoped INSERT + SELECT (authenticated users can only see/submit their own).
  UPDATE allowed for owner (in case future resolution needs it from the client side).
- prediction_lines: public SELECT for all authenticated users (everyone sees the same lines).
  INSERT/UPDATE restricted to service role only (operators set the lines server-side).

3. Important Notes
- The one-prediction-per-type-per-day rule is enforced by a unique constraint, and the API also checks before inserting.
- prediction_lines stores the over/under threshold that the operator sets each week.
- Valor Bonds (payout_bonds) are 0 until a prediction is resolved.
*/

CREATE TABLE IF NOT EXISTS predictions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  prediction_type   text NOT NULL,
  target_venue_id   uuid REFERENCES venues(id) ON DELETE SET NULL,
  guess_value       text,
  prediction_date   date NOT NULL,
  result            text,
  payout_bonds      integer NOT NULL DEFAULT 0,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_predictions" ON predictions;
CREATE POLICY "select_own_predictions"
  ON predictions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_predictions" ON predictions;
CREATE POLICY "insert_own_predictions"
  ON predictions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_predictions" ON predictions;
CREATE POLICY "update_own_predictions"
  ON predictions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_predictions_unique
  ON predictions(user_id, prediction_type, prediction_date);

CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_type_date ON predictions(prediction_type, prediction_date);

CREATE TABLE IF NOT EXISTS prediction_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_type   text NOT NULL,
  prediction_date   date NOT NULL,
  line_value        integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prediction_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_prediction_lines" ON prediction_lines;
CREATE POLICY "select_prediction_lines"
  ON prediction_lines FOR SELECT
  TO authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_lines_unique
  ON prediction_lines(prediction_type, prediction_date);
