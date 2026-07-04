import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/mobile/sideloadDeprecation";

export async function GET() {
  return NextResponse.json(getAppConfig());
}
