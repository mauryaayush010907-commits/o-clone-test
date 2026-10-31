import { LegalShell } from "@/components/legal";

export default function GuidelinesPage() {
  return (
    <LegalShell title="Community Guidelines" updated="January 2026">
      <p>
        Drift is a public, anonymous space where two strangers meet. The only way it stays usable for everyone is that
        everyone follows a few simple rules.
      </p>

      <h2>Be a decent human</h2>
      <ul>
        <li>Assume good faith until proven otherwise — a stranger can't read your mind.</li>
        <li>If a conversation isn't working, just click <strong>Next</strong>. No hard feelings, no guilt trips.</li>
        <li>Keep conversations age-appropriate: Drift is 18+, and we expect adult-level civility.</li>
      </ul>

      <h2>Strictly prohibited</h2>
      <ul>
        <li>
          <strong>Harassment and bullying</strong> — repeated unwanted contact, insults, threats, or intimidation.
        </li>
        <li>
          <strong>Explicit content</strong> — nudity, sexual acts, or sexual solicitation. Drift is not an adult site.
        </li>
        <li>
          <strong>Hate speech</strong> — slurs, dehumanization, or incitement against anyone.
        </li>
        <li>
          <strong>Scams and spam</strong> — crypto schemes, link spam, advertising, phishing.
        </li>
        <li>
          <strong>Sharing personal information</strong> — yours or anyone else's: names, addresses, schools, phone
          numbers, photos of identifiable people.
        </li>
        <li>
          <strong>Underage users</strong> — if you see someone who appears underage, report immediately and do not continue
          the conversation.
        </li>
      </ul>

      <h2>Reporting</h2>
      <ul>
        <li>Every conversation has a report button. Reports are private and reviewed by our safety team.</li>
        <li>A report is not a weapon: reporting a conversation you genuinely find violating is encouraged; fishing for
          punishment is not, and will not be rewarded.</li>
        <li>Repeat and severe violations result in bans by hashed IP. Ban lengths are configurable and reviewed.</li>
      </ul>

      <h2>Staying safe</h2>
      <ul>
        <li>Never share your full name, location, workplace, school, phone number, or social media.</li>
        <li>Nothing you see or hear is verified — strangers can pretend to be anyone.</li>
        <li>Keep your camera off if you're not comfortable, and leave whenever you want: <strong>Next</strong> and{" "}
          <strong>Stop</strong> are always one click away.</li>
      </ul>
    </LegalShell>
  );
}
