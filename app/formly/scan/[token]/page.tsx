import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { scanState } from "@/lib/scan";
import { ScanPhone } from "./ScanPhone";

export const metadata: Metadata = { title: "Scan documents · Formly" };
// Every visit reads the token from the db, and the root layout's banner reads the pathname, so this route blocks.
export const instant = false;

/** Phone page behind the desktop's QR code: take photos of documents and send them to Formly. */
export default function ScanPage(props: PageProps<"/formly/scan/[token]">) {
  return (
    <Suspense fallback={null}>
      <ScanBody {...props} />
    </Suspense>
  );
}

async function ScanBody({ params, searchParams }: PageProps<"/formly/scan/[token]">) {
  await connection();
  const { token } = await params;
  const query = await searchParams;
  const { state, files } = scanState(token);
  // ?done= / ?error= come back from the no-JS form post (see app/api/scan/[token]/route.ts).
  const error = typeof query.error === "string" ? query.error : null;
  return <ScanPhone token={token} state={state} files={files} error={error} />;
}
