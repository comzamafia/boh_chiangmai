-- CreateTable: PmixItemRule
-- Rules engine for item-name-based classification (protein, dessert, excluded).
-- Replaces the need to have modifier groups for every item.

CREATE TABLE "pmix_item_rules" (
    "id"        TEXT NOT NULL,
    "pattern"   TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "category"  TEXT NOT NULL,
    "label"     TEXT,
    "priority"  INTEGER NOT NULL DEFAULT 0,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pmix_item_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pmix_item_rules_category_isActive_idx" ON "pmix_item_rules"("category", "isActive");

-- ─── Seed: Exclusion rules (priority 100 — checked first) ────────────────────
INSERT INTO "pmix_item_rules" ("id","pattern","matchType","category","label","priority","isActive","notes","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text, 'Vegetable',  'contains', 'excluded', NULL, 100, true, 'Exclude all vegetable dishes', NOW(), NOW()),
  (gen_random_uuid()::text, 'Vegetables', 'contains', 'excluded', NULL, 100, true, 'Plural form', NOW(), NOW()),
  (gen_random_uuid()::text, 'Veggie',     'contains', 'excluded', NULL, 100, true, 'Veggie alias', NOW(), NOW()),
  (gen_random_uuid()::text, 'Vegan',      'contains', 'excluded', NULL, 100, true, 'Vegan items', NOW(), NOW()),
  (gen_random_uuid()::text, 'Tofu',       'contains', 'excluded', NULL, 100, true, 'Tofu items', NOW(), NOW()),
  (gen_random_uuid()::text, 'Tempeh',     'contains', 'excluded', NULL, 100, true, 'Tempeh items', NOW(), NOW()),
  (gen_random_uuid()::text, 'Mushroom',   'contains', 'excluded', NULL,  90, true, 'Mushroom-only dishes (not mixed)', NOW(), NOW()),
  (gen_random_uuid()::text, 'Spring Roll','contains', 'excluded', NULL,  90, true, 'Spring rolls are misc', NOW(), NOW()),
  (gen_random_uuid()::text, 'Salad',      'contains', 'excluded', NULL,  90, true, 'Salad items', NOW(), NOW()),
  (gen_random_uuid()::text, 'Som Tum',    'contains', 'excluded', NULL,  90, true, 'Papaya salad — no protein tracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'Rice',       'contains', 'excluded', NULL,  80, true, 'Plain rice sides', NOW(), NOW()),
  (gen_random_uuid()::text, 'Noodle',     'contains', 'excluded', NULL,  80, true, 'Plain noodle sides', NOW(), NOW()),
  (gen_random_uuid()::text, 'Drink',      'contains', 'excluded', NULL,  90, true, 'Beverages', NOW(), NOW()),
  (gen_random_uuid()::text, 'Juice',      'contains', 'excluded', NULL,  90, true, 'Juices', NOW(), NOW()),
  (gen_random_uuid()::text, 'Water',      'contains', 'excluded', NULL,  90, true, 'Water items', NOW(), NOW()),
  (gen_random_uuid()::text, 'Beer',       'contains', 'excluded', NULL,  90, true, 'Beer', NOW(), NOW()),
  (gen_random_uuid()::text, 'Wine',       'contains', 'excluded', NULL,  90, true, 'Wine', NOW(), NOW()),
  (gen_random_uuid()::text, 'Cocktail',   'contains', 'excluded', NULL,  90, true, 'Cocktails', NOW(), NOW()),
  (gen_random_uuid()::text, 'Mocktail',   'contains', 'excluded', NULL,  90, true, 'Mocktails', NOW(), NOW()),
  (gen_random_uuid()::text, 'Sauce',      'contains', 'excluded', NULL,  80, true, 'Sauces and condiments', NOW(), NOW());

-- ─── Seed: Dessert rules (priority 50) ───────────────────────────────────────
INSERT INTO "pmix_item_rules" ("id","pattern","matchType","category","label","priority","isActive","notes","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text, 'Ice Cream',     'contains', 'dessert', 'Ice Cream',     50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Gelato',        'contains', 'dessert', 'Gelato',        50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Sorbet',        'contains', 'dessert', 'Sorbet',        50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Panna Cotta',   'contains', 'dessert', 'Panna Cotta',   50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Crème Brûlée',  'contains', 'dessert', 'Crème Brûlée',  50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Creme Brulee',  'contains', 'dessert', 'Crème Brûlée',  50, true, 'ASCII variant', NOW(), NOW()),
  (gen_random_uuid()::text, 'Sticky Rice',   'contains', 'dessert', 'Sticky Rice',   50, true, 'Mango sticky rice etc.', NOW(), NOW()),
  (gen_random_uuid()::text, 'Mango Sticky',  'contains', 'dessert', 'Mango Sticky Rice', 55, true, 'Higher priority than plain Sticky Rice', NOW(), NOW()),
  (gen_random_uuid()::text, 'Brownie',       'contains', 'dessert', 'Brownie',       50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Cake',          'contains', 'dessert', 'Cake',          50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Cheesecake',    'contains', 'dessert', 'Cheesecake',    55, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Pudding',       'contains', 'dessert', 'Pudding',       50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Tart',          'contains', 'dessert', 'Tart',          50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Waffle',        'contains', 'dessert', 'Waffle',        50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Crepe',         'contains', 'dessert', 'Crepe',         50, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Dessert',       'contains', 'dessert', 'Dessert',       45, true, 'Catch-all for any item named "... Dessert"', NOW(), NOW());

-- ─── Seed: Main protein rules (priority 0–10) ────────────────────────────────
INSERT INTO "pmix_item_rules" ("id","pattern","matchType","category","label","priority","isActive","notes","createdAt","updatedAt") VALUES
  -- Beef
  (gen_random_uuid()::text, 'Wagyu',        'contains', 'main_protein', 'Wagyu Beef',      10, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Ribeye',       'contains', 'main_protein', 'Beef',             5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Rib Eye',      'contains', 'main_protein', 'Beef',             5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Sirloin',      'contains', 'main_protein', 'Beef',             5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Tenderloin',   'contains', 'main_protein', 'Beef',             5, true, 'Beef tenderloin', NOW(), NOW()),
  (gen_random_uuid()::text, 'Steak',        'contains', 'main_protein', 'Beef',             0, true, 'Any steak dish', NOW(), NOW()),
  (gen_random_uuid()::text, 'Crying Tiger', 'contains', 'main_protein', 'Beef',             5, true, 'Signature dish', NOW(), NOW()),
  (gen_random_uuid()::text, 'Beef',         'contains', 'main_protein', 'Beef',             0, true, NULL, NOW(), NOW()),
  -- Pork
  (gen_random_uuid()::text, 'Pork Belly',   'contains', 'main_protein', 'Pork',             5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Crispy Pork',  'contains', 'main_protein', 'Pork',             5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Pork Chop',    'contains', 'main_protein', 'Pork',             5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Pork',         'contains', 'main_protein', 'Pork',             0, true, NULL, NOW(), NOW()),
  -- Chicken
  (gen_random_uuid()::text, 'Chicken',      'contains', 'main_protein', 'Chicken',          0, true, NULL, NOW(), NOW()),
  -- Duck
  (gen_random_uuid()::text, 'Duck',         'contains', 'main_protein', 'Duck',             0, true, NULL, NOW(), NOW()),
  -- Lamb
  (gen_random_uuid()::text, 'Lamb',         'contains', 'main_protein', 'Lamb',             0, true, NULL, NOW(), NOW()),
  -- Seafood
  (gen_random_uuid()::text, 'Soft Shell',   'contains', 'main_protein', 'Soft Shell Crab',  5, true, 'Crispy Soft Shell etc.', NOW(), NOW()),
  (gen_random_uuid()::text, 'Soft-Shell',   'contains', 'main_protein', 'Soft Shell Crab',  5, true, 'Hyphenated variant', NOW(), NOW()),
  (gen_random_uuid()::text, 'Mud Crab',     'contains', 'main_protein', 'Mud Crab',         5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Crab',         'contains', 'main_protein', 'Crab',             0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Lobster',      'contains', 'main_protein', 'Lobster',          5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Tiger Prawn',  'contains', 'main_protein', 'Prawn',            5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'King Prawn',   'contains', 'main_protein', 'Prawn',            5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Prawn',        'contains', 'main_protein', 'Prawn',            0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Shrimp',       'contains', 'main_protein', 'Shrimp',           0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Scallop',      'contains', 'main_protein', 'Scallop',          0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Squid',        'contains', 'main_protein', 'Squid',            0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Calamari',     'contains', 'main_protein', 'Squid',            5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Octopus',      'contains', 'main_protein', 'Octopus',          0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Seabass',      'contains', 'main_protein', 'Sea Bass',         5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Sea Bass',     'contains', 'main_protein', 'Sea Bass',         5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Barramundi',   'contains', 'main_protein', 'Barramundi',       5, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Salmon',       'contains', 'main_protein', 'Salmon',           0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Tuna',         'contains', 'main_protein', 'Tuna',             0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Snapper',      'contains', 'main_protein', 'Snapper',          0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Mackerel',     'contains', 'main_protein', 'Mackerel',         0, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'Fish',         'contains', 'main_protein', 'Fish',             0, true, 'Generic fish catch-all (low priority)', NOW(), NOW());
