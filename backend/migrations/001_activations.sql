-- Silver Glider Activations — full schema (booth voting platform).
-- Idempotent: CREATE TABLE IF NOT EXISTS. Runs on every startup (see backend/index.js).
-- Consolidates the tables plus every column the app writes to (in the original repo
-- some of these were added at runtime with ALTER TABLE; here they are declared upfront).

CREATE TABLE IF NOT EXISTS sg_activations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  voting_closed BOOLEAN DEFAULT false,
  voting_ends_at TIMESTAMPTZ,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sg_participants (
  id SERIAL PRIMARY KEY,
  activation_id INT REFERENCES sg_activations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  image_url TEXT,
  status VARCHAR(20) DEFAULT 'approved',
  contact_email TEXT,
  contact_phone TEXT,
  instagram_handle TEXT,
  booth_song_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(activation_id, slug)
);

CREATE TABLE IF NOT EXISTS sg_activation_votes (
  id SERIAL PRIMARY KEY,
  participant_id INT REFERENCES sg_participants(id) ON DELETE CASCADE,
  activation_id INT REFERENCES sg_activations(id) ON DELETE CASCADE,
  vote VARCHAR(20) NOT NULL CHECK (vote IN ('rules', 'hell_yeah', 'no_thanks')),
  browser_fingerprint TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- One vote per booth per device — race-proof at the DB level (see castVote ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_votes_participant_fingerprint
  ON sg_activation_votes (participant_id, browser_fingerprint);
CREATE INDEX IF NOT EXISTS idx_votes_activation_fingerprint
  ON sg_activation_votes (activation_id, browser_fingerprint);

CREATE TABLE IF NOT EXISTS sg_activation_optins (
  id SERIAL PRIMARY KEY,
  activation_id INT REFERENCES sg_activations(id) ON DELETE CASCADE,
  participant_id INT REFERENCES sg_participants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  unsubscribed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
