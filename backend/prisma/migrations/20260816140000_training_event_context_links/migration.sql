-- Optional training-context links on TrainingEvent.
--
-- Purely additive and entirely nullable: an event that has no rotation, no
-- schedule and no attached resource — a cluster-wide announcement, say — is
-- unaffected, so no existing row needs a value and none is written. The event
-- only ever *reads* these relations; nothing here lets an event modify an
-- assignment, a rotation or a schedule.
--
-- ON DELETE SET NULL throughout: deleting a rotation, a schedule or a file must
-- not delete the event that referenced it, nor block the deletion. The event
-- survives with the context detached.
--
-- Rollback is dropping the three constraints and the three columns.

ALTER TABLE "training_events" ADD COLUMN     "resource_file_id" UUID,
ADD COLUMN     "rotation_id" UUID,
ADD COLUMN     "schedule_id" UUID;

ALTER TABLE "training_events" ADD CONSTRAINT "training_events_rotation_id_fkey" FOREIGN KEY ("rotation_id") REFERENCES "rotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "training_events" ADD CONSTRAINT "training_events_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "training_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "training_events" ADD CONSTRAINT "training_events_resource_file_id_fkey" FOREIGN KEY ("resource_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
