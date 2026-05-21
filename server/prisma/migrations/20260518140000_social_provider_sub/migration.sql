-- Robust social-account matching: store the provider + stable subject id
-- instead of relying on (possibly private-relay) email.
ALTER TABLE "users" ADD COLUMN "provider" TEXT;
ALTER TABLE "users" ADD COLUMN "provider_sub" TEXT;

CREATE UNIQUE INDEX "users_provider_provider_sub_key"
  ON "users"("provider", "provider_sub");
