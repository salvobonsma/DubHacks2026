import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-navy px-4 text-center">
      <Logo light className="scale-150" />
      <p className="max-w-md text-white/70">
        Stripe for forms. Fill any signup or checkout with your own data, without handing your files to the business.
      </p>
      <div className="flex gap-3">
        <Link href="/tmobile" className="rounded-xl bg-brand px-5 py-3 font-semibold text-navy">
          Try the T-Mobile demo
        </Link>
        <Link href="/formly" className="rounded-xl border border-white/20 px-5 py-3 font-semibold text-white">
          My Formly
        </Link>
      </div>
    </main>
  );
}
