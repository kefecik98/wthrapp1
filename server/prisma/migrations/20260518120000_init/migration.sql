-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "fcm_token" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "plan" TEXT,
    "expires_at" TIMESTAMPTZ,
    "revenuecat_user_id" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_locations" (
    "user_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "alert_lead_min" INTEGER NOT NULL DEFAULT 10,
    "alert_rain" BOOLEAN NOT NULL DEFAULT true,
    "alert_snow" BOOLEAN NOT NULL DEFAULT true,
    "alert_hail" BOOLEAN NOT NULL DEFAULT true,
    "alert_thunder" BOOLEAN NOT NULL DEFAULT true,
    "alert_wind" BOOLEAN NOT NULL DEFAULT false,
    "min_rain_intensity" TEXT NOT NULL DEFAULT 'light',
    "notifications_on" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "alert_log" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_start_at" TIMESTAMPTZ NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_log_user_id_event_type_event_start_at_key" ON "alert_log"("user_id", "event_type", "event_start_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_log" ADD CONSTRAINT "alert_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

