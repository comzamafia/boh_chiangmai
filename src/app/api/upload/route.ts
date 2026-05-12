import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
            { error: "Image storage is not configured. Add BLOB_READ_WRITE_TOKEN to your environment variables." },
            { status: 503 }
        );
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file || file.size === 0) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
        if (!ALLOWED.includes(file.type)) {
            return NextResponse.json({ error: "Only image files are allowed (JPG, PNG, WebP, GIF)" }, { status: 400 });
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const blob = await put(`recipes/${Date.now()}-${safeName}`, file, {
            access: "public",
            contentType: file.type,
        });

        return NextResponse.json({ url: blob.url });
    } catch (err) {
        console.error("[upload]", err);
        const raw = err instanceof Error ? err.message : "Upload failed";
        const msg = raw.toLowerCase().includes("private")
            ? "Blob store is set to private access. Go to Vercel Dashboard → Storage → your Blob store → Settings and change access to Public, or create a new Public blob store."
            : raw;
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
