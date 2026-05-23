import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const [recipeCount, ingredientCount, userCount] = await Promise.all([
            prisma.recipe.count(),
            prisma.ingredient.count(),
            prisma.user.count(),
        ]);

        // Show partial DB URL so we can identify which DB is in use (hide credentials)
        const dbUrl = process.env.DATABASE_URL ?? "";
        const safeUrl = dbUrl.replace(/\/\/[^@]+@/, "//***@");

        return NextResponse.json({
            db: safeUrl,
            recipes: recipeCount,
            ingredients: ingredientCount,
            users: userCount,
        });
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
