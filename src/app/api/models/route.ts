import { NextResponse } from "next/server";
import { listModels, deepAnalysisEnabled } from "@/lib/ai";
import { withSession } from "@/lib/api";

export async function GET() {
  return withSession(async () => {
    return NextResponse.json({ models: listModels(), deepAnalysisEnabled: deepAnalysisEnabled() });
  });
}
