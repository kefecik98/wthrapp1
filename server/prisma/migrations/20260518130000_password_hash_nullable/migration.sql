-- Social-only accounts (Apple/Google) have no password.
-- Make users.password_hash nullable.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
