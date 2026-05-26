/**
 * Resolve which users should receive an alert for a given storage area,
 * applying per-watcher overrides and the area's master threshold.
 */
import { prisma } from "@/lib/db";
import type { AlertRecipient } from "./send";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface AreaNotifyContext {
    id:              string;
    name:            string;
    notifyEnabled:   boolean;
    alertThreshold:  "critical" | "reorder" | "any";
    digestSchedule:  "off" | "realtime" | "daily" | "weekly";
    digestHourLocal: number;
    digestDayOfWeek: number | null;
}

interface WatcherRow {
    id:             string;
    role:           string;
    ccOnly:         boolean;
    alertThreshold: string | null;
    digestSchedule: string | null;
    user: { id: string; email: string; name: string; isActive: boolean };
}

export async function getAreaContext(areaId: string): Promise<AreaNotifyContext | null> {
    const a = await db.storageArea.findUnique({ where: { id: areaId } });
    if (!a) return null;
    return {
        id:              a.id,
        name:            a.name,
        notifyEnabled:   a.notifyEnabled,
        alertThreshold:  a.alertThreshold,
        digestSchedule:  a.digestSchedule,
        digestHourLocal: a.digestHourLocal,
        digestDayOfWeek: a.digestDayOfWeek,
    };
}

/** All active watchers of an area, with effective settings inherited. */
export async function getAreaRecipients(
    areaId: string,
    severity: "critical" | "low",
): Promise<AlertRecipient[]> {
    const area = await getAreaContext(areaId);
    if (!area || !area.notifyEnabled) return [];

    // Severity must clear area threshold
    if (severity === "low" && area.alertThreshold === "critical") return [];

    const watchers: WatcherRow[] = await db.storageAreaWatcher.findMany({
        where: { storageAreaId: areaId },
        include: {
            user: { select: { id: true, email: true, name: true, isActive: true } },
        },
    });

    return watchers
        .filter(w => w.user.isActive)
        .filter(w => {
            const t = (w.alertThreshold ?? area.alertThreshold) as
                "critical" | "reorder" | "any";
            if (severity === "low" && t === "critical") return false;
            return true;
        })
        .map(w => ({
            userId: w.user.id,
            email:  w.user.email,
            name:   w.user.name,
            cc:     w.ccOnly,
        }));
}
