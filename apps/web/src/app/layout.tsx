import "./globals.css";

export const metadata = {
  title: "TriageInsight",
  description: "AI-powered feedback triage for product clarity",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}