-- Better Auth passkey plugin (@better-auth/passkey). Column names match the
-- plugin's default model fields so NO field mapping is needed in auth.ts.
CREATE TABLE IF NOT EXISTS passkey (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  publicKey TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  deviceType TEXT NOT NULL,
  backedUp INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  createdAt INTEGER,
  aaguid TEXT
);

CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_passkey_credential ON passkey(credentialID);
