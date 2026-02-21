"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ChefHat, Loader2, AlertCircle } from "lucide-react";
import { Suspense } from "react";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const from = searchParams.get("from") ?? "/dashboard";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Redirect if already logged in
    useEffect(() => {
        fetch("/api/auth/me").then(res => {
            if (res.ok) router.replace(from);
        }).catch(() => {});
    }, [from, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) { setError("Please enter email and password."); return; }
        setError("");
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? "Login failed."); return; }
            router.replace(from);
        } catch {
            setError("Connection error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
            {/* Decorative background */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,rgba(184,134,11,0.08),transparent_60%)]" />
                <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,rgba(184,134,11,0.06),transparent_60%)]" />
                <div className="absolute inset-0 opacity-[0.02] bg-[repeating-linear-gradient(45deg,currentColor_0,currentColor_1px,transparent_0,transparent_50%)] bg-[length:20px_20px]" />
            </div>

            <div className="w-full max-w-md mx-auto px-6">
                {/* Logo */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4 shadow-sm">
                        <ChefHat className="h-8 w-8 text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold font-playfair text-primary tracking-tight">Padthai Chaiyo</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Back-of-House Management</p>
                </div>

                {/* Card */}
                <div className="bg-card border border-border rounded-2xl shadow-lg p-8">
                    <h2 className="text-xl font-semibold mb-6 text-foreground">Sign in to continue</h2>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@padthaichaiyo.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                disabled={loading}
                                className="h-11"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    disabled={loading}
                                    className="h-11 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        <Button type="submit" disabled={loading} className="w-full h-11 text-base">
                            {loading ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</>
                            ) : "Sign In"}
                        </Button>
                    </form>
                </div>

                <p className="text-center text-xs text-muted-foreground mt-6">
                    © 2026 Padthai Chaiyo BOH · Secure access only
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
