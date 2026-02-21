"use client";

import { useState, useEffect, useCallback } from "react";

export const DEFAULT_CATEGORY = "Pad Thai";

export interface RecipeCategory {
    id: string;
    name: string;
    sortOrder: number;
}

export function useCategories() {
    const [categories, setCategories] = useState<RecipeCategory[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/recipe-categories");
            if (res.ok) setCategories(await res.json());
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const addCategory = useCallback(async (name: string): Promise<{ ok: boolean; error?: string }> => {
        const res = await fetch("/api/recipe-categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        if (!res.ok) {
            const d = await res.json();
            return { ok: false, error: d.error ?? "Failed to create" };
        }
        await refresh();
        return { ok: true };
    }, [refresh]);

    const updateCategory = useCallback(async (id: string, name: string): Promise<{ ok: boolean; error?: string }> => {
        const res = await fetch(`/api/recipe-categories/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        if (!res.ok) {
            const d = await res.json();
            return { ok: false, error: d.error ?? "Failed to update" };
        }
        await refresh();
        return { ok: true };
    }, [refresh]);

    const removeCategory = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
        const res = await fetch(`/api/recipe-categories/${id}`, { method: "DELETE" });
        if (!res.ok) {
            const d = await res.json();
            return { ok: false, error: d.error ?? "Failed to delete" };
        }
        await refresh();
        return { ok: true };
    }, [refresh]);

    return { categories, loading, refresh, addCategory, updateCategory, removeCategory };
}
