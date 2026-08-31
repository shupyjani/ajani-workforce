ALTER TABLE "shift_assignments" ADD COLUMN "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD COLUMN "cancellation_reason" text;
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_cancellation_check" CHECK (("shift_assignments"."status" = 'cancelled' and "shift_assignments"."cancelled_at" is not null and "shift_assignments"."cancellation_reason" is not null) or ("shift_assignments"."status" <> 'cancelled' and "shift_assignments"."cancelled_at" is null and "shift_assignments"."cancellation_reason" is null));
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_version_check" CHECK ("shift_assignments"."version" > 0);
--> statement-breakpoint
CREATE INDEX "shift_assignments_worker_lifecycle_index" ON "shift_assignments" USING btree ("worker_profile_id", "status", "assigned_at", "id");
--> statement-breakpoint
CREATE INDEX "shifts_worker_discovery_index" ON "shifts" USING btree ("organisation_id", "role_title", "status", "starts_at", "id");
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"worker_profile_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_payload" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_operation_check" CHECK ("idempotency_records"."operation" in ('request_shift', 'cancel_assignment')),
	CONSTRAINT "idempotency_records_key_length_check" CHECK (char_length("idempotency_records"."idempotency_key") between 8 and 128),
	CONSTRAINT "idempotency_records_response_status_check" CHECK ("idempotency_records"."response_status" between 200 and 299),
	CONSTRAINT "idempotency_records_expiry_check" CHECK ("idempotency_records"."expires_at" > "idempotency_records"."created_at")
);
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_worker_profile_id_worker_profiles_id_fk" FOREIGN KEY ("worker_profile_id") REFERENCES "public"."worker_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_scope_key_unique" ON "idempotency_records" USING btree ("worker_profile_id", "operation", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "idempotency_records_expiry_index" ON "idempotency_records" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_type_check";
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_type_check" CHECK ("activity_events"."event_type" in ('shift_updated', 'shift_confirmed', 'shift_requested', 'shift_request_review', 'shift_cancelled', 'readiness_updated', 'profile_reviewed'));
