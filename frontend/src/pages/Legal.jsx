import { Link } from "react-router-dom";
import { Navbar, Footer, Logo, Btn } from "../components/ui.jsx";

function Shell({ title, updated, children }) {
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
          <Link to="/privacy" className="text-ember hover:underline">
            Privacy
          </Link>
          <Link to="/terms" className="text-ember hover:underline">
            Terms
          </Link>
          <Link to="/guidelines" className="text-ember hover:underline">
            Guidelines
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function Privacy() {
  return (
    <Shell title="Privacy Policy" updated="January 2026">
      <p>Drift is a peer-to-peer random video and text chat service. This policy explains what we collect, why, and what we never collect.</p>
      <h2>1. What flows through our servers</h2>
      <ul>
        <li>
          <strong>Video and audio:</strong> never. Media streams directly between the two participants using WebRTC. Nothing is recorded by us or on your device.
        </li>
        <li>
          <strong>Chat messages:</strong> never. Messages are relayed in real time to the matched participant and discarded.
        </li>
        <li>
          <strong>Signaling metadata:</strong> small connection control messages (offer/answer/ICE candidates) pass through our servers transiently and are dropped after forwarding.
        </li>
      </ul>
      <h2>2. What we do collect</h2>
      <ul>
        <li>
          <strong>IP address (hashed):</strong> a salted SHA-256 hash of your IP, used for rate-limiting, abuse prevention, and enforcing bans.
        </li>
        <li>
          <strong>Abuse reports:</strong> reason, optional short detail, hashes of both users' IPs, a match identifier, and a timestamp.
        </li>
        <li>
          <strong>Moderation records:</strong> ban decisions, expiries, and admin audit entries.
        </li>
      </ul>
      <h2>3. What we do not collect</h2>
      <ul>
        <li>No accounts, usernames, emails, or phone numbers.</li>
        <li>No chat history, call logs, or recordings of any kind.</li>
        <li>No location data, device identifiers, or marketing trackers.</li>
      </ul>
      <h2>4. Retention</h2>
      <p>
        Matchmaking and session state lives in Redis memory and expires within minutes. Abuse reports are retained until reviewed and resolved. Ban
        records are retained until they expire or are lifted.
      </p>
      <h2>5. Anonymity, honestly stated</h2>
      <p>
        Drift is anonymous to other users. It is <strong>not</strong> anonymous to us in an absolute sense: technical identifiers (hashed IP) are
        retained briefly for security and abuse prevention, and may be disclosed under a valid legal process.
      </p>
    </Shell>
  );
}

export function Terms() {
  return (
    <Shell title="Terms of Service" updated="January 2026">
      <p>By using Drift you agree to these terms. If you do not agree, please do not use the service.</p>
      <h2>1. The service</h2>
      <p>
        Drift connects you, at random, with other users for one-to-one video and/or text conversation. We operate matchmaking and signaling; media
        flows peer-to-peer between participants.
      </p>
      <h2>2. Eligibility</h2>
      <ul>
        <li>You must be <strong>at least 18 years old</strong>.</li>
        <li>You are responsible for the legality of using Drift in your jurisdiction.</li>
      </ul>
      <h2>3. Acceptable use</h2>
      <p>You agree that you will not:</p>
      <ul>
        <li>Harass, threaten, bully, or stalk other users.</li>
        <li>Show explicit content or engage in sexual activity (Drift is not an adult-content service).</li>
        <li>Use hate speech, incite violence, or promote discrimination.</li>
        <li>Engage in scams, fraud, phishing, or spam.</li>
        <li>Share anyone's personal information.</li>
        <li>Abuse the service technically (bots, automated clients, signaling abuse).</li>
      </ul>
      <h2>4. No expectations of privacy</h2>
      <p>You converse with strangers you cannot verify. Never share personal information.</p>
      <h2>5. Moderation</h2>
      <p>We may review abuse reports and ban users (by hashed IP) for configurable periods when guidelines are violated.</p>
      <h2>6. Liability</h2>
      <p>The service is provided "as is". To the maximum extent permitted by law, we are not liable for indirect or consequential damages or for the conduct of other users.</p>
      <h2>7. Changes</h2>
      <p>We may update these terms; material changes are announced on this page with a new date.</p>
    </Shell>
  );
}

export function Guidelines() {
  return (
    <Shell title="Community Guidelines" updated="January 2026">
      <p>Drift is a public, anonymous space where two strangers meet. The only way it stays usable is that everyone follows a few simple rules.</p>
      <h2>Be a decent human</h2>
      <ul>
        <li>Assume good faith until proven otherwise.</li>
        <li>If a conversation isn't working, click <strong>Next</strong>. No hard feelings.</li>
        <li>Keep conversations adult-level and civil.</li>
      </ul>
      <h2>Strictly prohibited</h2>
      <ul>
        <li><strong>Harassment and bullying</strong> of any kind.</li>
        <li><strong>Explicit content</strong> — nudity, sexual acts, solicitation.</li>
        <li><strong>Hate speech</strong> or incitement.</li>
        <li><strong>Scams and spam</strong> — crypto schemes, link spam, advertising.</li>
        <li><strong>Sharing personal information</strong> — yours or anyone else's.</li>
        <li><strong>Underage users</strong> — report immediately and end the conversation.</li>
      </ul>
      <h2>Reporting</h2>
      <ul>
        <li>Every conversation has a report button; reports are private and reviewed.</li>
        <li>Repeat and severe violations result in bans by hashed IP.</li>
      </ul>
      <h2>Staying safe</h2>
      <ul>
        <li>Never share your name, location, workplace, school, phone number, or social media.</li>
        <li>Strangers can pretend to be anyone — nothing is verified.</li>
        <li><strong>Next</strong> and <strong>Stop</strong> are always one click away.</li>
      </ul>
    </Shell>
  );
}

export function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="anim-fade-up text-center">
        <div className="mb-6 flex justify-center">
          <Logo size={36} />
        </div>
        <div className="font-display text-7xl font-bold text-ember">404</div>
        <h1 className="mt-3 font-display text-xl font-semibold">This page drifted away</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-mute">The page you are looking for doesn't exist or was moved.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/">
            <Btn>Back home</Btn>
          </Link>
          <Link to="/video">
            <Btn variant="outline">Start video chat</Btn>
          </Link>
        </div>
      </div>
    </div>
  );
}
