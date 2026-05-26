/**
 * Real-time critical-stock alert.
 * Fires immediately when a transaction drops an ingredient below parMin.
 */
import * as React from "react";
import {
    Html, Head, Preview, Body, Container, Section,
    Heading, Text, Hr, Button, Tailwind,
} from "@react-email/components";

export interface CriticalStockAlertProps {
    storageAreaName: string;
    storageAreaId:   string;
    ingredientName:  string;
    ingredientId:    string;
    currentStock:    number;
    parMin:          number;
    recipeUnit:      string;
    leadTimeDays:    number;
    triggeredBy:     string; // e.g. "Out: 1.2 kg used for Pad Thai (15 servings)"
    supplierName?:   string;
    appUrl:          string;
    recipientName?:  string;
}

export function CriticalStockAlert(p: CriticalStockAlertProps) {
    const shortBy = (p.parMin - p.currentStock).toFixed(2);

    return (
        <Html>
            <Head />
            <Preview>
                Critical: {p.ingredientName} below safety stock in {p.storageAreaName}
            </Preview>
            <Tailwind>
                <Body className="bg-slate-100 font-sans">
                    <Container className="mx-auto my-8 max-w-[560px] rounded-lg bg-white shadow-sm">
                        {/* Red header */}
                        <Section className="rounded-t-lg bg-red-700 px-6 py-4">
                            <Text className="m-0 text-xs uppercase tracking-wide text-red-100">
                                🔴 Critical Stock Alert
                            </Text>
                            <Heading as="h1" className="m-0 mt-1 text-xl font-bold text-white">
                                {p.ingredientName}
                            </Heading>
                            <Text className="m-0 text-sm text-red-100">{p.storageAreaName}</Text>
                        </Section>

                        <Section className="px-6 py-5">
                            {p.recipientName && (
                                <Text className="m-0 mb-3 text-slate-800">Hi {p.recipientName},</Text>
                            )}
                            <Text className="m-0 mb-4 text-slate-700">
                                <strong>{p.ingredientName}</strong> just dropped below its safety stock level.
                            </Text>

                            <Section className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3">
                                <Text className="m-0 text-xs uppercase text-red-700">Current stock</Text>
                                <Text className="m-0 text-2xl font-bold text-red-900">
                                    {p.currentStock.toFixed(2)} {p.recipeUnit}
                                </Text>
                                <Text className="m-0 mt-1 text-xs text-red-700">
                                    PAR Min: <strong>{p.parMin.toFixed(2)} {p.recipeUnit}</strong>
                                    {" · "}
                                    Short by <strong>{shortBy} {p.recipeUnit}</strong>
                                </Text>
                            </Section>

                            <Text className="m-0 mb-2 text-sm text-slate-700">
                                <strong>Triggered by:</strong> {p.triggeredBy}
                            </Text>
                            <Text className="m-0 mb-2 text-sm text-slate-700">
                                <strong>Lead time:</strong> {p.leadTimeDays} day{p.leadTimeDays === 1 ? "" : "s"}
                            </Text>
                            {p.supplierName && (
                                <Text className="m-0 mb-2 text-sm text-slate-700">
                                    <strong>Preferred supplier:</strong> {p.supplierName}
                                </Text>
                            )}

                            <Section className="mt-5 text-center">
                                <Button
                                    className="rounded-md bg-red-700 px-5 py-2.5 text-sm font-semibold text-white"
                                    href={`${p.appUrl}/inventory?area=${encodeURIComponent(p.storageAreaId)}&highlight=${encodeURIComponent(p.ingredientId)}`}
                                >
                                    Open in BOH →
                                </Button>
                            </Section>
                        </Section>

                        <Hr className="m-0 border-slate-200" />
                        <Section className="rounded-b-lg bg-slate-50 px-6 py-4">
                            <Text className="m-0 text-xs text-slate-500">
                                You watch <strong>{p.storageAreaName}</strong>. Critical alerts fire in real time.
                            </Text>
                            <Text className="m-0 mt-1 text-xs text-slate-500">
                                <a className="text-amber-700 underline" href={`${p.appUrl}/settings/storage-areas/${p.storageAreaId}/notifications`}>Manage preferences</a>
                            </Text>
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}

export default CriticalStockAlert;
