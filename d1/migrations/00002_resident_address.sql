-- Add per-resident address fields
ALTER TABLE residents ADD COLUMN address_street_number TEXT;
ALTER TABLE residents ADD COLUMN address_street_name TEXT;
ALTER TABLE residents ADD COLUMN city TEXT;
ALTER TABLE residents ADD COLUMN state TEXT;