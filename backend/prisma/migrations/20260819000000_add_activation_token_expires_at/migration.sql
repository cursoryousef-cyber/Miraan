-- AlterTable
ALTER TABLE "user_accounts" ADD COLUMN IF NOT EXISTS "activation_token_expires_at" TIMESTAMPTZ(6);
