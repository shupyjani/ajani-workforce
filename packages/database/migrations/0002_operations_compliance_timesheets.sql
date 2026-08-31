ALTER TABLE "shifts" DROP CONSTRAINT "shifts_status_check";
--> statement-breakpoint
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_required_workers_check";
--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "cancellation_reason" text;
--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "created_by_member_id" uuid;
--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_member_id_workforce_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_status_check" CHECK ("shifts"."status" in ('draft', 'open', 'covered', 'cancelled', 'completed'));
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_required_workers_check" CHECK ("shifts"."required_workers" between 1 and 50);
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_duration_check" CHECK ("shifts"."ends_at" <= "shifts"."starts_at" + interval '24 hours');
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cancellation_check" CHECK (("shifts"."status" = 'cancelled' and "shifts"."cancelled_at" is not null and "shifts"."cancellation_reason" is not null) or ("shifts"."status" <> 'cancelled' and "shifts"."cancelled_at" is null and "shifts"."cancellation_reason" is null));
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_version_check" CHECK ("shifts"."version" > 0);
--> statement-breakpoint
ALTER TABLE "shift_assignments" DROP CONSTRAINT "shift_assignments_status_check";
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD COLUMN "reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD COLUMN "review_reason" text;
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD COLUMN "reviewed_by_member_id" uuid;
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_reviewed_by_member_id_workforce_members_id_fk" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_status_check" CHECK ("shift_assignments"."status" in ('confirmed', 'review', 'cancelled', 'declined'));
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_review_check" CHECK ("shift_assignments"."status" <> 'declined' or ("shift_assignments"."reviewed_at" is not null and "shift_assignments"."review_reason" is not null and "shift_assignments"."reviewed_by_member_id" is not null));
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_review_reason_length_check" CHECK ("shift_assignments"."review_reason" is null or char_length("shift_assignments"."review_reason") between 1 and 240);
--> statement-breakpoint
ALTER TABLE "compliance_records" DROP CONSTRAINT "compliance_records_status_check";
--> statement-breakpoint
ALTER TABLE "compliance_records" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "compliance_records" ADD COLUMN "review_note" text;
--> statement-breakpoint
ALTER TABLE "compliance_records" ADD COLUMN "reviewed_by_member_id" uuid;
--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_reviewed_by_member_id_workforce_members_id_fk" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_status_check" CHECK ("compliance_records"."status" in ('current', 'due_soon', 'action_due', 'reviewing', 'information_required', 'rejected'));
--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_version_check" CHECK ("compliance_records"."version" > 0);
--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_review_note_length_check" CHECK ("compliance_records"."review_note" is null or char_length("compliance_records"."review_note") between 1 and 500);
--> statement-breakpoint
CREATE TABLE "compliance_review_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"compliance_record_id" uuid NOT NULL,
	"administrator_member_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_review_events_decision_check" CHECK ("compliance_review_events"."decision" in ('approved_current', 'further_information_required', 'rejected')),
	CONSTRAINT "compliance_review_events_note_length_check" CHECK (char_length("compliance_review_events"."note") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "compliance_review_events" ADD CONSTRAINT "compliance_review_events_compliance_record_id_compliance_records_id_fk" FOREIGN KEY ("compliance_record_id") REFERENCES "public"."compliance_records"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compliance_review_events" ADD CONSTRAINT "compliance_review_events_administrator_member_id_workforce_members_id_fk" FOREIGN KEY ("administrator_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "compliance_review_events_record_occurred_index" ON "compliance_review_events" USING btree ("compliance_record_id", "occurred_at", "id");
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"worker_profile_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"worked_start" timestamp with time zone NOT NULL,
	"worked_end" timestamp with time zone NOT NULL,
	"break_minutes" integer NOT NULL,
	"worked_minutes" integer NOT NULL,
	"worker_note" text,
	"manager_review_note" text,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"reviewed_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timesheets_status_check" CHECK ("timesheets"."status" in ('draft', 'submitted', 'rejected', 'approved')),
	CONSTRAINT "timesheets_version_check" CHECK ("timesheets"."version" > 0),
	CONSTRAINT "timesheets_time_order_check" CHECK ("timesheets"."worked_end" > "timesheets"."worked_start"),
	CONSTRAINT "timesheets_duration_check" CHECK ("timesheets"."worked_end" <= "timesheets"."worked_start" + interval '24 hours'),
	CONSTRAINT "timesheets_break_check" CHECK ("timesheets"."break_minutes" >= 0 and "timesheets"."break_minutes" < extract(epoch from ("timesheets"."worked_end" - "timesheets"."worked_start")) / 60),
	CONSTRAINT "timesheets_worked_minutes_check" CHECK ("timesheets"."worked_minutes" = floor(extract(epoch from ("timesheets"."worked_end" - "timesheets"."worked_start")) / 60)::int - "timesheets"."break_minutes" and "timesheets"."worked_minutes" between 1 and 1440),
	CONSTRAINT "timesheets_worker_note_length_check" CHECK ("timesheets"."worker_note" is null or char_length("timesheets"."worker_note") <= 500),
	CONSTRAINT "timesheets_manager_note_length_check" CHECK ("timesheets"."manager_review_note" is null or char_length("timesheets"."manager_review_note") <= 500),
	CONSTRAINT "timesheets_lifecycle_check" CHECK (("timesheets"."status" = 'draft' and "timesheets"."submitted_at" is null and "timesheets"."approved_at" is null and "timesheets"."rejected_at" is null and "timesheets"."reviewed_by_member_id" is null) or ("timesheets"."status" = 'submitted' and "timesheets"."submitted_at" is not null and "timesheets"."approved_at" is null and "timesheets"."rejected_at" is null and "timesheets"."reviewed_by_member_id" is null) or ("timesheets"."status" = 'rejected' and "timesheets"."submitted_at" is not null and "timesheets"."approved_at" is null and "timesheets"."rejected_at" is not null and "timesheets"."reviewed_by_member_id" is not null and "timesheets"."manager_review_note" is not null) or ("timesheets"."status" = 'approved' and "timesheets"."submitted_at" is not null and "timesheets"."approved_at" is not null and "timesheets"."rejected_at" is null and "timesheets"."reviewed_by_member_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_assignment_id_shift_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_worker_profile_id_worker_profiles_id_fk" FOREIGN KEY ("worker_profile_id") REFERENCES "public"."worker_profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_reviewed_by_member_id_workforce_members_id_fk" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "timesheets_assignment_unique" ON "timesheets" USING btree ("assignment_id");
--> statement-breakpoint
CREATE INDEX "timesheets_worker_status_updated_index" ON "timesheets" USING btree ("worker_profile_id", "status", "updated_at", "id");
--> statement-breakpoint
CREATE INDEX "timesheets_organisation_status_updated_index" ON "timesheets" USING btree ("organisation_id", "status", "updated_at", "id");
--> statement-breakpoint
ALTER TABLE "idempotency_records" DROP CONSTRAINT "idempotency_records_operation_check";
--> statement-breakpoint
DROP INDEX "idempotency_records_scope_key_unique";
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD COLUMN "actor_member_id" uuid;
--> statement-breakpoint
UPDATE "idempotency_records" AS "record" SET "actor_member_id" = "profile"."workforce_member_id" FROM "worker_profiles" AS "profile" WHERE "record"."worker_profile_id" = "profile"."id";
--> statement-breakpoint
ALTER TABLE "idempotency_records" ALTER COLUMN "actor_member_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "idempotency_records" ALTER COLUMN "worker_profile_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_member_id_workforce_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_scope_key_unique" ON "idempotency_records" USING btree ("actor_member_id", "operation", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_operation_check" CHECK ("idempotency_records"."operation" in ('request_shift', 'cancel_assignment', 'manager_assignment_decision', 'create_shift', 'update_shift', 'publish_shift', 'cancel_shift', 'compliance_decision', 'create_timesheet', 'update_timesheet', 'submit_timesheet', 'timesheet_decision'));
--> statement-breakpoint
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_type_check";
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_type_check" CHECK ("activity_events"."event_type" in ('shift_updated', 'shift_confirmed', 'shift_requested', 'shift_request_review', 'shift_cancelled', 'assignment_approved', 'assignment_declined', 'shift_created', 'shift_published', 'shift_manager_cancelled', 'compliance_decided', 'timesheet_saved', 'timesheet_submitted', 'timesheet_approved', 'timesheet_rejected', 'readiness_updated', 'profile_reviewed'));
