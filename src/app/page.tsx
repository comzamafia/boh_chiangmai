import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  BarChart2, ChefHat, Package, FileText,
  TrendingUp, Calendar
} from "lucide-react";

export default function Home() {
  const features = [
    { title: "Smart Recipe Management", desc: "Build & scale recipes with real-time cost calculation.", icon: ChefHat },
    { title: "Inventory Tracking", desc: "Know exactly what you have and what you need.", icon: Package },
    { title: "Cost & Profit Analysis", desc: "Detailed breakdown of ingredients, labor, and energy.", icon: TrendingUp },
    { title: "Production Planning", desc: "Calendar & batch planning for efficient kitchen prep.", icon: Calendar },
    { title: "Purchase History", desc: "Track raw material price fluctuations over time.", icon: FileText },
    { title: "Interactive Dashboards", desc: "Visualize your kitchen operations at a glance.", icon: BarChart2 },
  ];

  return (
    <div className="flex flex-col items-center justify-center space-y-16 py-12">
      <section className="text-center space-y-6 max-w-3xl">
        <h1 className="text-5xl font-playfair font-bold tracking-tight text-primary">
          Welcome to Padthai Chaiyo
        </h1>
        <p className="text-xl text-muted-foreground">
          The ultimate back-of-house operating system designed to streamline your kitchen, control costs, and maximize profits.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Link href="/dashboard">
            <Button size="lg" className="font-semibold px-8">
              Get Started
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
        {features.map((f, i) => (
          <div key={i} className="flex flex-col items-center text-center p-6 bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
            <div className="p-4 bg-primary/10 rounded-full mb-4">
              <f.icon className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-2">{f.title}</h3>
            <p className="text-muted-foreground text-sm">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
