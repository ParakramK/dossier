-- Bring a Dossier 1.15.x PostgreSQL database up to the feature build (1.14-based).
--
-- Run this BEFORE starting the feature image, on the database your 1.15 install
-- uses. Everything here is additive: no table, column or row is dropped, so all
-- your data stays and a 1.15 image can still read the database afterwards.
--
-- 1.15 turned the four "source" columns into text and dropped the
-- "PostingSource" enum; the feature build's Prisma client still uses it. We put
-- the enum back with every value the database actually holds (including ids of
-- portals you added yourself) and convert the columns back.
--
-- 1.15 also moved the profile's headline, summary and resume settings into the
-- Profile table. The feature build reads them from ProfileField and Setting, so
-- we copy them back. The Profile table is left untouched.
--
-- The three feature migrations (extra source values, OpportunityWatch, Startup
-- outreach) then run normally from the image's start.sh.

BEGIN;

-- Recreate the enum with all values in use. "JSEARCH" is a seed so the enum
-- is valid even on a brand-new database with no postings yet.
DO $$
DECLARE
  labels text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'PostingSource' AND typnamespace = 'public'::regnamespace
  ) THEN
    SELECT string_agg(quote_literal(source), ', ' ORDER BY source)
      INTO labels
      FROM (
        SELECT 'JSEARCH' AS source
        UNION SELECT source FROM "Posting"
        UNION SELECT source FROM "AgentCandidate"
        UNION SELECT source FROM "PostingScore"
        UNION SELECT source FROM "PostingSearch"
      ) AS used;
    EXECUTE format('CREATE TYPE "PostingSource" AS ENUM (%s)', labels);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Posting' AND column_name = 'source' AND data_type = 'text'
  ) THEN
    ALTER TABLE "Posting" ALTER COLUMN "source" TYPE "PostingSource" USING "source"::"PostingSource";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentCandidate' AND column_name = 'source' AND data_type = 'text'
  ) THEN
    ALTER TABLE "AgentCandidate" ALTER COLUMN "source" TYPE "PostingSource" USING "source"::"PostingSource";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PostingScore' AND column_name = 'source' AND data_type = 'text'
  ) THEN
    ALTER TABLE "PostingScore" ALTER COLUMN "source" TYPE "PostingSource" USING "source"::"PostingSource";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PostingSearch' AND column_name = 'source' AND data_type = 'text'
  ) THEN
    ALTER TABLE "PostingSearch" ALTER COLUMN "source" TYPE "PostingSource" USING "source"::"PostingSource";
  END IF;
END $$;

-- 1.15 also made "profileId" required on the profile entries and on scores,
-- with no default. The feature build has one profile and doesn't send that
-- field, so default it to the first profile. Existing rows keep their values.
DO $$
DECLARE
  first_id text;
  tbl text;
BEGIN
  IF to_regclass('public."Profile"') IS NULL THEN RETURN; END IF;
  SELECT id INTO first_id FROM "Profile" ORDER BY "sort", "createdAt" LIMIT 1;
  IF first_id IS NULL THEN RETURN; END IF;
  FOREACH tbl IN ARRAY ARRAY[
    'Certification', 'CustomSection', 'Education', 'Experience',
    'PostingScore', 'Project', 'Publication', 'Reference', 'Skill'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tbl AND column_name = 'profileId'
        AND is_nullable = 'NO' AND column_default IS NULL
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN "profileId" SET DEFAULT %L', tbl, first_id);
    END IF;
  END LOOP;
END $$;

-- 1.15 searched several portals at once and left PostingSearch.source null
-- (the portals are listed in its "portals" column). The feature build shows
-- one source per search, so name the portal that found the most postings.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PostingSearch' AND column_name = 'portals'
  ) THEN
    UPDATE "PostingSearch"
       SET "source" = (
         SELECT (portal ->> 'id')::"PostingSource"
         FROM jsonb_array_elements("portals") AS portal
         WHERE portal ->> 'id' IN (
           SELECT enumlabel FROM pg_enum WHERE enumtypid = 'PostingSource'::regtype
         )
         ORDER BY (portal ->> 'found')::integer DESC NULLS LAST
         LIMIT 1
       )
     WHERE "source" IS NULL;
    UPDATE "PostingSearch" SET "source" = 'JSEARCH'::"PostingSource" WHERE "source" IS NULL;
  END IF;
END $$;

-- The feature build scores a posting by (source, externalId); 1.15's primary
-- key has a third column, so give Prisma's upsert the unique index it expects.
CREATE UNIQUE INDEX IF NOT EXISTS "PostingScore_source_externalId_key"
  ON "PostingScore" ("source", "externalId");

-- Copy the headline and summary back into the rows the feature build reads.
-- Their 1.15 home in Profile stays exactly as it was.
WITH first_profile AS (
  SELECT headline, summary FROM "Profile" ORDER BY "sort", "createdAt" LIMIT 1
), restored (key, value) AS (
  SELECT 'headline', headline FROM first_profile WHERE btrim(headline) <> ''
  UNION ALL
  SELECT 'summary', summary FROM first_profile WHERE btrim(summary) <> ''
)
INSERT INTO "ProfileField" ("key", "value", "updatedAt")
SELECT key, value, CURRENT_TIMESTAMP FROM restored
ON CONFLICT ("key") DO UPDATE
  SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;

-- The same for the eight resume settings 1.15 moved into Profile.settings.
WITH first_profile AS (
  SELECT settings FROM "Profile" ORDER BY "sort", "createdAt" LIMIT 1
), wanted (key) AS (
  VALUES
    ('baseThemeId'), ('resumeLanguage'), ('resumeSections'), ('fitBaseResume'),
    ('skillOrder'), ('experienceOrder'), ('projectOrder'), ('educationOrder')
)
INSERT INTO "Setting" ("key", "value", "updatedAt")
SELECT wanted.key, first_profile.settings ->> wanted.key, CURRENT_TIMESTAMP
FROM wanted, first_profile
WHERE first_profile.settings ? wanted.key
  AND first_profile.settings ->> wanted.key IS NOT NULL
ON CONFLICT ("key") DO UPDATE
  SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
