-- Unified training events layer. Purely additive: two new tables and their
-- foreign keys. No existing table, column, constraint or row is touched, so
-- deploying this cannot affect TrainerCall, Rotation, Schedule or any other
-- existing behaviour, and rolling it back is a pair of DROP TABLEs.

CREATE TABLE "training_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "event_type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "response_mode" VARCHAR(30) NOT NULL,
    "audience_type" VARCHAR(30) NOT NULL,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "sent_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "training_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_event_recipients" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "recipient_account_id" UUID NOT NULL,
    "trainer_profile_id" UUID,
    "trainee_profile_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "acknowledged_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "declined_at" TIMESTAMPTZ(6),
    "attended_at" TIMESTAMPTZ(6),
    "arrived_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "training_event_recipients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_events_organization_id_status_idx" ON "training_events"("organization_id", "status");
CREATE INDEX "training_events_created_by_idx" ON "training_events"("created_by");
CREATE INDEX "training_event_recipients_recipient_account_id_status_idx" ON "training_event_recipients"("recipient_account_id", "status");

-- Idempotency is enforced by the database, not only by the service: a resend
-- cannot produce a duplicate recipient row (and therefore no duplicate
-- notification) even if the application logic were wrong.
CREATE UNIQUE INDEX "training_event_recipients_event_id_recipient_account_id_key" ON "training_event_recipients"("event_id", "recipient_account_id");

ALTER TABLE "training_events" ADD CONSTRAINT "training_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_event_recipients" ADD CONSTRAINT "training_event_recipients_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "training_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_event_recipients" ADD CONSTRAINT "training_event_recipients_recipient_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_event_recipients" ADD CONSTRAINT "training_event_recipients_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
