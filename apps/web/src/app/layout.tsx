import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata = {
  title: "TriageInsight",
  description: "AI-powered feedback triage for product clarity",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
