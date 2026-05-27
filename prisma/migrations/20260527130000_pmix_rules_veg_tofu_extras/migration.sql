-- Add high-priority exclusion rules for Veg/Tofu modifier-name variants.
-- These ensure that "Veg & Tofu", "Veggie & Tofu", "Vegetables & Tofu" etc.
-- are filtered from Main Protein Totals even when appearing as a modifier name.

INSERT INTO "pmix_item_rules" ("id","pattern","matchType","category","label","priority","isActive","notes","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text, 'Veg & Tofu',         'contains', 'excluded', NULL, 110, true, 'Common protein-modifier value', NOW(), NOW()),
  (gen_random_uuid()::text, 'Veg and Tofu',       'contains', 'excluded', NULL, 110, true, 'Variant with "and"', NOW(), NOW()),
  (gen_random_uuid()::text, 'Veggie & Tofu',      'contains', 'excluded', NULL, 110, true, 'Veggie variant', NOW(), NOW()),
  (gen_random_uuid()::text, 'Veggies & Tofu',     'contains', 'excluded', NULL, 110, true, 'Plural veggies', NOW(), NOW()),
  (gen_random_uuid()::text, 'Vegetables & Tofu',  'contains', 'excluded', NULL, 110, true, 'Long form', NOW(), NOW()),
  (gen_random_uuid()::text, 'Vegetable & Tofu',   'contains', 'excluded', NULL, 110, true, 'Singular', NOW(), NOW()),
  (gen_random_uuid()::text, 'Veg',                'starts_with', 'excluded', NULL, 105, true, 'Catch any "Veg ..." prefix (modifier names)', NOW(), NOW());
