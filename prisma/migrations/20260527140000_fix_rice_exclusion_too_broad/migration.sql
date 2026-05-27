-- Fix: "Rice" contains-exclusion was too broad and blocked "Pineapple Fried Rice- Lobster",
-- "Fried Rice- Shrimp", etc. from being classified under their protein.
--
-- Strategy:
--   1. Change the generic "Rice" rule from matchType='contains' → matchType='exact'
--      so only an item literally named "Rice" is excluded.
--   2. Add specific exclusions for actual plain-rice side dishes.
--   3. "Pineapple Fried Rice- Lobster" will now fall through to the "Lobster"
--      contains rule (priority 5) and be counted as main_protein: Lobster.

-- Step 1: Narrow the generic "Rice" rule to exact-match only.
UPDATE "pmix_item_rules"
SET    "matchType" = 'exact',
       "notes"     = 'Exact "Rice" only — narrowed from contains to avoid matching Fried Rice dishes',
       "updatedAt" = NOW()
WHERE  "pattern"   = 'Rice'
  AND  "matchType" = 'contains'
  AND  "category"  = 'excluded';

-- Step 2: Add specific exclusions for plain rice side dishes (priority 85, above protein rules).
INSERT INTO "pmix_item_rules" ("id","pattern","matchType","category","label","priority","isActive","notes","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text, 'Steamed Rice',     'contains', 'excluded', NULL, 85, true, 'Plain steamed rice sides', NOW(), NOW()),
  (gen_random_uuid()::text, 'Jasmine Rice',     'contains', 'excluded', NULL, 85, true, 'Jasmine rice sides', NOW(), NOW()),
  (gen_random_uuid()::text, 'Brown Rice',       'contains', 'excluded', NULL, 85, true, 'Brown rice sides', NOW(), NOW()),
  (gen_random_uuid()::text, 'White Rice',       'contains', 'excluded', NULL, 85, true, 'White rice sides', NOW(), NOW()),
  (gen_random_uuid()::text, 'Cauliflower Rice', 'contains', 'excluded', NULL, 85, true, 'Low-carb rice alternative', NOW(), NOW()),
  (gen_random_uuid()::text, 'Side Rice',        'contains', 'excluded', NULL, 85, true, 'Any "Side Rice" items', NOW(), NOW());
