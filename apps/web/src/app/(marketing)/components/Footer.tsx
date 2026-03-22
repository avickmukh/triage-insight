"use client";

export default function Footer() {
  return (
    <footer id="footer">
  <div className="container">
    <div className="footer-grid">

      <div className="footer-brand">
        <a href="/" className="footer-logo" aria-label="TriageInsight home">
          <svg xmlns="http://www.w3.org/2000/svg" width="200" height="44" viewBox="0 0 1400 420" aria-label="Triage Insight logo" role="img">
          <defs>
            <linearGradient id="gIcon" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1E3A8A"/>
              <stop offset="50%" stopColor="#0EA5E9"/>
              <stop offset="100%" stopColor="#2DD4BF"/>
            </linearGradient>
            <linearGradient id="gInsight" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22D3EE"/>
              <stop offset="100%" stopColor="#2DD4BF"/>
            </linearGradient>
          </defs>
          <g transform="translate(80,40)">
            <rect x="0" y="0" rx="60" ry="60" width="260" height="260" fill="url(#gIcon)"/>
            <rect x="55" y="50" rx="25" ry="25" width="150" height="150" fill="#ffffff"/>
            <rect x="85" y="135" width="20" height="40" fill="#0F172A"/>
            <rect x="115" y="120" width="20" height="55" fill="#0F172A"/>
            <rect x="145" y="100" width="20" height="75" fill="#0F172A"/>
            <path d="M75 150 Q130 120 185 85" stroke="#22D3EE" strokeWidth="8" fill="none"/>
            <circle cx="185" cy="85" r="8" fill="#22D3EE"/>
          </g>
          <text x="420" y="220" fontSize="130" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fill="#FFFFFF">Triage</text>
          <text x="840" y="220" fontSize="130" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fill="url(#gInsight)">Insight</text>
        </svg>
        </a>
        <p className="footer-tagline">AI-powered feedback triage for B2B SaaS teams who want clarity.</p>
        <div className="footer-socials">
          <a href="#" className="social-btn" aria-label="Twitter / X">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
              <path d="M8.5 6.5L13.5 1h-1.5L7.8 5.6 4.5 1H1l5.3 7.5L1 14h1.5l4.5-5 3.5 5H14L8.5 6.5zm-1.6 1.8L6.2 7.5 2.2 2h2l4.2 6-.7 1z"/>
            </svg>
          </a>
          <a href="#" className="social-btn" aria-label="LinkedIn">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
              <path d="M2 1a1 1 0 100 2 1 1 0 000-2zm-1 3.5h2V14H1V4.5zM5.5 4.5H7.4v1.3h.1c.3-.6 1-1.5 2.4-1.5 2.5 0 3 1.7 3 3.8V14h-2V8.6c0-.9 0-2-1.2-2s-1.4 1-1.4 2V14H5.5V4.5z"/>
            </svg>
          </a>
        </div>
      </div>

      <div>
        <p className="footer-col-title">Product</p>
        <ul className="footer-links">
          <li><a href="/#features">Features</a></li>
          <li><a href="/#pricing">Pricing</a></li>
          <li><a href="/#how-it-works">How it works</a></li>
          <li><a href="/signup">Get started</a></li>
        </ul>
      </div>

      <div>
        <p className="footer-col-title">Resources</p>
        <ul className="footer-links">
          <li><a href="/blog">Blog</a></li>
          <li><a href="/login">Sign in</a></li>
          <li><a href="/signup">Sign up</a></li>
          <li><a href="mailto:hello@triageinsight.com">Contact</a></li>
        </ul>
      </div>

      <div>
        <p className="footer-col-title">Company</p>
        <ul className="footer-links">
          <li><a href="#">About</a></li>
          <li><a href="#">Careers</a></li>
          <li><a href="#">Privacy</a></li>
          <li><a href="#">Terms</a></li>
        </ul>
      </div>

    </div>

    <div className="footer-bottom">
      <p className="footer-copy">&copy; 2026 TriageInsight. All rights reserved.</p>
      <div className="footer-legal">
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
      </div>
    </div>
  </div>
</footer>
  );
}




