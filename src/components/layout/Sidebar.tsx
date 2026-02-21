"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home, BarChart2, Utensils, ChefHat, ShoppingCart,
    Wrench, Users, Package, FileText, TrendingUp,
    Calculator, Scale, PieChart, Calendar, ClipboardList,
    Sun, Moon, LogOut, ShieldCheck, Loader2, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/components/currency-context";
import { CURRENCIES, CurrencyCode } from "@/lib/currency";
import { useAuth } from "@/components/auth-provider";
import { ROLE_LABELS } from "@/lib/permissions";
import type { NavSlug } from "@/lib/permissions";

interface NavItem {
    name: string;
    href: string;
    icon: React.ElementType;
    slug: NavSlug;
}

const navItems: NavItem[] = [
    { name: "Home", href: "/", icon: Home, slug: "home" },
    { name: "Dashboard", href: "/dashboard", icon: BarChart2, slug: "dashboard" },
    { name: "Recipes", href: "/recipes", icon: Utensils, slug: "recipes" },
    { name: "New Recipe", href: "/recipes/new", icon: ChefHat, slug: "recipes-new" },
    { name: "Ingredients", href: "/ingredients", icon: ShoppingCart, slug: "ingredients" },
    { name: "Equipment", href: "/equipment", icon: Wrench, slug: "equipment" },
    { name: "Suppliers", href: "/suppliers", icon: Users, slug: "suppliers" },
    { name: "Inventory", href: "/inventory", icon: Package, slug: "inventory" },
    { name: "Purchases", href: "/purchase-history", icon: FileText, slug: "purchases" },
    { name: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList, slug: "purchase-orders" },
    { name: "Analysis", href: "/analysis", icon: TrendingUp, slug: "analysis" },
    { name: "Batch Calc", href: "/batch-calculation", icon: Calculator, slug: "batch-calculation" },
    { name: "Batch Scaling", href: "/batch-scaling", icon: Scale, slug: "batch-scaling" },
    { name: "Sales Sim", href: "/sales-simulation", icon: PieChart, slug: "sales-simulation" },
    { name: "Production", href: "/production-planning", icon: Calendar, slug: "production" },
    { name: "Users", href: "/admin/users", icon: ShieldCheck, slug: "admin" },
];

const CURRENCY_OPTIONS: CurrencyCode[] = ["CAD", "USD", "THB"];

export function Sidebar({ onClose }: { onClose?: () => void }) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const { currency, setCurrency } = useCurrency();
    const { user, loading, permittedSlugs, logout } = useAuth();

    const visibleItems = navItems.filter(item => permittedSlugs.includes(item.slug));

    return (
        <div className="flex h-screen w-64 flex-col border-r border-border bg-card text-card-foreground">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
                <h1 className="font-playfair text-xl font-bold text-primary">Padthai Chaiyo</h1>
                {/* Close button — visible only on mobile */}
                <button
                    onClick={onClose}
                    className="md:hidden p-1 rounded-md hover:bg-accent text-muted-foreground"
                    aria-label="Close menu"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
            <div className="flex-1 overflow-auto py-4">
                <nav className="space-y-1 px-2">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        visibleItems.map((item) => {
                            const isActive = pathname === item.href ||
                                (item.href !== "/" && pathname.startsWith(item.href));
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClose}
                                    className={cn(
                                        "group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-colors",
                                        "hover:bg-accent hover:text-accent-foreground",
                                        isActive ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground"
                                    )}
                                >
                                    <item.icon
                                        className={cn(
                                            "mr-3 h-5 w-5 flex-shrink-0",
                                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-accent-foreground"
                                        )}
                                    />
                                    {item.name}
                                </Link>
                            );
                        })
                    )}
                </nav>
            </div>
            <div className="border-t border-border p-4 space-y-3">
                {/* Currency Switcher */}
                <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Currency</span>
                    <div className="flex gap-1">
                        {CURRENCY_OPTIONS.map((code) => {
                            const cfg = CURRENCIES[code];
                            const isActive = currency === code;
                            return (
                                <button
                                    key={code}
                                    onClick={() => setCurrency(code)}
                                    className={cn(
                                        "flex-1 rounded-md py-1 text-xs font-semibold transition-all border",
                                        isActive
                                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                            : "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                                    )}
                                >
                                    {cfg.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                {/* Theme toggle */}
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Theme</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                        <span className="sr-only">Toggle theme</span>
                    </Button>
                </div>
                {/* User info + Logout */}
                {user && (
                    <div className="pt-2 border-t border-border">
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{user.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={logout}
                                title="Sign out"
                            >
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
