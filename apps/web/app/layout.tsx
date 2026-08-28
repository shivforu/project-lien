export const metadata = {
  title: "Project Lien — Operations",
  description: "Next-generation eRecording & mortgage lien-release platform",
};

const navLinkStyle = { color: "#fff", textDecoration: "none", marginRight: "1.5rem", fontSize: "0.9rem" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: "#1a1a1a", background: "#f7f7f8" }}>
        <nav style={{ background: "#111827", padding: "0.9rem 1.5rem", display: "flex", alignItems: "center" }}>
          <a href="/" style={{ ...navLinkStyle, fontWeight: 700, marginRight: "2rem" }}>
            Project Lien
          </a>
          <a href="/queue" style={navLinkStyle}>Queue</a>
          <a href="/jurisdictions" style={navLinkStyle}>Jurisdictions</a>
          <a href="/login" style={{ ...navLinkStyle, marginLeft: "auto" }}>Login</a>
        </nav>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem" }}>{children}</div>
      </body>
    </html>
  );
}
