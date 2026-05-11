"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Suspense } from "react";
import { useAuth } from "@/components/auth-provider";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { refresh } = useAuth();
    const from = searchParams.get("from") ?? "/dashboard";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

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
            await refresh();
            router.replace(from);
        } catch {
            setError("Connection error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex" style={{ backgroundColor: "#37083a" }}>

            {/* ── Left Panel — Brand ── */}
            <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
                style={{ background: "linear-gradient(145deg, #37083a 0%, #4d1152 50%, #5c2600 100%)" }}>

                {/* Decorative circles */}
                <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10"
                    style={{ background: "radial-gradient(circle, #ed9f26 0%, transparent 70%)" }} />
                <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full opacity-10"
                    style={{ background: "radial-gradient(circle, #fdf5e9 0%, transparent 70%)" }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-5"
                    style={{ background: "radial-gradient(circle, #ed9f26 0%, transparent 60%)" }} />

                {/* Logo */}
                <div className="flex items-center gap-3 relative z-10">
                    <img src="/logo.svg" alt="Chiang Mai" width={36} height={42}
                        className="opacity-90" />
                    <div>
                        <p className="font-playfair text-xl font-bold leading-none" style={{ color: "#fdf5e9" }}>
                            Chiang Mai
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.2em] mt-0.5" style={{ color: "rgba(253,245,233,0.5)" }}>
                            Restaurant Group
                        </p>
                    </div>
                </div>

                {/* Hero Text */}
                <div className="relative z-10 space-y-6">
                    {/* Decorative line */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-px" style={{ background: "#ed9f26" }} />
                        <p className="text-xs uppercase tracking-widest font-medium" style={{ color: "#ed9f26" }}>
                            Back of House
                        </p>
                    </div>

                    <h2 className="font-playfair text-4xl font-bold leading-tight" style={{ color: "#fdf5e9" }}>
                        Manage with<br />
                        <span style={{ color: "#ed9f26" }}>precision.</span>
                    </h2>

                    <p className="text-base leading-relaxed max-w-xs" style={{ color: "rgba(253,245,233,0.65)" }}>
                        Recipe costing, food cost tracking, production planning — everything your kitchen team needs in one place.
                    </p>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-4 pt-4">
                        {[
                            { value: "Food Cost", label: "Tracking" },
                            { value: "Real-time", label: "Calculations" },
                            { value: "Multi-user", label: "Access" },
                        ].map((s, i) => (
                            <div key={i} className="space-y-0.5">
                                <p className="text-sm font-semibold" style={{ color: "#ed9f26" }}>{s.value}</p>
                                <p className="text-xs" style={{ color: "rgba(253,245,233,0.5)" }}>{s.label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom quote */}
                <div className="relative z-10">
                    <p className="text-xs italic" style={{ color: "rgba(253,245,233,0.4)" }}>
                        "Authentic Thai flavors, professionally managed."
                    </p>
                </div>
            </div>

            {/* ── Right Panel — Form ── */}
            <div className="flex-1 flex flex-col justify-center items-center px-6 py-12"
                style={{ backgroundColor: "#fffaf5" }}>

                {/* Mobile logo */}
                <div className="lg:hidden flex items-center gap-3 mb-10">
                    <img src="/logo.svg" alt="Chiang Mai" width={32} height={38} />
                    <p className="font-playfair text-xl font-bold" style={{ color: "#37083a" }}>
                        Chiang Mai
                    </p>
                </div>

                <div className="w-full max-w-sm">
                    {/* Heading */}
                    <div className="mb-8">
                        <h1 className="font-playfair text-3xl font-bold" style={{ color: "#37083a" }}>
                            Welcome back
                        </h1>
                        <p className="text-sm mt-1.5" style={{ color: "#7a5c3a" }}>
                            Sign in to your BOH account
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-sm font-medium" style={{ color: "#37083a" }}>
                                Email address
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@chiangmai.ca"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                disabled={loading}
                                className="h-11 bg-white"
                                style={{ borderColor: "#e8d5b5" }}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="password" className="text-sm font-medium" style={{ color: "#37083a" }}>
                                Password
                            </Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    disabled={loading}
                                    className="h-11 pr-10 bg-white"
                                    style={{ borderColor: "#e8d5b5" }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                                    style={{ color: "#7a5c3a" }}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-2.5 border"
                                style={{ color: "#c0392b", background: "rgba(192,57,43,0.06)", borderColor: "rgba(192,57,43,0.2)" }}>
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-60"
                            style={{
                                background: loading ? "#4d1152" : "#37083a",
                                color: "#fdf5e9",
                            }}
                        >
                            {loading ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
                            ) : "Sign In"}
                        </button>
                    </form>

                    {/* Gold divider */}
                    <div className="flex items-center gap-3 my-8">
                        <div className="flex-1 h-px" style={{ background: "#e8d5b5" }} />
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#ed9f26" }} />
                        <div className="flex-1 h-px" style={{ background: "#e8d5b5" }} />
                    </div>

                    <p className="text-center text-xs" style={{ color: "rgba(122,92,58,0.6)" }}>
                        © 2026 Chiang Mai Restaurant Group · Secure access only
                    </p>
                </div>
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
