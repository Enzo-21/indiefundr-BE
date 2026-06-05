import { getFundCatalog } from "@/services/funds/catalog";

export async function GET() {
  return Response.json(await getFundCatalog());
}
