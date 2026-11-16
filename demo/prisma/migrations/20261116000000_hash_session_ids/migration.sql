-- Session ids are now stored as the SHA-256 (hex) of the token in the
-- browser cookie, never the token itself — a leaked database or backup no
-- longer hands out live sessions. See lib/session-token.ts.
--
-- Rewrites the existing rows in place so nobody is signed out: an old
-- cookie still holds the raw id, and the app now looks sessions up by
-- sha256(cookie), which is exactly what each row's id becomes here.
-- No user data changes; nothing references Session.id. Rows that already
-- look like a hash are left alone, so a re-run is harmless.

UPDATE "Session"
SET "id" = encode(sha256(convert_to("id", 'UTF8')), 'hex')
WHERE "id" !~ '^[0-9a-f]{64}$';

UPDATE "DomainSession"
SET "id" = encode(sha256(convert_to("id", 'UTF8')), 'hex')
WHERE "id" !~ '^[0-9a-f]{64}$';
