import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseOrderMessageWithGemini } from "@/lib/ai/parse-order-with-gemini";
import { requireApiSession } from "@/lib/require-api-session";
import { llmRouteRateLimitResponse } from "@/lib/llm-route-rate-limit";

const ParseRequestSchema = z
  .object({
    message: z.string().max(5000).optional(),
    rawText: z.string().max(5000).optional(),
    source: z.enum(["instagram", "manual"]).default("instagram"),
  })
  .refine(
    (data) =>
      Boolean(
        (data.message && data.message.trim().length >= 10) ||
          (data.rawText && data.rawText.trim().length >= 10)
      ),
    { message: "Either message or rawText is required (min 10 chars)" }
  );

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const limited = llmRouteRateLimitResponse(req, "parseorder");
  if (limited) return limited;
  try {
    const body = await req.json();
    const input = ParseRequestSchema.safeParse(body);
    if (!input.success) {
      console.warn("[parse-order] validation failed:", input.error.flatten());
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const text = (input.data.message ?? input.data.rawText ?? "").trim();
    const { data, usage } = await parseOrderMessageWithGemini(text);

    return NextResponse.json({
      success: true,
      data,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        model: usage.model,
      },
    });
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === "AI_OVERLOADED") {
      console.warn("[parse-order] AI overloaded:", error.message);
      return NextResponse.json(
        { error: "Service Unavailable", code: "AI_OVERLOADED" },
        { status: 503 }
      );
    }
    console.error("[parse-order] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
