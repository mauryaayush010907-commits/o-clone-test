import { LegalShell } from "@/components/legal";

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="January 2026">
      <p>
        Drift is a peer-to-peer random video and text chat service. This policy explains what we collect, why we collect it,
        and what we never collect.
      </p>

      <h2>1. What flows through our servers</h2>
      <ul>
        <li>
          <strong>Video and audio:</strong> never. Media streams directly between the two participants using WebRTC. We have
          no access to it and cannot access it. Nothing is recorded by us or on your device.
        </li>
        <li>
          <strong>Chat messages:</strong> never. Messages are relayed in real time to the matched participant and discarded.
          They are not logged, stored, or read.
        </li>
        <li>
          <strong>Signaling metadata:</strong> small connection control messages (offer/answer/candidate) pass through our
          servers transiently and are dropped after forwarding.
        </li>
      </ul>

      <h2>2. What we do collect</h2>
      <ul>
        <li>
          <strong>IP address (hashed):</strong> we compute a salted SHA-256 hash of your IP address. This is used for
          rate-limiting, abuse prevention, and enforcing bans. We do not publish or cross-reference hashes with personal
          identity without a legal process.
        </li>
        <li>
          <strong>Abuse reports:</strong> reason, optional short detail, the hashes of the reporter's and reported user's
          IPs, a match identifier, and a timestamp.
        </li>
        <li>
          <strong>Moderation records:</strong> ban decisions, their expiry, and admin audit entries (who, when, why).
        </li>
      </ul>

      <h2>3. What we do not collect</h2>
      <ul>
        <li>No accounts, no usernames, no email addresses, no phone numbers.</li>
        <li>No chat history, no call logs, no recordings of any kind.</li>
        <li>No location data, device identifiers, or browser fingerprinting for marketing.</li>
        <li>No advertising or third-party analytics trackers.</li>
      </ul>

      <h2>4. Retention</h2>
      <p>
        Matchmaking and session state is held in memory (Redis) and expires within minutes of a conversation ending. Abuse
        reports are retained until reviewed and resolved, then archived. Ban records are retained until they expire or are
        lifted.
      </p>

      <h2>5. Anonymity, honestly stated</h2>
      <p>
        Drift is anonymous to other users: no one sees your name, profile, or history. It is <strong>not</strong> anonymous
        to us in an absolute sense: technical identifiers (hashed IP) are retained briefly for security and abuse
        prevention, and law-enforcement requests served under applicable law may lead to disclosure.
      </p>

      <h2>6. Safety actions</h2>
      <p>
        Reported users may be banned by IP hash for a configurable period. We treat reports of underage users, threats, and
        illegal activity as priority actions. If you need to report something, use the in-app report button — it is the
        fastest channel.
      </p>

      <h2>7. Your choices</h2>
      <p>
        You can use Drift without creating an account and with camera and microphone turned off at any time (in video mode,
        your partner will see a blank feed). Declining the 18+ confirmation simply prevents you from entering.
      </p>
    </LegalShell>
  );
}
