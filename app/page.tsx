import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-navy px-4 text-center">
      <Logo light className="scale-150" />
      <p className="max-w-md text-white/70">
        Stripe for forms. Fill any signup or checkout with your own data, without handing your files to the business.
      </p>
      <div className="flex gap-3">
        <Link
          href="/demo"
          className="rounded-xl bg-brand px-5 py-3 font-display font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          Try a demo form
        </Link>
        <Link
          href="/formly"
          className="rounded-xl border border-white/20 px-5 py-3 font-display font-semibold text-white transition-colors hover:bg-white/10"
        >
          My Formly
        </Link>
      </div>
    </main>
  );
}
