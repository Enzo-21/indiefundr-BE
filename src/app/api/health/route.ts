export async function GET() {
  return new Response("API Running Correctly", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
