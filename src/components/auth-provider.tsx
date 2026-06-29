"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getPermittedSlugs, type NavSlug } from "@/lib/permissions";

interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: string;
    permissions: string[];
}

interface BranchInfo {
    id: string;
    name: string;
    slug: string;
    isDefault?: boolean;
}

interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    permittedSlugs: NavSlug[];
    activeBranch: BranchInfo | null;
    availableBranches: BranchInfo[];
    switchBranch: (branchId: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    loading: true,
    permittedSlugs: [],
    activeBranch: null,
    availableBranches: [],
    switchBranch: async () => {},
    logout: async () => {},
    refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeBranch, setActiveBranch] = useState<BranchInfo | null>(null);
    const [availableBranches, setAvailableBranches] = useState<BranchInfo[]>([]);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const data = await res.json();
                setUser({
                    id: data.id,
                    name: data.name,
                    email: data.email,
                    role: data.role,
                    permissions: data.permissions,
                });
                setActiveBranch(data.activeBranch ?? null);
                setAvailableBranches(data.branches ?? []);
            } else {
                setUser(null);
                setActiveBranch(null);
                setAvailableBranches([]);
            }
        } catch {
            setUser(null);
            setActiveBranch(null);
            setAvailableBranches([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const switchBranch = async (branchId: string) => {
        const res = await fetch("/api/branch/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ branchId }),
        });
        if (res.ok) {
            const branch = await res.json();
            setActiveBranch(branch);
            window.location.reload();
        }
    };

    const logout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
        setActiveBranch(null);
        setAvailableBranches([]);
        window.location.href = "/login";
    };

    const permittedSlugs = user
        ? getPermittedSlugs(user.role, user.permissions)
        : [];

    return (
        <AuthContext.Provider value={{
            user, loading, permittedSlugs,
            activeBranch, availableBranches, switchBranch,
            logout, refresh,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
