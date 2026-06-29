/**
 * Audit logging utility for the V2 RBAC & Audit Trail system.
 * Call logAudit() after any mutation in API routes.
 * Fire-and-forget — never throws, never blocks the response.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";

export type AuditAction =
    | "CREATE"
    | "UPDATE"
    | "DELETE"
    | "WASTE_LOG"
    | "RECEIVE"
    | "LOGIN";

export interface LogAuditParams {
    session:     SessionPayload | null;
    action:      AuditAction;
    targetTable: string;
    targetId:    string;
    targetName?: string;
    oldValues?:  Record<string, unknown>;
    newValues?:  Record<string, unknown>;
    request?:    Request;
    branchId?:   string;
}

/** Extract client IP from request headers (works behind proxies). */
function getIp(request?: Request): string | null {
    if (!request) return null;
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return request.headers.get("x-real-ip") ?? null;
}

/** Strip sensitive fields (password) before storing in audit log. */
function sanitize(obj?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!obj) return undefined;
    const { password, ...rest } = obj as Record<string, unknown>;
    void password; // intentionally omitted
    return rest;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                userId:      params.session?.userId ?? null,
                userName:    params.session?.name    ?? null,
                userEmail:   params.session?.email   ?? null,
                userRole:    params.session?.role    ?? null,
                action:      params.action,
                targetTable: params.targetTable,
                targetId:    params.targetId,
                targetName:  params.targetName ?? null,
                oldValues:   sanitize(params.oldValues) as Prisma.InputJsonValue ?? undefined,
                newValues:   sanitize(params.newValues) as Prisma.InputJsonValue ?? undefined,
                ipAddress:   getIp(params.request),
                branchId:    params.branchId ?? null,
            },
        });
    } catch {
        // Audit logging must never crash the main request
    }
}
