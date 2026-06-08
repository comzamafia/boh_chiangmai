/**
 * RBAC permission definitions.
 * Each nav item has a `slug` that maps to a route.
 * Roles have default slugs; users can override with custom `permissions[]`.
 */

export type Role = "admin" | "manager" | "chef" | "analyst" | "staff";

export const ALL_SLUGS = [
    "home",
    "dashboard",
    "daily-sales",
    "recipes",
    "recipes-new",
    "import-recipes",
    "menu-items",
    "ingredients",
    "import-ingredients",
    "equipment",
    "suppliers",
    "import-suppliers",
    "inventory",
    "purchases",
    "purchase-orders",
    "analysis",
    "production",
    "admin",
    "admin-audit",
    "recipes-manage-categories",
    "settings-storage-areas",
    "settings-ingredient-categories",
    "settings-portion-standards",
    "pmix-dashboard",
    "admin-notifications",
    "settings-pmix-rules",
    "reports",
    "reports-download",
    "usage-report",
    "prep-list",
    "station-prep",
    "stock-count",
    "loss-management",
] as const;

export type NavSlug = (typeof ALL_SLUGS)[number];

export const ROLE_DEFAULTS: Record<Role, NavSlug[]> = {
    admin: [...ALL_SLUGS],
    manager: [
        "home", "dashboard", "daily-sales", "recipes", "recipes-new", "import-recipes", "menu-items",
        "ingredients", "import-ingredients", "suppliers", "import-suppliers", "inventory",
        "purchases", "purchase-orders", "analysis", "production", "admin-audit",
        "recipes-manage-categories", "settings-portion-standards", "pmix-dashboard",
        "admin-notifications", "settings-pmix-rules", "reports", "reports-download", "usage-report", "prep-list", "station-prep", "stock-count",
    ],
    chef: [
        "home", "dashboard", "daily-sales", "recipes", "recipes-new", "import-recipes", "menu-items",
        "ingredients", "import-ingredients", "equipment", "inventory", "production", "prep-list", "station-prep", "stock-count",
    ],
    analyst: [
        "home", "dashboard", "daily-sales", "analysis", "pmix-dashboard", "reports", "reports-download", "usage-report",
    ],
    staff: [
        "home", "dashboard", "daily-sales", "recipes", "production", "prep-list", "stock-count",
    ],
};

/** Returns the effective permitted slugs for a user.
 *  Admin role always gets full access regardless of custom permissions.
 */
export function getPermittedSlugs(role: string, customPermissions: string[]): NavSlug[] {
    if (role === "admin") return [...ALL_SLUGS];
    if (customPermissions.length > 0) {
        return customPermissions.filter((s): s is NavSlug =>
            ALL_SLUGS.includes(s as NavSlug)
        );
    }
    return ROLE_DEFAULTS[role as Role] ?? ROLE_DEFAULTS.staff;
}

/** Slug → path prefix mapping (used in middleware) */
export const SLUG_TO_PATH: Record<NavSlug, string> = {
    home: "/",
    dashboard: "/dashboard",
    "daily-sales": "/daily-sales",
    "recipes": "/recipes",
    "recipes-new": "/recipes/new",
    "import-recipes": "/import-recipes",
    "menu-items": "/menu-items",
    ingredients: "/ingredients",
    "import-ingredients": "/import-ingredients",
    equipment: "/equipment",
    suppliers: "/suppliers",
    "import-suppliers": "/import-suppliers",
    inventory: "/inventory",
    purchases: "/purchase-history",
    "purchase-orders": "/purchase-orders",
    analysis: "/analysis",
    production: "/production-planning",
    admin: "/admin",
    "admin-audit": "/admin/audit-log",
    "recipes-manage-categories": "/recipes",   // same page — controls in-page UI only
    "settings-storage-areas": "/settings/storage-areas",
    "settings-ingredient-categories": "/settings/categories",
    "settings-portion-standards":     "/settings/portion-standards",
    "pmix-dashboard": "/analysis/pmix",
    "admin-notifications": "/admin/notifications",
    "settings-pmix-rules": "/settings/pmix-rules",
    "reports": "/reports",
    "reports-download": "/reports",   // capability (download), same page as "reports"
    "usage-report": "/usage-report",
    "prep-list": "/prep-list",
    "station-prep": "/station-prep",
    "stock-count": "/stock-count",
    "loss-management": "/loss-management",
};

export const ROLE_LABELS: Record<Role, string> = {
    admin: "Administrator",
    manager: "Manager",
    chef: "Chef / Kitchen Lead",
    analyst: "Cost Analyst",
    staff: "Staff",
};
