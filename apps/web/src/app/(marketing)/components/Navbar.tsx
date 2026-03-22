"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on route hash click
  const closeMobile = () => setOpen(false);

  return (
    <nav id="navbar" className={scrolled ? "scrolled" : ""}>
      <div className="container">
        <div className="nav-inner">
          <Link href="/" className="nav-logo" aria-label="TriageInsight home">
            {/* Logo SVG (fixed React attribute names) */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="180"
              height="40"
              viewBox="0 0 1400 420"
              aria-label="Triage Insight logo"
              role="img"
            >
              <defs>
                <linearGradient id="gIconBlog" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#1E3A8A" />
                  <stop offset="50%" stopColor="#0EA5E9" />
                  <stop offset="100%" stopColor="#2DD4BF" />
                </linearGradient>
                <linearGradient id="gInsightBlog" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22D3EE" />
                  <stop offset="100%" stopColor="#2DD4BF" />
                </linearGradient>
              </defs>

              <g transform="translate(80,40)">
                <rect x="0" y="0" rx="60" ry="60" width="260" height="260" fill="url(#gIconBlog)" />
                <rect x="55" y="50" rx="25" ry="25" width="150" height="150" fill="#ffffff" />
                <rect x="85" y="135" width="20" height="40" fill="#0F172A" />
                <rect x="115" y="120" width="20" height="55" fill="#0F172A" />
                <rect x="145" y="100" width="20" height="75" fill="#0F172A" />
                <path d="M75 150 Q130 120 185 85" stroke="#22D3EE" strokeWidth="8" fill="none" />
                <circle cx="185" cy="85" r="8" fill="#22D3EE" />
              </g>

              <text
                x="420"
                y="220"
                fontSize="130"
                fontFamily="Inter, system-ui, sans-serif"
                fontWeight="700"
                fill="#0A2540"
              >
                Triage
              </text>
              <text
                x="840"
                y="220"
                fontSize="130"
                fontFamily="Inter, system-ui, sans-serif"
                fontWeight="700"
                fill="url(#gInsightBlog)"
              >
                Insight
              </text>
            </svg>
          </Link>

          <ul className="nav-links" role="list">
            <li>
              <a href="/#features">Features</a>
            </li>
            <li>
              <a href="/#how-it-works">How it works</a>
            </li>
            <li>
              <a href="/#pricing">Pricing</a>
            </li>
            <li>
              <Link href="/blog">Blog</Link>
            </li>
          </ul>

          <div className="nav-cta">
            <Link href="/login" className="nav-signin">
              Sign in
            </Link>
            <a href="/signup?plan=FREE" className="btn btn-yellow btn-sm">
              Start free trial
            </a>
          </div>

          <button
            className="nav-toggle"
            id="navToggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open ? "true" : "false"}
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            {!open ? (
              <svg id="iconMenu" width="22" height="22" viewBox="0 0 22 22" fill="none">
                <line x1="3" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="3" y1="11" x2="19" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="3" y1="16" x2="19" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg id="iconClose" width="22" height="22" viewBox="0 0 22 22" fill="none">
                <line x1="4" y1="4" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="4" x2="4" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>

        <div className={`nav-mobile ${open ? "open" : ""}`} id="navMobile" role="navigation" aria-label="Mobile navigation">
          <a href="/#features" onClick={closeMobile}>
            Features
          </a>
          <a href="/#how-it-works" onClick={closeMobile}>
            How it works
          </a>
          <a href="/#pricing" onClick={closeMobile}>
            Pricing
          </a>
          <Link href="/blog" onClick={closeMobile}>
            Blog
          </Link>

          <div className="nav-mobile-cta">
            <Link href="/login" className="btn btn-outline-teal btn-sm" onClick={closeMobile}>
              Sign in
            </Link>
            <a href="/signup?plan=FREE" className="btn btn-yellow btn-sm" onClick={closeMobile}>
              Start free trial
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}