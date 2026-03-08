import Link from "next/link";

const footerLinks = {
  Features: [
    { href: "/features/ai-deduplication", label: "AI Deduplication" },
    { href: "/features/theme-clustering", label: "Theme Clustering" },
    { href: "/features/public-portal", label: "Public Portal" },
    { href: "/features/public-roadmap", label: "Public Roadmap" },
  ],
  Compare: [
    { href: "/compare/canny", label: "Canny" },
    { href: "/compare/frill", label: "Frill" },
    { href: "/compare/uservoice", label: "UserVoice" },
  ],
  Company: [
    { href: "/about", label: "About" },
    { href: "/blog", label: "Blog" },
    { href: "/security", label: "Security" },
  ],
};

export function MarketingFooter() {
  return (
    <footer className="border-t py-12">
      <div className="container mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <h3 className="font-semibold">TriageInsight</h3>
          <p className="text-sm text-muted-foreground mt-2">Feedback, prioritized.</p>
        </div>
        {Object.entries(footerLinks).map(([title, links]) => (
          <div key={title}>
            <h4 className="font-medium">{title}</h4>
            <ul className="mt-4 space-y-2">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container mx-auto mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} TriageInsight, Inc. All rights reserved.</p>
      </div>
    </footer>
  );
}
