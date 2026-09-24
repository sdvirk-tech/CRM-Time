import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { getCbrRates } from "@/lib/cbr";

export async function GET() {
  return withSession(async () => {
    const rates = await getCbrRates();
    return NextResponse.json(rates);
  });
}

export async function POST() {
  return withSession(async () => {
    const rates = await getCbrRates({ force: true });
    return NextResponse.json(rates);
  });
}
