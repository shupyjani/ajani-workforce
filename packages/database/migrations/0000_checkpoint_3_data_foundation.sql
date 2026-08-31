CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_status_check" CHECK ("organisations"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_name_unique" ON "organisations" USING btree ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_slug_unique" ON "organisations" USING btree ("slug");
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_status_check" CHECK ("locations"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "locations_organisation_slug_unique" ON "locations" USING btree ("organisation_id", "slug");
--> statement-breakpoint
CREATE INDEX "locations_organisation_status_index" ON "locations" USING btree ("organisation_id", "status");
--> statement-breakpoint
CREATE TABLE "workforce_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"home_location_id" uuid,
	"preview_reference" text NOT NULL,
	"given_name" text NOT NULL,
	"family_name" text NOT NULL,
	"role_title" text NOT NULL,
	"home_area_name" text,
	"member_type" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workforce_members_type_check" CHECK ("workforce_members"."member_type" in ('worker', 'manager', 'administrator')),
	CONSTRAINT "workforce_members_status_check" CHECK ("workforce_members"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "workforce_members" ADD CONSTRAINT "workforce_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workforce_members" ADD CONSTRAINT "workforce_members_home_location_id_locations_id_fk" FOREIGN KEY ("home_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_members_organisation_reference_unique" ON "workforce_members" USING btree ("organisation_id", "preview_reference");
--> statement-breakpoint
CREATE INDEX "workforce_members_organisation_type_status_index" ON "workforce_members" USING btree ("organisation_id", "member_type", "status");
--> statement-breakpoint
CREATE TABLE "worker_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workforce_member_id" uuid NOT NULL,
	"overall_readiness_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_profiles_readiness_check" CHECK ("worker_profiles"."overall_readiness_status" in ('ready', 'action_due', 'reviewing'))
);
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_workforce_member_id_workforce_members_id_fk" FOREIGN KEY ("workforce_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_profiles_member_unique" ON "worker_profiles" USING btree ("workforce_member_id");
--> statement-breakpoint
CREATE INDEX "worker_profiles_readiness_index" ON "worker_profiles" USING btree ("overall_readiness_status");
--> statement-breakpoint
CREATE TABLE "competencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "competencies_organisation_code_unique" ON "competencies" USING btree ("organisation_id", "code");
--> statement-breakpoint
CREATE INDEX "competencies_organisation_index" ON "competencies" USING btree ("organisation_id");
--> statement-breakpoint
CREATE TABLE "worker_competencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"worker_profile_id" uuid NOT NULL,
	"competency_id" uuid NOT NULL,
	"status" text NOT NULL,
	"verified_on" date,
	"expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_competencies_status_check" CHECK ("worker_competencies"."status" in ('current', 'due_soon', 'expired', 'reviewing')),
	CONSTRAINT "worker_competencies_date_order_check" CHECK ("worker_competencies"."verified_on" is null or "worker_competencies"."expires_on" is null or "worker_competencies"."expires_on" >= "worker_competencies"."verified_on")
);
--> statement-breakpoint
ALTER TABLE "worker_competencies" ADD CONSTRAINT "worker_competencies_worker_profile_id_worker_profiles_id_fk" FOREIGN KEY ("worker_profile_id") REFERENCES "public"."worker_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_competencies" ADD CONSTRAINT "worker_competencies_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_competencies_profile_competency_unique" ON "worker_competencies" USING btree ("worker_profile_id", "competency_id");
--> statement-breakpoint
CREATE INDEX "worker_competencies_profile_status_expiry_index" ON "worker_competencies" USING btree ("worker_profile_id", "status", "expires_on");
--> statement-breakpoint
CREATE TABLE "compliance_requirements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"competency_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_requirements_sort_order_check" CHECK ("compliance_requirements"."sort_order" > 0)
);
--> statement-breakpoint
ALTER TABLE "compliance_requirements" ADD CONSTRAINT "compliance_requirements_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compliance_requirements" ADD CONSTRAINT "compliance_requirements_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_requirements_organisation_code_unique" ON "compliance_requirements" USING btree ("organisation_id", "code");
--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_requirements_organisation_order_unique" ON "compliance_requirements" USING btree ("organisation_id", "sort_order");
--> statement-breakpoint
CREATE INDEX "compliance_requirements_organisation_index" ON "compliance_requirements" USING btree ("organisation_id");
--> statement-breakpoint
CREATE TABLE "compliance_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"worker_profile_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reviewed_on" date,
	"due_on" date,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_records_status_check" CHECK ("compliance_records"."status" in ('current', 'due_soon', 'action_due', 'reviewing')),
	CONSTRAINT "compliance_records_date_order_check" CHECK ("compliance_records"."reviewed_on" is null or "compliance_records"."due_on" is null or "compliance_records"."due_on" >= "compliance_records"."reviewed_on")
);
--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_worker_profile_id_worker_profiles_id_fk" FOREIGN KEY ("worker_profile_id") REFERENCES "public"."worker_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_requirement_id_compliance_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."compliance_requirements"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_records_profile_requirement_unique" ON "compliance_records" USING btree ("worker_profile_id", "requirement_id");
--> statement-breakpoint
CREATE INDEX "compliance_records_profile_status_due_index" ON "compliance_records" USING btree ("worker_profile_id", "status", "due_on");
--> statement-breakpoint
CREATE INDEX "compliance_records_requirement_index" ON "compliance_records" USING btree ("requirement_id");
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"area_name" text NOT NULL,
	"role_title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"required_workers" integer NOT NULL,
	"status" text NOT NULL,
	"arrival_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_status_check" CHECK ("shifts"."status" in ('open', 'covered', 'cancelled')),
	CONSTRAINT "shifts_required_workers_check" CHECK ("shifts"."required_workers" > 0),
	CONSTRAINT "shifts_time_order_check" CHECK ("shifts"."ends_at" > "shifts"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_location_area_start_role_unique" ON "shifts" USING btree ("location_id", "area_name", "starts_at", "role_title");
--> statement-breakpoint
CREATE INDEX "shifts_organisation_start_index" ON "shifts" USING btree ("organisation_id", "starts_at");
--> statement-breakpoint
CREATE INDEX "shifts_location_start_index" ON "shifts" USING btree ("location_id", "starts_at");
--> statement-breakpoint
CREATE INDEX "shifts_status_start_index" ON "shifts" USING btree ("status", "starts_at");
--> statement-breakpoint
CREATE TABLE "shift_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shift_id" uuid NOT NULL,
	"worker_profile_id" uuid NOT NULL,
	"status" text NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_assignments_status_check" CHECK ("shift_assignments"."status" in ('confirmed', 'review', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_worker_profile_id_worker_profiles_id_fk" FOREIGN KEY ("worker_profile_id") REFERENCES "public"."worker_profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "shift_assignments_shift_worker_unique" ON "shift_assignments" USING btree ("shift_id", "worker_profile_id");
--> statement-breakpoint
CREATE INDEX "shift_assignments_worker_status_index" ON "shift_assignments" USING btree ("worker_profile_id", "status");
--> statement-breakpoint
CREATE INDEX "shift_assignments_shift_status_index" ON "shift_assignments" USING btree ("shift_id", "status");
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_member_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"tone" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_tone_check" CHECK ("notifications"."tone" in ('information', 'warning', 'success')),
	CONSTRAINT "notifications_read_time_check" CHECK ("notifications"."read_at" is null or "notifications"."read_at" >= "notifications"."occurred_at")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_member_id_workforce_members_id_fk" FOREIGN KEY ("recipient_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notifications_recipient_occurred_index" ON "notifications" USING btree ("recipient_member_id", "occurred_at", "id");
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"actor_member_id" uuid,
	"subject_member_id" uuid,
	"shift_id" uuid,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_type_check" CHECK ("activity_events"."event_type" in ('shift_updated', 'shift_confirmed', 'readiness_updated', 'profile_reviewed'))
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_member_id_workforce_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_subject_member_id_workforce_members_id_fk" FOREIGN KEY ("subject_member_id") REFERENCES "public"."workforce_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "activity_events_subject_occurred_index" ON "activity_events" USING btree ("subject_member_id", "occurred_at", "id");
--> statement-breakpoint
CREATE INDEX "activity_events_organisation_occurred_index" ON "activity_events" USING btree ("organisation_id", "occurred_at");
