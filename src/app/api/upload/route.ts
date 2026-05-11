import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const filename = searchParams.get("filename") ?? "upload";
        const contentType = request.headers.get("content-type") ?? "image/jpeg";

        if (!request.body) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // Validate content type
        if (!contentType.startsWith("image/")) {
            return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
        }

        const blob = await put(`recipes/${Date.now()}-${filename}`, request.body, {
            access: "public",
            contentType,
        });

        return NextResponse.json({ url: blob.url });
    } catch (err) {
        console.error("[upload]", err);
        const msg = err instanceof Error ? err.message : "Upload failed";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
