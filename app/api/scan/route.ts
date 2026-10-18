import { newScanToken, scanUrl } from "@/lib/scan";
import { currentUser } from "@/lib/user";

/** Phone scan: opens a single-use link (15 min) the desktop shows as a QR code, owned by this visitor. */
export async function POST(req: Request) {
  const token = newScanToken(currentUser(req));
  return Response.json({ token, url: scanUrl(req, token) });
}
