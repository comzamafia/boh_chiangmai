import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: path.join(__dirname, "prisma/schema.prisma"),
    migrations: {
        path: path.join(__dirname, "prisma/migrations"),
        seed: `ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts`,
    },
    datasource: {
        // Migrations (advisory locks) must run over a DIRECT, non-pooled
        // connection. Over Neon's PgBouncer pooler, pg_advisory_lock hangs
        // (P1002), so prefer an unpooled URL and fall back to DATABASE_URL.
        // NOTE: in Vercel, DIRECT_URL must be Neon's *direct* endpoint (host
        // WITHOUT "-pooler"); otherwise migrate deploy times out (P1002).
        url: process.env.DIRECT_URL
            ?? process.env.POSTGRES_URL_NON_POOLING
            ?? process.env.DATABASE_URL
            ?? "postgresql://padthai:padthai_secret@localhost:5432/padthai_chaiyo_boh",
    },
});
