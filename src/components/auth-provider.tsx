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

interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    permittedSlugs: NavSlug[];
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    loading: true,
    permittedSlugs: [],
    logout: async () => {},
    refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                setUser(await res.json());
            } else {
                setUser(null);
            }
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const logout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
        window.location.href = "/login";
    };

    const permittedSlugs = user
        ? getPermittedSlugs(user.role, user.permissions)
        : [];

    return (
        <AuthContext.Provider value={{ user, loading, permittedSlugs, logout, refresh }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
