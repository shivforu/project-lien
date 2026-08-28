export const metadata = {
  title: "Project Lien — Operations",
  description: "Next-generation eRecording & mortgage lien-release platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
