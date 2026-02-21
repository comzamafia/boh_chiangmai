import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import {
    BarChart2, Utensils, ChefHat,
    ShoppingCart, Users, TrendingUp
} from "lucide-react";
import { DashboardCurrencyStat } from "@/components/dashboard-currency-stat";

export default async function Dashboard() {
    const [suppliers, ingredients, recipes] = await Promise.all([
        prisma.supplier.findMany(),
        prisma.ingredient.findMany(),
        prisma.recipe.findMany({ include: { ingredients: { include: { ingredient: true } } } }),
    ]);

    const activeSuppliers = suppliers.filter(s => s.status === "Active").length;
    const retailRecipes = recipes.filter(r => !r.isMainSauce);
    const avgCost = retailRecipes.length
        ? retailRecipes.reduce((sum, r) => {
            const ingCost = r.ingredients.reduce((s, ri) => {
                const costPerUnit = Number(ri.ingredient.purchasePrice) / Number(ri.ingredient.conversionRate) / (Number(ri.ingredient.yieldPercent) / 100);
                return s + costPerUnit * Number(ri.quantity);
            }, 0);
            const labor = Number(r.laborCostPerHour) * ((r.prepTime + r.cookTime) / 60);
            const energy = Number(r.energyCostPerBatch);
            return sum + (ingCost + labor + energy) / Number(r.yieldAmount);
        }, 0) / retailRecipes.length
        : 0;

    const stats = [
        { title: "Total Recipes", value: recipes.length, description: "Active system recipes" },
        { title: "Active Suppliers", value: activeSuppliers, description: "Approved vendors" },
        { title: "Total Ingredients", value: ingredients.length, description: "Tracked inventory items" },
    ];

    const quickAccess = [
        { title: "Dashboard Overview", href: "/dashboard", icon: BarChart2, description: "View key metrics and performance" },
        { title: "Recipe Management", href: "/recipes", icon: Utensils, description: "Browse and manage your recipes" },
        { title: "Create New Recipe", href: "/recipes/new", icon: ChefHat, description: "Build a new recipe with real-time costs" },
        { title: "Ingredients Database", href: "/ingredients", icon: ShoppingCart, description: "Manage raw materials and unit conversions" },
        { title: "Supplier Directory", href: "/suppliers", icon: Users, description: "Manage vendor contacts and details" },
        { title: "Cost Analysis", href: "/analysis", icon: TrendingUp, description: "Interactive charts and profit margins" },
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Dashboard</h2>
                <p className="text-muted-foreground mt-2">Welcome back to Padthai Chaiyo BOH System.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat, i) => (
                    <Card key={i} className="border-border hover:border-primary/50 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {stat.title}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-primary">{stat.value}</div>
                            <p className="text-xs text-muted-foreground">
                                {stat.description}
                            </p>
                        </CardContent>
                    </Card>
                ))}
                {/* Avg Recipe Cost — formatted in user's selected currency */}
                <Card className="border-border hover:border-primary/50 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Recipe Cost</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">
                            <DashboardCurrencyStat amountTHB={avgCost} decimals={2} />
                        </div>
                        <p className="text-xs text-muted-foreground">Per serving (calculated)</p>
                    </CardContent>
                </Card>
            </div>

            <div>
                <h3 className="text-xl font-bold font-playfair mb-4 text-primary">Quick Access</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {quickAccess.map((item, i) => (
                        <Link key={i} href={item.href}>
                            <Card className="h-full hover:bg-accent hover:border-primary/50 transition-all cursor-pointer group">
                                <CardHeader>
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                            <item.icon className="h-6 w-6 text-primary group-hover:text-primary-foreground" />
                                        </div>
                                        <CardTitle className="text-lg">{item.title}</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription>{item.description}</CardDescription>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
