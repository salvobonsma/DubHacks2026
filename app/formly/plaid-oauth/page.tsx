import type { Metadata } from "next";
import { PlaidOAuth } from "./PlaidOAuth";

export const metadata: Metadata = { title: "Connecting your bank · Formly" };

/**
 * Plaid's redirect_uri ({origin}/formly/plaid-oauth, registered in the Plaid dashboard). An OAuth bank (Chase,
 * Bank of America…) sends the phone here after the user approves at the bank; Link is reopened with the same
 * link token to finish, then the user goes back to the page that started it.
 */
export default function PlaidOAuthPage() {
  return <PlaidOAuth />;
}
