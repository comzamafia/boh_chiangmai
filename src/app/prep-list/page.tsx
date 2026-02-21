"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Printer, CheckCircle2, ArrowLeft, Thermometer, Flame, Droplets, UtensilsCrossed } from "lucide-react";

export default function PrepListPage() {
    const [prepStatus, setPrepStatus] = useState<Record<string, boolean>>({
        "s1-1": true, "s1-2": false, "s1-3": false,
        "s2-1": true, "s2-2": true, "s2-3": false,
        "s3-1": false, "s3-2": false,
    });

    const generateToggle = (id: string) => () => {
        setPrepStatus(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const stations = [
        {
            id: "prep",
            name: "Prep Station",
            icon: UtensilsCrossed,
            color: "bg-orange-500",
            items: [
                { id: "s1-1", name: "Wash Bean Sprouts", qty: "8 kg", time: "08:00 AM" },
                { id: "s1-2", name: "Cut Tofu into cubes", qty: "5 kg", time: "08:30 AM" },
                { id: "s1-3", name: "Peel & devein shrimp", qty: "10 kg", time: "09:00 AM" },
            ]
        },
        {
            id: "sauce",
            name: "Sauce Station",
            icon: Droplets,
            color: "bg-blue-500",
            items: [
                { id: "s2-1", name: "Tamarind Paste prep", qty: "5 L", time: "08:00 AM" },
                { id: "s2-2", name: "Palm Sugar melting", qty: "5 kg", time: "08:30 AM" },
                { id: "s2-3", name: "Pad Thai Sauce Mix & Simmer", qty: "20 L", time: "09:30 AM" },
            ]
        },
        {
            id: "hot",
            name: "Hot Station",
            icon: Flame,
            color: "bg-red-500",
            items: [
                { id: "s3-1", name: "Roast Peanuts", qty: "3 kg", time: "10:00 AM" },
                { id: "s3-2", name: "Fry Shallots", qty: "2 kg", time: "10:30 AM" },
            ]
        },
        {
            id: "cold",
            name: "Cold Station",
            icon: Thermometer,
            color: "bg-cyan-500",
            items: []
        }
    ];

    const totalItems = Object.keys(prepStatus).length;
    const completedItems = Object.values(prepStatus).filter(Boolean).length;
    const progressPercent = Math.round((completedItems / totalItems) * 100) || 0;

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Link href="/batch-planning">
                            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">In Progress</Badge>
                        <span className="text-sm font-medium text-muted-foreground">BP-2023-01 / Today</span>
                    </div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Master Prep List</h2>
                    <p className="text-muted-foreground">Station-by-station preparation checklist.</p>
                </div>
                <Button variant="outline" className="bg-background" onClick={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4" /> Print All
                </Button>
            </div>

            <Card className="border-primary/20 shadow-md">
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-6 items-center">
                        <div className="flex-1 w-full">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="font-semibold">Overall Progress</span>
                                <span className="font-bold text-primary">{progressPercent}%</span>
                            </div>
                            <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                {completedItems} of {totalItems} tasks completed
                            </p>
                        </div>

                        {progressPercent === 100 && (
                            <Button className="bg-green-600 hover:bg-green-700 w-full md:w-auto mt-4 md:mt-0">
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Finalize Batch
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                {stations.map((station) => {
                    const stationItems = station.items;
                    const stationCompleted = stationItems.filter(i => prepStatus[i.id]).length;
                    const stationProgress = stationItems.length > 0 ? (stationCompleted / stationItems.length) * 100 : 0;

                    return (
                        <Card key={station.id} className="h-full border-border/60 hover:border-border transition-colors">
                            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-accent/30 border-b">
                                <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-md ${station.color} text-white`}>
                                        <station.icon className="h-4 w-4" />
                                    </div>
                                    <CardTitle className="text-lg">{station.name}</CardTitle>
                                </div>
                                <Button variant="ghost" size="sm" className="h-8">
                                    <Printer className="h-4 w-4 mr-2" /> Print
                                </Button>
                            </CardHeader>
                            <CardContent className="pt-4">
                                {stationItems.length > 0 ? (
                                    <>
                                        <div className="flex justify-between text-xs mb-2">
                                            <span className="text-muted-foreground">{stationCompleted} / {stationItems.length} tasks</span>
                                            <span className="font-medium text-foreground">{Math.round(stationProgress)}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-6">
                                            <div
                                                className={`h-full ${station.color}`}
                                                style={{ width: `${stationProgress}%` }}
                                            />
                                        </div>

                                        <ul className="space-y-3">
                                            {stationItems.map(item => (
                                                <li key={item.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/50 -mx-2 transition-colors cursor-pointer" onClick={generateToggle(item.id)}>
                                                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${prepStatus[item.id] ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground text-transparent"
                                                        }`}>
                                                        <CheckCircle2 className="w-3 h-3" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className={`text-sm font-medium ${prepStatus[item.id] ? "line-through text-muted-foreground" : ""}`}>
                                                            {item.name}
                                                        </p>
                                                        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                                                            <span>Qty: <strong className="font-semibold text-foreground">{item.qty}</strong></span>
                                                            <span>Target: {item.time}</span>
                                                        </div>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                ) : (
                                    <div className="h-32 flex flex-col items-center justify-center text-muted-foreground text-sm opacity-60 border-2 border-dashed rounded-md m-2">
                                        <station.icon className="h-8 w-8 mb-2 opacity-50" />
                                        <p>No tasks assigned</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
