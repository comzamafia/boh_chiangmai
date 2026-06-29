"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home, BarChart2, Utensils, ChefHat, ShoppingCart,
    Wrench, Users, Package, FileText,
    PieChart, Calendar, ClipboardList, ClipboardCheck, Gauge,
    Sun, Moon, LogOut, ShieldCheck, Loader2, X, ShoppingBag, BookOpen, ScrollText, Warehouse, Tag, UtensilsCrossed, Bell, Carrot, ShieldAlert, Trophy,
    PanelLeftClose, PanelLeft, Building2, ChevronDown,
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
    { name: "Stock Count",    href: "/stock-count",        icon: ClipboardCheck, slug: "stock-count",     group: "ops" },
    { name: "Suppliers",      href: "/suppliers",          icon: Users,         slug: "suppliers",        group: "ops" },
    { name: "Purchases",      href: "/purchase-history",   icon: FileText,      slug: "purchases",        group: "ops" },
    { name: "Purchase Orders",href: "/purchase-orders",    icon: ClipboardList, slug: "purchase-orders",  group: "ops" },
    { name: "Production",     href: "/production-planning",icon: Calendar,      slug: "production",       group: "ops" },
    { name: "Prep List",      href: "/prep-list",          icon: ClipboardList, slug: "prep-list",        group: "ops" },
    { name: "Station Prep",   href: "/station-prep",       icon: Carrot,        slug: "station-prep",     group: "ops" },
    { name: "PMIX Analytics", href: "/analysis/pmix",          icon: PieChart,  slug: "pmix-dashboard",   group: "insights" },
    { name: "PMIX Dashboard", href: "/analysis/pmix/dashboard", icon: BarChart2, slug: "pmix-dashboard",   group: "insights" },
    { name: "Reports",        href: "/reports",            icon: FileText,      slug: "reports",          group: "insights" },
    { name: "Usage Report",   href: "/usage-report",       icon: Gauge,         slug: "usage-report",     group: "insights" },
    { name: "Loss Management",href: "/loss-management",    icon: ShieldAlert,   slug: "loss-management",          group: "admin" },
    { name: "Server Performance",href: "/server-performance", icon: Trophy,     slug: "server-performance",       group: "admin" },
    { name: "Users",          href: "/admin/users",        icon: ShieldCheck,   slug: "admin",                    group: "admin" },
    { name: "Audit Log",      href: "/admin/audit-log",    icon: ScrollText,    slug: "admin-audit",              group: "admin" },
    { name: "Notifications",  href: "/admin/notifications",icon: Bell,          slug: "admin-notifications",      group: "admin" },
    { name: "Storage Areas",  href: "/settings/storage-areas",  icon: Warehouse, slug: "settings-storage-areas",          group: "admin" },
    { name: "Ing. Categories",href: "/settings/categories",     icon: Tag,            slug: "settings-ingredient-categories",  group: "admin" },
    { name: "Portion Stds",   href: "/settings/portion-standards", icon: UtensilsCrossed, slug: "settings-portion-standards",      group: "admin" },
];

const GROUP_LABELS: Record<string, string> = {
    main: "Overview",
    kitchen: "Kitchen",
    ops: "Operations",
    insights: "Insights",
    admin: "Admin",
};


export function Sidebar({ onClose, collapsed = false, onToggleCollapse }: {
    onClose?: () => void;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();

    const { user, loading, permittedSlugs, logout, activeBranch, availableBranches, switchBranch } = useAuth();

    const visibleItems = navItems.filter(item => permittedSlugs.includes(item.slug));

    const groupOrder = ["main", "kitchen", "ops", "insights", "admin"];
    const grouped = groupOrder
        .map(g => ({ group: g, items: visibleItems.filter(i => i.group === g) }))
        .filter(g => g.items.length > 0);

    return (
        <div className={cn(
            "flex h-screen flex-col bg-sidebar text-sidebar-foreground transition-all duration-300",
            collapsed ? "w-[60px]" : "w-64",
        )}>
            {/* ── Header ── */}
            <div className={cn("flex h-16 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "justify-between px-5")}>
                {collapsed ? (
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sidebar-primary/20 shrink-0">
                        <img src="/logo.svg" alt="Chiang Mai" width={22} height={26} className="opacity-90" />
                    </div>
                ) : (
                    <>
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
                    </>
                )}
            </div>

            {/* ── Collapse toggle (desktop only) ── */}
            {onToggleCollapse && (
                <div className="hidden md:flex justify-center py-2 border-b border-sidebar-border">
                    <button
                        onClick={onToggleCollapse}
                        className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </button>
                </div>
            )}

            {/* ── Nav ── */}
            <div className={cn("flex-1 overflow-auto py-4 space-y-5", collapsed ? "px-1.5" : "px-3")}>
                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-sidebar-foreground/40" />
                    </div>
                ) : (
                    grouped.map(({ group, items }) => (
                        <div key={group}>
                            {!collapsed && (
                                <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 select-none">
                                    {GROUP_LABELS[group]}
                                </p>
                            )}
                            <nav className="space-y-0.5">
                                {items.map((item) => {
                                    const isActive = pathname === item.href ||
                                        (item.href !== "/" && pathname.startsWith(item.href));
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={onClose}
                                            title={collapsed ? item.name : undefined}
                                            className={cn(
                                                "group flex items-center rounded-lg text-sm font-medium transition-all duration-150",
                                                collapsed ? "justify-center px-0 py-2" : "px-3 py-2",
                                                isActive
                                                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                            )}
                                        >
                                            <span className={cn("flex items-center justify-center", collapsed ? "w-5" : "mr-3 w-5")}>
                                                <item.icon className={cn(
                                                    "h-4 w-4 shrink-0 transition-colors",
                                                    isActive
                                                        ? "text-sidebar-primary"
                                                        : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"
                                                )} />
                                            </span>
                                            {!collapsed && (
                                                <>
                                                    {item.name}
                                                    {isActive && (
                                                        <span className="ml-auto w-1 h-4 rounded-full bg-sidebar-primary" />
                                                    )}
                                                </>
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
            <div className={cn("border-t border-sidebar-border space-y-4", collapsed ? "p-2" : "p-4")}>
                {/* Theme */}
                <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
                    {!collapsed && <span className="text-xs font-medium text-sidebar-foreground/70">Theme</span>}
                    <button
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
                        title="Toggle theme"
                    >
                        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </button>
                </div>

                {/* Branch switcher */}
                {availableBranches.length > 1 && (
                    <div className={cn("pt-3 border-t border-sidebar-border", collapsed ? "flex justify-center" : "")}>
                        {collapsed ? (
                            <div
                                title={activeBranch?.name ?? "Branch"}
                                className="flex items-center justify-center w-8 h-8 rounded-lg bg-sidebar-primary/10 text-sidebar-primary text-xs font-bold"
                            >
                                {activeBranch?.name?.[0] ?? "B"}
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-1">
                                    Branch
                                </span>
                                <div className="relative">
                                    <select
                                        value={activeBranch?.id ?? ""}
                                        onChange={(e) => switchBranch(e.target.value)}
                                        className="w-full appearance-none rounded-lg border border-sidebar-border bg-sidebar px-3 py-1.5 pr-8 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sidebar-primary"
                                    >
                                        {availableBranches.map((b) => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sidebar-foreground/40 pointer-events-none" />
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {availableBranches.length === 1 && activeBranch && !collapsed && (
                    <div className="pt-3 border-t border-sidebar-border flex items-center gap-2 px-1">
                        <Building2 className="h-3.5 w-3.5 text-sidebar-foreground/40 shrink-0" />
                        <span className="text-xs text-sidebar-foreground/50 truncate">{activeBranch.name}</span>
                    </div>
                )}

                {/* User */}
                {user && (
                    <div className={cn("pt-3 border-t border-sidebar-border flex items-center", collapsed ? "justify-center" : "gap-2")}>
                        {!collapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name}</p>
                                <p className="text-[11px] text-sidebar-foreground/50 truncate">
                                    {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}
                                </p>
                            </div>
                        )}
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
