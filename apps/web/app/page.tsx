/**
 * Placeholder landing page. The real operations dashboard (queue metrics, at-risk
 * counts, etc. — docs/REQUIREMENTS_MATRIX.md items #25-31) is built in Phase 10, once
 * there's a real API (Phase 8) for it to read from. Shipping a page that calls a real
 * screen "done" before that API exists would be exactly the kind of premature
 * "production ready" claim this project explicitly forbids.
 */
export default function HomePage() {
  return (
    <main style={{ padding: "3rem", maxWidth: 720 }}>
      <h1>Project Lien</h1>
      <p>
        Next-generation eRecording &amp; mortgage lien-release platform — operations
        console.
      </p>
      <p style={{ color: "#666" }}>
        This is a Phase 1 scaffold. See <code>PROGRESS.md</code> in the repository for
        current build status.
      </p>
    </main>
  );
}
