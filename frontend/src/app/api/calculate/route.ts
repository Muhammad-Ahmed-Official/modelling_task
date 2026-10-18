import { InputError, run } from "@/lib/queue";

// Runs on the Node.js runtime (the default; `export const runtime` is not
// allowed together with cacheComponents in next.config.ts)

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Input is not valid JSON" }, { status: 400 });
  }

  try {
    const result = run(body);
    // ok:false here means the system is unstable (ρ ≥ 1)
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    if (e instanceof InputError)
      return Response.json({ ok: false, error: e.message }, { status: 400 });
    console.error("calculate failed:", e);
    return Response.json(
      { ok: false, error: "Internal error: " + (e instanceof Error ? e.message : String(e)) },
      { status: 500 },
    );
  }
}
