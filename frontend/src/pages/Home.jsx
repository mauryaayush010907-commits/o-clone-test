import { Link } from "react-router-dom";
import { Navbar, Footer, Btn, ShieldCard, useStats, Video, MessageCircle, Users, ShieldCheck, Lock, EyeOff, Ban, Radio } from "../components/ui.jsx";
import { Video as VideoIcon, MessageCircle as TextIcon, Lock as PrivateIcon, Users as UsersIcon, ShieldCheck as ShieldIcon, Lock as LockIcon } from "lucide-react";

export default function Home() {
  const stats = useStats(8000);

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="hero-glow relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 md:pb-24 md:pt-24">
            <div className="anim-fade-up mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-4 py-1.5 text-xs text-mute">
                <span className="relative flex h-2 w-2">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-aqua opacity-60" />
                  <span className="relative h-2 w-2 rounded-full bg-aqua" />
                </span>
                Live right now — {stats.online} {stats.online === 1 ? "person" : "people"} online · {stats.activeMatches}{" "}
                {stats.activeMatches === 1 ? "conversation" : "conversations"} in progress
              </div>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl">
                Meet New People
                <br />
                <span className="bg-gradient-to-r from-ember via-ember2 to-aqua bg-clip-text text-transparent">Around the World</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-mute md:text-lg">
                One-to-one random video and text chat. Real peer-to-peer connections, real strangers, zero accounts, zero recordings.
                Click start and drift into a conversation.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/video" className="w-full sm:w-auto">
                  <Btn size="lg" className="w-full sm:w-auto">
                    <VideoIcon size={19} className="text-accent" />
                    Start Video Chat
                  </Btn>
                </Link>
                <Link to="/text" className="w-full sm:w-auto">
                  <Btn size="lg" variant="aqua" className="w-full sm:w-auto">
                    <TextIcon size={19} />
                    Start Text Chat
                  </Btn>
                </Link>
                <Link to="/private" className="w-full sm:w-auto">
                  <Btn size="lg" variant="outline" className="w-full sm:w-auto">
                    <PrivateIcon size={19} />
                    Private Video Chat
                  </Btn>
                </Link>
              </div>
              <p className="mt-4 text-xs text-dim">18+ only · No sign-up · Your media never touches our servers</p>
            </div>

            <div className="anim-fade-up mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-3" style={{ animationDelay: "120ms" }}>
              <StatCard icon={<UsersIcon size={16} />} label="Online now" value={stats.online} live />
              <StatCard icon={<MessageCircle size={16} />} label="Waiting" value={`${stats.waiting.video} video · ${stats.waiting.text} text`} />
              <StatCard icon={<Radio size={16} />} label="Active pairs" value={stats.activeMatches} />
            </div>
          </div>
        </section>

        <section className="border-t border-line/60 bg-panel/30">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <h2 className="text-center font-display text-2xl font-bold md:text-3xl">How it works</h2>
            <p className="mx-auto mt-2 max-w-md text-center text-sm text-mute">Three steps, no accounts, no friction.</p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <Step n="01" title="Choose your mode">
                Pick a video conversation or stay text-only. Text mode never touches your camera or microphone.
              </Step>
              <Step n="02" title="We match you">
                A real-time matchmaking service pairs you with another person who is looking for a conversation at the same moment.
              </Step>
              <Step n="03" title="Talk — or skip">
                Chat with live video, audio and text. Don't vibe? Hit <strong className="text-fog">Next</strong> and you're matched with
                someone new instantly.
              </Step>
            </div>
          </div>
        </section>

        <section className="border-t border-line/60">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <div className="mb-10 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-aqua/12 text-aqua">
                <ShieldIcon size={19} />
              </span>
              <div>
                <h2 className="font-display text-2xl font-bold md:text-3xl">Privacy & safety first</h2>
                <p className="text-sm text-mute">Built for a public stranger service — designed accordingly.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ShieldCard icon={EyeOff} title="Nothing recorded">
                Video and audio stream directly between your devices via WebRTC. Messages are ephemeral and never stored.
              </ShieldCard>
              <ShieldCard icon={LockIcon} title="No accounts, no names">
                No sign-up, no profiles. For abuse prevention we keep a salted hash of your IP briefly — never the raw address
                publicly.
              </ShieldCard>
              <ShieldCard icon={Ban} title="Report & moderation">
                Every conversation has a report button. Reports are validated, stored, and reviewed; repeat offenders are banned.
              </ShieldCard>
              <ShieldCard icon={ShieldCheck} title="Adults only">
                Drift requires you to confirm you are 18+. Report underage users immediately — it is a priority action.
              </ShieldCard>
            </div>
            <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-5 sm:flex-row">
              <div className="flex items-center gap-3 text-sm text-mute">
                <Users size={18} className="text-ember" />
                Be kind. Be curious. Never share personal information.
              </div>
              <div className="flex gap-4 text-sm">
                <Link to="/guidelines" className="text-ember hover:underline">
                  Community guidelines
                </Link>
                <Link to="/privacy" className="text-mute hover:text-fog">
                  Privacy policy
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line/60">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center md:py-20">
            <h2 className="font-display text-2xl font-bold md:text-4xl">Your next conversation is one click away</h2>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/video" className="w-full sm:w-auto">
                <Btn size="lg" className="w-full sm:w-auto">
                  <Video size={18} className="text-accent" />
                  Start Video Chat
                </Btn>
              </Link>
              <Link to="/text" className="w-full sm:w-auto">
                <Btn size="lg" variant="outline" className="w-full sm:w-auto">
                  <MessageCircle size={18} />
                  Start Text Chat
                </Btn>
              </Link>
              <Link to="/private" className="w-full sm:w-auto">
                <Btn size="lg" variant="outline" className="w-full sm:w-auto">
                  <PrivateIcon size={18} />
                  Private Video Chat
                </Btn>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function StatCard({ icon, label, value, live = false }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 text-center">
      <div className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-lg bg-ghost text-mute">{icon}</div>
      <div className="font-display text-xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] text-dim">
        {live && <span className="h-1.5 w-1.5 rounded-full bg-aqua" />}
        {label}
      </div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-6 transition-all duration-300 hover:-translate-y-1 hover:border-line2">
      <div className="mb-4 font-display text-sm font-bold text-ember/70">{n}</div>
      <h3 className="mb-2 font-display text-lg font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-mute">{children}</p>
    </div>
  );
}
