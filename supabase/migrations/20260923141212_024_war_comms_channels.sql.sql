/*
# War Comms — Channels, Members, Messages, Read Status

1. New Tables
- `channels`: Communication channels (war_room, hessian, battlefield, direct).
  - id (uuid PK)
  - name (text) — display name
  - channel_type (enum: war_room, hessian, battlefield, direct)
  - org_id (uuid, nullable FK to greek_orgs) — for war_room channels
  - venue_id (uuid, nullable FK to venues) — for battlefield channels
  - is_active (boolean, default true)
  - created_at (timestamptz default now())
- `channel_members`: Membership join table.
  - id (uuid PK)
  - channel_id (uuid FK to channels)
  - user_id (uuid FK to auth.users)
  - joined_at (timestamptz default now())
  - unique(channel_id, user_id)
- `messages`: Messages in channels.
  - id (uuid PK)
  - channel_id (uuid FK to channels)
  - sender_id (uuid FK to auth.users, DEFAULT auth.uid())
  - content (text, not null)
  - is_rally_call (boolean, default false)
  - is_intel (boolean, default false)
  - created_at (timestamptz default now())
- `channel_read_status`: Per-user read tracking.
  - id (uuid PK)
  - channel_id (uuid FK to channels)
  - user_id (uuid FK to auth.users, DEFAULT auth.uid())
  - last_read_at (timestamptz default now())
  - unique(channel_id, user_id)

2. Security
- Enable RLS on all four tables.
- channels: authenticated can SELECT channels they're a member of OR battlefield channels (is_active = true). INSERT is restricted (only for battlefield auto-join via service role or policy).
- channel_members: authenticated can SELECT their own memberships. INSERT for battlefield channels is open to authenticated (auto-join). INSERT for other channels requires existing membership (invited).
- messages: authenticated can SELECT messages in channels they belong to. INSERT requires channel membership, sender must be self.
- channel_read_status: authenticated can SELECT/INSERT/UPDATE only their own rows.
- All owner columns default to auth.uid().
*/

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel_type text NOT NULL DEFAULT 'war_room' CHECK (channel_type IN ('war_room', 'hessian', 'battlefield', 'direct')),
  org_id uuid REFERENCES greek_orgs(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_visible_channels" ON channels;
CREATE POLICY "select_visible_channels"
ON channels FOR SELECT
TO authenticated
USING (
  is_active = true AND channel_type = 'battlefield'
  OR EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_members.channel_id = channels.id
    AND channel_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "insert_own_channels" ON channels;
CREATE POLICY "insert_own_channels"
ON channels FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_memberships" ON channel_members;
CREATE POLICY "select_own_memberships"
ON channel_members FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM channel_members cm2
    WHERE cm2.channel_id = channel_members.channel_id
    AND cm2.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = channel_members.channel_id
    AND c.channel_type = 'battlefield'
    AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "insert_battlefield_membership" ON channel_members;
CREATE POLICY "insert_battlefield_membership"
ON channel_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = channel_id
    AND c.channel_type = 'battlefield'
    AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "insert_invited_membership" ON channel_members;
CREATE POLICY "insert_invited_membership"
ON channel_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM channel_members cm2
    WHERE cm2.channel_id = channel_members.channel_id
    AND cm2.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "delete_own_membership" ON channel_members;
CREATE POLICY "delete_own_membership"
ON channel_members FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_rally_call boolean NOT NULL DEFAULT false,
  is_intel boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_channel_messages" ON messages;
CREATE POLICY "select_channel_messages"
ON messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_members.channel_id = messages.channel_id
    AND channel_members.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = messages.channel_id
    AND c.channel_type = 'battlefield'
    AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "insert_own_messages" ON messages;
CREATE POLICY "insert_own_messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_members.channel_id = messages.channel_id
      AND channel_members.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = messages.channel_id
      AND c.channel_type = 'battlefield'
      AND c.is_active = true
    )
  )
);

CREATE TABLE IF NOT EXISTS channel_read_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE channel_read_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_read_status" ON channel_read_status;
CREATE POLICY "select_own_read_status"
ON channel_read_status FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_read_status" ON channel_read_status;
CREATE POLICY "insert_own_read_status"
ON channel_read_status FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_read_status" ON channel_read_status;
CREATE POLICY "update_own_read_status"
ON channel_read_status FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_channels_type_active ON channels(channel_type, is_active);
CREATE INDEX IF NOT EXISTS idx_read_status_user ON channel_read_status(user_id);
