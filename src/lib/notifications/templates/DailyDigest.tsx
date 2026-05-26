/**
 * Daily / weekly storage area digest.
 * Lists every ingredient at/below reorderPoint, grouped by severity.
 */
import * as React from "react";
import {
    Html, Head, Preview, Body, Container, Section,
    Heading, Text, Hr, Button, Row, Column, Tailwind,
} from "@react-email/components";

export interface DigestItem {
    name:         string;
    currentStock: number;
    parMin:       number;
    reorderPoint: number;
    recipeUnit:   string;
    severity:     "critical" | "low";
    suggestedQty?: number;
    purchaseUnit?: string;
    supplierName?: string;
}

export interface DailyDigestProps {
    storageAreaName: string;
    storageAreaId:   string;
    items:           DigestItem[];
    appUrl:          string;
    recipientName?:  string;
    cadence:         "daily" | "weekly";
}

export function DailyDigest({
    storageAreaName, storageAreaId, items, appUrl, recipientName, cadence,
}: DailyDigestProps) {
    const critical = items.filter(i => i.severity === "critical");
    const low      = items.filter(i => i.severity === "low");

    return (
        <Html>
            <Head />
            <Preview>{`${storageAreaName}: ${critical.length} critical, ${low.length} reorder`}</Preview>
            <Tailwind>
                <Body className="bg-slate-100 font-sans">
                    <Container className="mx-auto my-8 max-w-[560px] rounded-lg bg-white shadow-sm">
                        {/* Header */}
                        <Section className="rounded-t-lg bg-amber-700 px-6 py-4">
                            <Text className="m-0 text-xs uppercase tracking-wide text-amber-100">
                                PADTHAI CHAIYO · Back of House
                            </Text>
                            <Heading as="h1" className="m-0 mt-1 text-xl font-bold text-white">
                                {storageAreaName}
                            </Heading>
                            <Text className="m-0 text-sm text-amber-100">
                                {cadence === "daily" ? "Daily stock digest" : "Weekly stock digest"}
                            </Text>
                        </Section>

                        {/* Body */}
                        <Section className="px-6 py-5">
                            {recipientName && (
                                <Text className="m-0 mb-4 text-slate-800">
                                    Hi {recipientName},
                                </Text>
                            )}
                            <Text className="m-0 mb-4 text-slate-700">
                                {items.length} ingredient{items.length === 1 ? "" : "s"} in <strong>{storageAreaName}</strong> need attention.
                            </Text>

                            {critical.length > 0 && (
                                <>
                                    <Heading as="h2" className="mb-2 mt-2 text-sm font-bold uppercase tracking-wide text-red-700">
                                        🔴 Critical ({critical.length})
                                    </Heading>
                                    {critical.map((it, i) => <ItemRow key={`c${i}`} item={it} />)}
                                </>
                            )}

                            {low.length > 0 && (
                                <>
                                    <Heading as="h2" className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide text-amber-700">
                                        🟡 Reorder ({low.length})
                                    </Heading>
                                    {low.map((it, i) => <ItemRow key={`l${i}`} item={it} />)}
                                </>
                            )}

                            <Section className="mt-6 text-center">
                                <Button
                                    className="rounded-md bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white"
                                    href={`${appUrl}/inventory?area=${encodeURIComponent(storageAreaId)}`}
                                >
                                    Open {storageAreaName} →
                                </Button>
                            </Section>
                        </Section>

                        {/* Footer */}
                        <Hr className="m-0 border-slate-200" />
                        <Section className="rounded-b-lg bg-slate-50 px-6 py-4">
                            <Text className="m-0 text-xs text-slate-500">
                                You&apos;re receiving this because you watch <strong>{storageAreaName}</strong>.
                            </Text>
                            <Text className="m-0 mt-1 text-xs text-slate-500">
                                Manage preferences: <a className="text-amber-700 underline" href={`${appUrl}/settings/storage-areas/${storageAreaId}/notifications`}>Notification settings</a>
                            </Text>
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}

function ItemRow({ item }: { item: DigestItem }) {
    const isCritical = item.severity === "critical";
    return (
        <Section className={`mb-2 rounded-md border ${isCritical ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"} px-4 py-3`}>
            <Row>
                <Column>
                    <Text className="m-0 font-semibold text-slate-900">{item.name}</Text>
                    <Text className="m-0 mt-0.5 text-xs text-slate-600">
                        Current: <strong>{item.currentStock.toFixed(2)} {item.recipeUnit}</strong>
                        {" · "}
                        {isCritical ? `PAR Min: ${item.parMin.toFixed(2)}` : `Reorder: ${item.reorderPoint.toFixed(2)}`} {item.recipeUnit}
                    </Text>
                    {item.suggestedQty != null && item.purchaseUnit && (
                        <Text className="m-0 mt-1 text-xs text-slate-700">
                            Suggested order: <strong>{item.suggestedQty.toFixed(2)} {item.purchaseUnit}</strong>
                            {item.supplierName ? ` from ${item.supplierName}` : ""}
                        </Text>
                    )}
                </Column>
            </Row>
        </Section>
    );
}

export default DailyDigest;
