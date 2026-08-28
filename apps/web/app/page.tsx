/**
 * Landing page. The full operations dashboard (queue metrics, at-risk counts across the
 * whole org — docs/REQUIREMENTS_MATRIX.md #25-26) is a further iteration on top of the
 * Queue screen built in this phase; this page is the entry point + nav, not a metrics
 * dashboard yet — see PROGRESS.md Phase 10 report for exactly what's built vs. deferred.
 */
export default function HomePage() {
  return (
    <main>
      <h1>Project Lien</h1>
      <p>Next-generation eRecording &amp; mortgage lien-release platform — operations console.</p>
      <p style={{ color: "#666" }}>
        Log in, then use <strong>Queue</strong> to see recording packages for your organization, or{" "}
        <strong>Jurisdictions</strong> to look up a state&apos;s compliance rule.
      </p>
    </main>
  );
}
