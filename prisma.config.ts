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
        url: process.env.DATABASE_URL ?? "postgresql://padthai:padthai_secret@localhost:5432/padthai_chaiyo_boh",
    },
});
