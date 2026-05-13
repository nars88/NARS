-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('Pending', 'Confirmed', 'Shipped', 'Delivered', 'Canceled');

-- CreateEnum
CREATE TYPE "iraq_province" AS ENUM ('Baghdad', 'Basra', 'Nineveh', 'Erbil', 'Sulaymaniyah', 'Duhok', 'Kirkuk', 'Anbar', 'Diyala', 'Babil', 'Karbala', 'Najaf', 'Wasit', 'Maysan', 'Dhi_Qar', 'Muthanna', 'Qadisiyyah', 'Saladin', 'Halabja', 'Unknown');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "customer_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "province" "iraq_province" NOT NULL DEFAULT 'Unknown',
    "full_address" TEXT,
    "product_details" JSONB NOT NULL DEFAULT '[]',
    "total_price" DECIMAL(12,0),
    "delivery_fee" DECIMAL(12,0) DEFAULT 0,
    "order_status" "order_status" NOT NULL DEFAULT 'Pending',
    "original_raw_text" TEXT NOT NULL,
    "ai_confidence" SMALLINT,
    "ai_model" TEXT,
    "employee_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_audit_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "order_id" UUID NOT NULL,
    "changed_by" UUID,
    "old_status" "order_status",
    "new_status" "order_status",
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "order_audit_log_pkey" PRIMARY KEY ("id")
);
