/**
 * Order-due reminder email.
 *
 * Fires once a day for each supplier whose order cutoff is today (or in
 * the next ~14 hours), if any of their ingredients are at/below ROP.
 */
import * as React from "react";
import {
    Html, Head, Preview, Body, Container, Section,
    Heading, Text, Hr, Button, Tailwind,
} from "@react-email/components";

export interface OrderReminderItem {
    name:           string;
    currentStock:   number;
    reorderPoint:   number;
    parMax:         number;
    recipeUnit:     string;
    purchaseUnit:   string;
    suggestedQty:   number;     // recipe units short of PAR Max → divided by conversionRate
    storageArea:    string;
}

export interface OrderReminderProps {
    supplierName:     string;
    supplierContact:  string | null;
    supplierEmail:    string | null;
    supplierPhone:    string | null;
    deliveryNotes:    string | null;
    minOrderValue:    number | null;
    nextDeliveryDate: string;          // human readable, e.g. "Wed, May 28"
    orderByDateTime:  string;          // human readable, e.g. "Tue, May 27 at 17:00"
    hoursUntilCutoff: number;          // for urgency styling
    items:            OrderReminderItem[];
    appUrl:           string;
    recipientName?:   string;
}

export function OrderReminder(p: OrderReminderProps) {
    const urgent = p.hoursUntilCutoff <= 4;
    const accent = urgent ? "red" : "amber";
    const totalShort = p.items.reduce((s, i) => s + i.suggestedQty, 0);

    return (
        <Html>
            <Head />
            <Preview>{`Order ${p.supplierName} by ${p.orderByDateTime} — ${p.items.length} item${p.items.length === 1 ? "" : "s"} below ROP`}</Preview>
            <Tailwind>
                <Body className="bg-slate-100 font-sans">
                    <Container className="mx-auto my-8 max-w-[620px] rounded-lg bg-white shadow-sm">
                        {/* Header */}
                        <Section className={`rounded-t-lg ${urgent ? "bg-red-700" : "bg-amber-700"} px-6 py-4`}>
                            <Text className={`m-0 text-xs uppercase tracking-wide ${urgent ? "text-red-100" : "text-amber-100"}`}>
                                {urgent ? "⏰ Urgent — Order cutoff in" : "🛒 Order reminder — cutoff in"} {p.hoursUntilCutoff.toFixed(0)}h
                            </Text>
                            <Heading as="h1" className="m-0 mt-1 text-xl font-bold text-white">
                                Order from {p.supplierName}
                            </Heading>
                            <Text className={`m-0 text-sm ${urgent ? "text-red-100" : "text-amber-100"}`}>
                                For delivery on {p.nextDeliveryDate}
                            </Text>
                        </Section>

                        {/* Body */}
                        <Section className="px-6 py-5">
                            {p.recipientName && (
                                <Text className="m-0 mb-3 text-slate-800">Hi {p.recipientName},</Text>
                            )}
                            <Text className="m-0 mb-3 text-slate-700">
                                The order cutoff for <strong>{p.supplierName}</strong> is{" "}
                                <strong className={urgent ? "text-red-700" : "text-amber-700"}>{p.orderByDateTime}</strong>.
                                Below are <strong>{p.items.length}</strong> item{p.items.length === 1 ? "" : "s"} currently at or below their reorder point.
                            </Text>

                            {/* Items */}
                            <Section className="mb-4 rounded-md border border-slate-200">
                                {p.items.map((it, i) => (
                                    <Section
                                        key={i}
                                        className={`px-4 py-3 ${i < p.items.length - 1 ? "border-b border-slate-200" : ""}`}
                                    >
                                        <Text className="m-0 font-semibold text-slate-900">
                                            {it.name}
                                        </Text>
                                        <Text className="m-0 mt-0.5 text-xs text-slate-600">
                                            <strong>{it.currentStock.toFixed(2)} {it.recipeUnit}</strong> on hand
                                            {" · ROP: "}{it.reorderPoint.toFixed(2)}{" "}{it.recipeUnit}
                                            {" · "}{it.storageArea}
                                        </Text>
                                        <Text className={`m-0 mt-1 text-sm font-semibold ${accent === "red" ? "text-red-700" : "text-amber-700"}`}>
                                            Suggested order: {it.suggestedQty.toFixed(2)} {it.purchaseUnit}
                                        </Text>
                                    </Section>
                                ))}
                            </Section>

                            {/* Supplier contact summary */}
                            <Section className="rounded-md bg-slate-50 px-4 py-3 mb-4">
                                <Text className="m-0 text-xs uppercase tracking-wide text-slate-500 mb-1">Order via</Text>
                                {p.supplierContact && (
                                    <Text className="m-0 text-sm text-slate-800"><strong>{p.supplierContact}</strong></Text>
                                )}
                                {p.supplierPhone && (
                                    <Text className="m-0 text-sm text-slate-700">📞 {p.supplierPhone}</Text>
                                )}
                                {p.supplierEmail && (
                                    <Text className="m-0 text-sm text-slate-700">✉️ {p.supplierEmail}</Text>
                                )}
                                {p.deliveryNotes && (
                                    <Text className="m-0 mt-1 text-xs text-slate-600">Note: {p.deliveryNotes}</Text>
                                )}
                                {p.minOrderValue != null && p.minOrderValue > 0 && (
                                    <Text className="m-0 mt-1 text-xs text-slate-600">
                                        Min order value: ฿{p.minOrderValue.toFixed(2)}
                                    </Text>
                                )}
                                <Text className="m-0 mt-2 text-xs text-slate-500">
                                    Total short of PAR Max across all items: {totalShort.toFixed(2)} units
                                </Text>
                            </Section>

                            <Section className="text-center">
                                <Button
                                    className={`rounded-md ${urgent ? "bg-red-700" : "bg-amber-700"} px-5 py-2.5 text-sm font-semibold text-white`}
                                    href={`${p.appUrl}/purchase-orders`}
                                >
                                    Open Purchase Orders →
                                </Button>
                            </Section>
                        </Section>

                        <Hr className="m-0 border-slate-200" />
                        <Section className="rounded-b-lg bg-slate-50 px-6 py-4">
                            <Text className="m-0 text-xs text-slate-500">
                                You&apos;re receiving this because items in storage areas you watch need ordering from {p.supplierName}.
                            </Text>
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}

export default OrderReminder;
