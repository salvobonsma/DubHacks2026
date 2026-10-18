import QRCode from "qrcode";
import { connection } from "next/server";
import { scanOrigin } from "@/lib/scan";
import { ttlLabel } from "@/lib/user";
import { finishB, getRace, resetRace, startRace, stopA, wipeRace } from "./state";

/** Judge A's QR: the real T-Mobile plans page, the most natural new-customer start (plan/TMOBILE-REAL-FLOW.md, section 1). */
const TMOBILE_ENTRY = "https://www.t-mobile.com/cell-phone-plans";

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/;

/**
 * GET: the race (clocks are server times; `now` lets the laptop correct for its own clock). With ?qr=1 also the
 * two QR codes: A to t-mobile.com, B to this server's /tmobile?race=1 on PUBLIC_ORIGIN, else the LAN IP.
 */
export async function GET(req: Request) {
  await connection();
  const body: Record<string, unknown> = { race: getRace(), now: Date.now(), ttl: ttlLabel() };
  if (new URL(req.url).searchParams.get("qr") === "1") {
    const b = `${scanOrigin(req)}/tmobile?race=1`;
    const qr = (url: string) => QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: "M" });
    body.qr = {
      a: { url: TMOBILE_ENTRY, image: await qr(TMOBILE_ENTRY) },
      b: { url: b, image: await qr(b), phoneReachable: !LOCAL.test(b) },
    };
  }
  return Response.json(body);
}

/**
 * POST {action: "start"} starts both clocks; {action: "stop-a"} stops Judge A's. With no action it's the mock
 * reaching the credit check: {fields, total, typed} stops Judge B's clock (first call only, while a race runs).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; fields?: unknown; total?: unknown; typed?: unknown };
  if (body.action === "start") {
    startRace();
    return Response.json({ race: getRace(), now: Date.now() });
  }
  if (body.action === "stop-a") {
    const stopped = stopA();
    return Response.json({ stopped, race: getRace(), now: Date.now() });
  }
  if (body.action) return Response.json({ error: "Unknown action" }, { status: 400 });
  const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000 ? v : 0);
  const recorded = finishB(count(body.fields), count(body.total), count(body.typed));
  return Response.json({ recorded });
}

/** DELETE resets the clocks ("New race"). DELETE ?wipe=1 is "End and wipe": judges' rows since the race began go too. */
export async function DELETE(req: Request) {
  if (new URL(req.url).searchParams.get("wipe") === "1") return Response.json(await wipeRace());
  resetRace();
  return Response.json({ race: getRace(), now: Date.now() });
}
