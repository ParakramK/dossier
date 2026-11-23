-- The 1.14 feature build kept sources in a "PostingSource" enum. 1.15 stores
-- them as text so portals can be added without a migration (#269). Undo the
-- compatibility shim without changing any stored value.
ALTER TABLE "Posting" ALTER COLUMN "source" TYPE TEXT USING "source"::text;
ALTER TABLE "AgentCandidate" ALTER COLUMN "source" TYPE TEXT USING "source"::text;
ALTER TABLE "PostingScore" ALTER COLUMN "source" TYPE TEXT USING "source"::text;
ALTER TABLE "PostingSearch" ALTER COLUMN "source" TYPE TEXT USING "source"::text;

DROP INDEX IF EXISTS "PostingScore_source_externalId_key";
DROP TYPE IF EXISTS "PostingSource";
