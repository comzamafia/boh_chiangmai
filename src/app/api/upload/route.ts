import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

// Token-generation + completion handler for Vercel Blob client uploads.
// The browser uploads the file directly to Vercel Blob CDN — it never
// goes through this function body, so there is no serverless size limit.
export async function POST(request: Request): Promise<NextResponse> {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
            { error: "Image storage is not configured. Add BLOB_READ_WRITE_TOKEN to your environment variables." },
            { status: 503 }
        );
    }

    let body: HandleUploadBody;
    try {
        body = (await request.json()) as HandleUploadBody;
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (pathname) => ({
                allowedContentTypes: [
                    "image/jpeg",
                    "image/jpg",
                    "image/png",
                    "image/webp",
                    "image/gif",
                ],
                maximumSizeInBytes: 10 * 1024 * 1024, // 10 MB
                addRandomSuffix: true,
                pathname: `recipes/${pathname}`,
            }),
            onUploadCompleted: async ({ blob }) => {
                console.log("[upload] completed:", blob.url);
            },
        });
        return NextResponse.json(jsonResponse);
    } catch (err) {
        console.error("[upload]", err);
        const msg = err instanceof Error ? err.message : "Upload failed";
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
