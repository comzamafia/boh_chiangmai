import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const EMAIL = process.env.ADMIN_EMAIL ?? "admin@padthaichaiyo.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin@1234";
const NAME = process.env.ADMIN_NAME ?? "Admin";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgresql://padthai:padthai_secret@localhost:5432/padthai_chaiyo_boh",
    ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    const hash = await bcrypt.hash(PASSWORD, 12);
    const user = await prisma.user.upsert({
        where: { email: EMAIL },
        update: { password: hash, role: "admin", isActive: true, name: NAME },
        create: {
            name: NAME,
            email: EMAIL,
            password: hash,
            role: "admin",
            permissions: [],
            isActive: true,
        },
    });
    console.log(`Super user ready: ${user.email} (role=${user.role})`);
    console.log(`Password: ${PASSWORD}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
