/**
 * RBAC permission definitions.
 * Each nav item has a `slug` that maps to a route.
 * Roles have default slugs; users can override with custom `permissions[]`.
 */

export type Role = "admin" | "manager" | "chef" | "analyst" | "staff";

export const ALL_SLUGS = [
    "home",
    "dashboard",
    "recipes",
    "recipes-new",
    "import-recipes",
    "ingredients",
    "import-ingredients",
    "equipment",
    "suppliers",
    "inventory",
    "purchases",
    "purchase-orders",
    "analysis",
    "batch-calculation",
    "batch-scaling",
    "sales-simulation",
    "production",
    "admin",
] as const;

export type NavSlug = (typeof ALL_SLUGS)[number];

export const ROLE_DEFAULTS: Record<Role, NavSlug[]> = {
    admin: [...ALL_SLUGS],
    manager: [
        "home", "dashboard", "recipes", "recipes-new", "import-recipes", "ingredients", "import-ingredients",
        "suppliers", "inventory", "purchases", "purchase-orders", "analysis", "batch-calculation",
        "batch-scaling", "sales-simulation", "production",
    ],
    chef: [
        "home", "dashboard", "recipes", "recipes-new", "import-recipes",
        "ingredients", "import-ingredients", "equipment", "inventory", "production",
    ],
    analyst: [
        "home", "dashboard", "analysis", "batch-calculation",
        "batch-scaling", "sales-simulation",
    ],
    staff: [
        "home", "dashboard", "recipes", "production",
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
    "recipes": "/recipes",
    "recipes-new": "/recipes/new",
    "import-recipes": "/import-recipes",
    ingredients: "/ingredients",
    "import-ingredients": "/import-ingredients",
    equipment: "/equipment",
    suppliers: "/suppliers",
    inventory: "/inventory",
    purchases: "/purchase-history",
    "purchase-orders": "/purchase-orders",
    analysis: "/analysis",
    "batch-calculation": "/batch-calculation",
    "batch-scaling": "/batch-scaling",
    "sales-simulation": "/sales-simulation",
    production: "/production-planning",
    admin: "/admin",
};

export const ROLE_LABELS: Record<Role, string> = {
    admin: "Administrator",
    manager: "Manager",
    chef: "Chef / Kitchen Lead",
    analyst: "Cost Analyst",
    staff: "Staff",
};
