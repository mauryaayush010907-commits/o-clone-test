import { LegalShell } from "@/components/legal";

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="January 2026">
      <p>By using Drift you agree to these terms. If you do not agree, please do not use the service.</p>

      <h2>1. The service</h2>
      <p>
        Drift connects you, at random, with other users for one-to-one video and/or text conversation. We operate the
        matchmaking and signaling infrastructure; the media conversation itself happens peer-to-peer between the two
        participants' devices.
      </p>

      <h2>2. Eligibility</h2>
      <ul>
        <li>You must be <strong>at least 18 years old</strong>.</li>
        <li>You are responsible for ensuring the use of Drift is legal in your jurisdiction.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree that you will not, on Drift or toward any participant:</p>
      <ul>
        <li>Harass, threaten, bully, or stalk other users.</li>
        <li>Nude yourself, show explicit content, or engage in sexual activity. (Drift is not an adult-content service.)</li>
        <li>Hate-speak, incite violence, or promote discrimination.</li>
        <li>Engage in scams, fraud, phishing, or solicitation.</li>
        <li>Share anyone's personal information, including your own or a minor's.</li>
        <li>Attempt to disrupt the service (bots, spam, automated clients, signaling abuse).</li>
        <li>Violate any applicable law.</li>
      </ul>

      <h2>4. No expectations of privacy</h2>
      <p>
        You converse with strangers you cannot verify. Never share personal information. We strongly recommend you do not
        record conversations; we do not, but we cannot prevent participants.
      </p>

      <h2>5. Moderation</h2>
      <p>
        We may review abuse reports and may ban users (identified by hashed IP) for a configurable period or permanently
        when guidelines are violated. We may act without prior notice in urgent cases.
      </p>

      <h2>6. Service availability</h2>
      <p>
        We work to keep Drift available, but the service is provided "as is" without warranties of any kind. We may
        interrupt or discontinue features to fix problems or prevent abuse.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Drift and its operators are not liable for indirect, incidental, or
        consequential damages, or for the conduct of other users.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these terms. Material changes will be announced on this page with a new "last updated" date. Continued
        use after changes constitutes acceptance.
      </p>
    </LegalShell>
  );
}
