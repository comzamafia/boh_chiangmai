"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home, BarChart2, Utensils, ChefHat, ShoppingCart,
    Wrench, Users, Package, FileText, TrendingUp,
    Calculator, Scale, PieChart, Calendar, ClipboardList,
    Sun, Moon, LogOut, ShieldCheck, Loader2, X, ShoppingBag, BookOpen, ScrollText, Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { ROLE_LABELS } from "@/lib/permissions";
import type { NavSlug } from "@/lib/permissions";

interface NavItem {
    name: string;
    href: string;
    icon: React.ElementType;
    slug: NavSlug;
    group?: string;
}

const navItems: NavItem[] = [
    { name: "Home",           href: "/",                  icon: Home,          slug: "home",             group: "main" },
    { name: "Dashboard",      href: "/dashboard",          icon: BarChart2,     slug: "dashboard",        group: "main" },
    { name: "Daily Sales",    href: "/daily-sales",        icon: ShoppingBag,   slug: "daily-sales",      group: "main" },
    { name: "Recipes",        href: "/recipes",            icon: Utensils,      slug: "recipes",          group: "kitchen" },
    { name: "Menu Items",     href: "/menu-items",         icon: BookOpen,      slug: "menu-items",       group: "kitchen" },
    { name: "New Recipe",     href: "/recipes/new",        icon: ChefHat,       slug: "recipes-new",      group: "kitchen" },
    { name: "Ingredients",    href: "/ingredients",        icon: ShoppingCart,  slug: "ingredients",      group: "kitchen" },
    { name: "Equipment",      href: "/equipment",          icon: Wrench,        slug: "equipment",        group: "kitchen" },
    { name: "Inventory",      href: "/inventory",          icon: Package,       slug: "inventory",        group: "ops" },
    { name: "Suppliers",      href: "/suppliers",          icon: Users,         slug: "suppliers",        group: "ops" },
    { name: "Purchases",      href: "/purchase-history",   icon: FileText,      slug: "purchases",        group: "ops" },
    { name: "Purchase Orders",href: "/purchase-orders",    icon: ClipboardList, slug: "purchase-orders",  group: "ops" },
    { name: "Production",     href: "/production-planning",icon: Calendar,      slug: "production",       group: "ops" },
    { name: "Analysis",       href: "/analysis",           icon: TrendingUp,    slug: "analysis",         group: "insights" },
    { name: "PMIX Dashboard", href: "/analysis/pmix",      icon: PieChart,      slug: "pmix-dashboard",   group: "insights" },
    { name: "Batch Calc",     href: "/batch-calculation",  icon: Calculator,    slug: "batch-calculation",group: "insights" },
    { name: "Batch Scaling",  href: "/batch-scaling",      icon: Scale,         slug: "batch-scaling",    group: "insights" },
    { name: "Sales Sim",      href: "/sales-simulation",   icon: PieChart,      slug: "sales-simulation", group: "insights" },
    { name: "Users",          href: "/admin/users",        icon: ShieldCheck,   slug: "admin",                    group: "admin" },
    { name: "Audit Log",      href: "/admin/audit-log",    icon: ScrollText,    slug: "admin-audit",              group: "admin" },
    { name: "Storage Areas",  href: "/settings/storage-areas", icon: Warehouse, slug: "settings-storage-areas",   group: "admin" },
];

const GROUP_LABELS: Record<string, string> = {
    main: "Overview",
    kitchen: "Kitchen",
    ops: "Operations",
    insights: "Insights",
    admin: "Admin",
};


export function Sidebar({ onClose }: { onClose?: () => void }) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();

    const { user, loading, permittedSlugs, logout } = useAuth();

    const visibleItems = navItems.filter(item => permittedSlugs.includes(item.slug));

    // Group items
    const groupOrder = ["main", "kitchen", "ops", "insights", "admin"];
    const grouped = groupOrder
        .map(g => ({ group: g, items: visibleItems.filter(i => i.group === g) }))
        .filter(g => g.items.length > 0);

    return (
        <div className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
            {/* ── Header ── */}
            <div className="flex h-16 items-center justify-between px-5 border-b border-sidebar-border">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sidebar-primary/20 shrink-0">
                        <img src="/logo.svg" alt="Chiang Mai" width={22} height={26} className="opacity-90" />
                    </div>
                    <div className="leading-none">
                        <h1 className="font-playfair text-base font-bold text-sidebar-primary tracking-wide">
                            Chiang Mai
                        </h1>
                        <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest mt-0.5">
                            Back of House
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="md:hidden p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60"
                    aria-label="Close menu"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* ── Nav ── */}
            <div className="flex-1 overflow-auto py-4 px-3 space-y-5">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-sidebar-foreground/40" />
                    </div>
                ) : (
                    grouped.map(({ group, items }) => (
                        <div key={group}>
                            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 select-none">
                                {GROUP_LABELS[group]}
                            </p>
                            <nav className="space-y-0.5">
                                {items.map((item) => {
                                    const isActive = pathname === item.href ||
                                        (item.href !== "/" && pathname.startsWith(item.href));
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={onClose}
                                            className={cn(
                                                "group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                                                isActive
                                                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                            )}
                                        >
                                            {/* Active indicator bar */}
                                            <span className={cn(
                                                "mr-3 flex items-center justify-center w-5",
                                            )}>
                                                <item.icon className={cn(
                                                    "h-4 w-4 shrink-0 transition-colors",
                                                    isActive
                                                        ? "text-sidebar-primary"
                                                        : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"
                                                )} />
                                            </span>
                                            {item.name}
                                            {isActive && (
                                                <span className="ml-auto w-1 h-4 rounded-full bg-sidebar-primary" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>
                    ))
                )}
            </div>

            {/* ── Footer ── */}
            <div className="border-t border-sidebar-border p-4 space-y-4">
                {/* Theme + User */}
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-sidebar-foreground/70">Theme</span>
                    <button
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
                    >
                        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </button>
                </div>

                {/* User */}
                {user && (
                    <div className="pt-3 border-t border-sidebar-border flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name}</p>
                            <p className="text-[11px] text-sidebar-foreground/50 truncate">
                                {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}
                            </p>
                        </div>
                        <button
                            onClick={logout}
                            title="Sign out"
                            className="shrink-0 p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-red-400 transition-colors"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
