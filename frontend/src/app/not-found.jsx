import Link from "next/link";
import { Logo, Btn } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="anim-fade-up text-center">
        <div className="mb-6 flex justify-center">
          <Logo size={36} />
        </div>
        <div className="font-display text-7xl font-bold text-ember">404</div>
        <h1 className="mt-3 font-display text-xl font-semibold">This page drifted away</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-mute">
          The page you are looking for doesn't exist or was moved. Let's get you back to the conversation.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/">
            <Btn>Back home</Btn>
          </Link>
          <Link href="/video">
            <Btn variant="outline">Start video chat</Btn>
          </Link>
        </div>
      </div>
    </div>
  );
}
