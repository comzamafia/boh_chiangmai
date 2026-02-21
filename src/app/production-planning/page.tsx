export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { Calendar, CheckCircle2, ListChecks, CalendarDays, Clock, ArrowRight } from "lucide-react";

export default async function ProductionPlanningOverview() {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const todayStr = now.toLocaleDateString("en-CA");
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");

    const [schedulesThisMonth, activeBatches, allBatches, upcomingSchedules, todayBatches] = await Promise.all([
        prisma.productionSchedule.count({ where: { date: { startsWith: yearMonth } } }),
        prisma.batchPlan.count({ where: { status: "In Progress" } }),
        prisma.batchPlan.findMany({ select: { status: true } }),
        prisma.productionSchedule.count({ where: { date: { gte: todayStr, lte: in7Days }, status: "pending" } }),
        prisma.batchPlan.count({ where: { date: todayStr, status: "Pending" } }),
    ]);

    const completedBatches = allBatches.filter(b => b.status === "Completed").length;
    const prepRate = allBatches.length > 0
        ? Math.round((completedBatches / allBatches.length) * 100)
        : 0;

    const stats = [
        { title: "Schedules This Month", value: String(schedulesThisMonth), desc: "Active & completed", icon: CalendarDays },
        { title: "Active Batches", value: String(activeBatches), desc: "In progress today", icon: Clock },
        { title: "Prep Completion Rate", value: `${prepRate}%`, desc: "Batches completed", icon: CheckCircle2 },
    ];

    const features = [
        {
            title: "Production Calendar",
            desc: "Schedule production runs days or weeks in advance.",
            icon: Calendar,
            href: "/production-calendar",
            action: "Open Calendar",
            stats: upcomingSchedules === 0
                ? "No upcoming schedules in next 7 days"
                : `${upcomingSchedules} upcoming schedule${upcomingSchedules !== 1 ? "s" : ""} in next 7 days`,
        },
        {
            title: "Batch Planning",
            desc: "Group multiple recipes together for efficient daily production.",
            icon: ListChecks,
            href: "/batch-planning",
            action: "Manage Batches",
            stats: todayBatches === 0
                ? "No pending batches for today"
                : `${todayBatches} batch${todayBatches !== 1 ? "es" : ""} pending for today`,
        },
        {
            title: "Prep List",
            desc: "Station-by-station preparation checklists.",
            icon: CheckCircle2,
            href: "/prep-list",
            action: "View Prep List",
            stats: "Track progress across Prep, Sauce, Hot & Cold stations",
        },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-12">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Production Planning</h2>
                    <p className="text-muted-foreground">Manage your kitchen workflow from schedule to prep station.</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/production-calendar">
                        <Button variant="outline">Create Schedule</Button>
                    </Link>
                    <Link href="/batch-planning">
                        <Button>Create Batch Plan</Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((stat, i) => (
                    <Card key={i} className="bg-primary/5 border-primary/20">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                            <stat.icon className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold font-playfair">{stat.value}</div>
                            <p className="text-xs text-muted-foreground mt-1">{stat.desc}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div>
                <h3 className="text-xl font-bold font-playfair mb-4 border-b pb-2">Modules</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {features.map((feature, i) => (
                        <Card key={i} className="flex flex-col h-full hover:border-primary/50 transition-colors">
                            <CardHeader>
                                <div className="p-3 bg-accent rounded-lg w-12 h-12 flex items-center justify-center mb-4">
                                    <feature.icon className="h-6 w-6 text-primary" />
                                </div>
                                <CardTitle>{feature.title}</CardTitle>
                                <CardDescription className="h-10">{feature.desc}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <div className="text-sm p-3 bg-muted rounded-md text-muted-foreground">
                                    {feature.stats}
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Link href={feature.href} className="w-full">
                                    <Button variant={i === 0 ? "default" : "outline"} className="w-full">
                                        {feature.action} <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </div>

            <Card className="border-dashed">
                <CardContent className="p-12 text-center text-muted-foreground">
                    <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <h3 className="text-lg font-medium text-foreground mb-1">Workflow Pipeline</h3>
                    <p className="max-w-md mx-auto">
                        Schedule a production date &rarr; Group items into a batch plan &rarr; Print prep lists for stations.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
