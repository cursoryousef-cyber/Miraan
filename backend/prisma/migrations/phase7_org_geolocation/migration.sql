-- AlterTable: add geolocation fields to organizations for GPS attendance geofencing
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "geo_lat" DECIMAL(10,7);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "geo_lng" DECIMAL(10,7);
