import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import MarketingScripts from "./components/MarketingScripts";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="marketing-shell">
      <Navbar />
      <MarketingScripts />
      <main>{children}</main>
      <Footer />
    </div>
  );
}