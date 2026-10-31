import Link from "next/link";
import { Navbar, Footer, Logo } from "@/components/ui";

export function LegalShell({ title, updated, children }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <div className="mb-2 flex items-center gap-2 text-xs text-dim">
          <Logo size={18} withWord={false} />
          <span>Drift — Legal & Safety</span>
        </div>
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-xs text-dim">Last updated: {updated}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-mute [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fog [&_a]:text-ember [&_a:hover]:underline [&_strong]:text-fog [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
        <div className="mt-12 flex gap-4 text-sm">
          <Link href="/privacy" className="text-ember hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="text-ember hover:underline">
            Terms
          </Link>
          <Link href="/guidelines" className="text-ember hover:underline">
            Guidelines
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
