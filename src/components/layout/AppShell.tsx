"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Menu } from "lucide-react";

const COLLAPSED_KEY = "sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    }, []);

    const toggleCollapsed = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    };

    const isLoginPage = pathname === "/login";
    if (isLoginPage) return <>{children}</>;

    return (
        <div className="flex h-screen overflow-hidden" suppressHydrationWarning>
            {/* Mobile backdrop overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar — fixed drawer on mobile, collapsible on desktop */}
            <div className={[
                "fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out",
                "md:relative md:translate-x-0 md:flex md:shrink-0",
                sidebarOpen ? "translate-x-0" : "-translate-x-full",
            ].join(" ")}>
                <Sidebar onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
            </div>

            {/* Main content */}
            <main className="flex flex-col flex-1 overflow-hidden bg-background min-w-0">
                {/* Mobile top bar */}
                <div className="flex items-center h-14 px-4 border-b border-border bg-card shrink-0 md:hidden">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-1.5 mr-3 rounded-md hover:bg-accent text-muted-foreground"
                        aria-label="Open menu"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <img src="/logo.svg" alt="Chiang Mai" width={24} height={28} className="mr-2" />
                    <h1 className="font-playfair text-lg font-bold text-primary">Chiang Mai BOH</h1>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
