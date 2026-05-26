/**
 * Resend client wrapper.
 *
 * Reads RESEND_API_KEY at runtime. If missing (e.g. local dev), sendEmail()
 * logs to the console and returns a "skipped" status so the rest of the
 * notification pipeline still exercises its branching logic.
 */
import { Resend } from "resend";

let _client: Resend | null = null;

function getClient(): Resend | null {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    if (!_client) _client = new Resend(key);
    return _client;
}

export const FROM_EMAIL =
    process.env.EMAIL_FROM ?? "BOH Alerts <alerts@padthaichaiyo.local>";
export const REPLY_TO   = process.env.EMAIL_REPLY_TO ?? undefined;
export const APP_URL    = process.env.APP_URL ?? "http://localhost:3000";

export interface SendEmailParams {
    to:      string | string[];
    cc?:     string[];
    subject: string;
    html:    string;
    text:    string;
}

export interface SendEmailResult {
    ok:        boolean;
    skipped:   boolean;
    id?:       string;
    error?:    string;
}

export async function sendEmail(p: SendEmailParams): Promise<SendEmailResult> {
    const client = getClient();
    if (!client) {
        console.warn("[email] RESEND_API_KEY not set — skipping send:", p.subject);
        return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" };
    }

    try {
        const { data, error } = await client.emails.send({
            from:    FROM_EMAIL,
            to:      Array.isArray(p.to) ? p.to : [p.to],
            cc:      p.cc,
            subject: p.subject,
            html:    p.html,
            text:    p.text,
            replyTo: REPLY_TO,
        });
        if (error) {
            return { ok: false, skipped: false, error: error.message ?? String(error) };
        }
        return { ok: true, skipped: false, id: data?.id };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, skipped: false, error: msg };
    }
}
