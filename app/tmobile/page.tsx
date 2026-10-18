import { cookies } from "next/headers";
import { Suspense } from "react";
import { CHOICES_COOKIE, parseChoices } from "./choices";
import { Signup, SignupPending } from "./Signup";

/**
 * T-Mobile new-customer signup, rebuilt step for step from the real flow. `?race=1` is Judge B's QR on /race:
 * the race stops at the credit check. `?formly_session=` means a same-tab Formly flow just came back: the
 * approved answers are read here, on the server, so the first paint is the filled checkout page rather than an
 * empty step 1 (or "Returning to T-Mobile" when they can't be read here).
 */
export default function TMobilePage({ searchParams }: PageProps<"/tmobile">) {
  return (
    <Suspense fallback={<SignupPending />}>
      <WithParams searchParams={searchParams} />
    </Suspense>
  );
}

async function WithParams({ searchParams }: { searchParams: PageProps<"/tmobile">["searchParams"] }) {
  const q = await searchParams;
  const sessionId = typeof q.formly_session === "string" ? q.formly_session : null;
  let initial = null;
  let mine = null;
  if (sessionId) {
    // Only this visitor's own session (same cookie as the Formly popup, which shares this origin). Loaded only
    // here, so a plain visit never opens the database while the page is prerendered.
    const { sessionResult, UID_COOKIE, UID_PATTERN } = await import("@/lib/user");
    const jar = await cookies();
    const uid = jar.get(UID_COOKIE)?.value;
    if (uid && UID_PATTERN.test(uid)) initial = sessionResult(sessionId, uid);
    mine = parseChoices(jar.get(CHOICES_COOKIE)?.value);
  }
  return <Signup race={q.race === "1"} returning={!!sessionId} initial={initial} mine={mine} />;
}
