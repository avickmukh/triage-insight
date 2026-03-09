export default function HomePage() {
  return (
    <main>
<section id="hero">
  <div className="hero-glow"></div>
  <div className="hero-grid"></div>

  <div className="container">
    <div className="hero-content">
      <div className="fade-up" style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
        <span className="hero-badge">
          <span className="hero-badge-dot"></span>
          AI-Powered Feedback Intelligence
        </span>
      </div>

      <h1 className="hero-headline fade-up fade-up-delay-1">
        Turn feedback noise into<br/>
        <span className="teal">product clarity.</span>
      </h1>

      <p className="hero-subtext fade-up fade-up-delay-2">
        AI-powered triage that automatically deduplicates, clusters, and prioritizes customer feedback so you know exactly what to build next.
      </p>

      <div className="hero-buttons fade-up fade-up-delay-3">
        <a href="#pricing" className="btn btn-yellow">
          Start free trial
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <a href="#how-it-works" className="btn btn-outline-white">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
            <polygon points="6.5,5.5 11,8 6.5,10.5" fill="currentColor"/>
          </svg>
          See how it works
        </a>
      </div>

      <p className="hero-trust fade-up fade-up-delay-4">
        No credit card required &nbsp;•&nbsp; 14-day free trial &nbsp;•&nbsp; Cancel anytime
      </p>
    </div>

    <div className="hero-mockup-wrap fade-up fade-up-delay-4">
      <div className="hero-mockup-glow"></div>
      <div className="hero-mockup-img">
        <img
          src="https://private-us-east-1.manuscdn.com/sessionFile/L3VX7wDEeNJ7TK9BI99ZaV/sandbox/ETlcTfKWKGzisYHDoP3HfX-img-1_1771674752000_na1fn_aGVyby1kYXNoYm9hcmQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvTDNWWDd3REVlTko3VEs5Qkk5OVphVi9zYW5kYm94L0VUbGNUZktXS0d6aXNZSERvUDNIZlgtaW1nLTFfMTc3MTY3NDc1MjAwMF9uYTFmbl9hR1Z5Ynkxa1lYTm9ZbTloY21RLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=bKJWt~NH~yokPBCeZAAgxoUM8pqY-6PP~a3mp8FAHf-S2EWzVxwJ1fIazw9VwomnDat4ZqgMc-rNQC6qnmCn7heyjfGvXt6Dp8AgrxoOz3DISKiWfRg4PuJ8GKO3n8thF0rxq9f-6fXFUwDsVy5OlwHleCNP03WLmiUrrDN~tbPiFEp2IxaGHg~q~pDtNQLiy5sXyFPBGNcyGIUgvTpBRX7ZSHcYaR2Y~r~MTfAuXIouiHAxI9bqlRQsT3Xi~dFU0n5FY7aX~i8AqAOmkKqKSpuxEBc3KK256P5tF3rI57cuTohK23VjYKQleodAE1Qn1H0wHO~jpdS2RsfBncyUew__"
          alt="TriageInsight dashboard showing raw feedback being triaged into organised themes"
          loading="eager"
          width="900"
        />
      </div>
    </div>
  </div>

  <div className="hero-wave">
    <svg viewBox="0 0 1440 80" preserveAspectRatio="none" fill="#F8F9FA">
      <path d="M0,80 C360,0 1080,80 1440,20 L1440,80 Z"/>
    </svg>
  </div>
</section>
<section id="logo-cloud">
  <div className="container">
    <p className="logo-cloud-label">Trusted by founders who've had enough of feedback chaos</p>
    <div className="logo-cloud-grid fade-up">
      <div className="logo-item">
        <div className="logo-avatar" style={{ background: '#4A90D9' }}>SF</div>
        <span className="logo-name">SaaSFlow</span>
      </div>
      <div className="logo-item">
        <div className="logo-avatar" style={{ background: '#E85D4A' }}>Bd</div>
        <span className="logo-name">Buildr</span>
      </div>
      <div className="logo-item">
        <div className="logo-avatar" style={{ background: '#7B61FF' }}>CS</div>
        <span className="logo-name">ClientScope</span>
      </div>
      <div className="logo-item">
        <div className="logo-avatar" style={{ background: '#20A4A4' }}>MQ</div>
        <span className="logo-name">MetricHQ</span>
      </div>
      <div className="logo-item">
        <div className="logo-avatar" style={{ background: '#F5A623' }}>LP</div>
        <span className="logo-name">LaunchPad</span>
      </div>
      <div className="logo-item">
        <div className="logo-avatar" style={{ background: '#2ECC71' }}>UF</div>
        <span className="logo-name">UserFirst</span>
      </div>
    </div>
    <p className="logo-cloud-note fade-up fade-up-delay-1">
      Join <strong>200+ SaaS teams</strong> already using TriageInsight
    </p>
  </div>
</section>
<section id="problem">
  <div className="container">
    <div className="problem-grid">

      <div className="fade-up">
        <span className="section-label">The Problem</span>
        <h2 className="problem-headline">
          Feature requests are everywhere.
          <span className="red"> The signal is buried.</span>
        </h2>
        <p className="problem-subtext">You're not alone — every growing SaaS hits this wall.</p>

        <ul className="pain-list">
          <li className="pain-item">
            <div className="pain-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M2 4h16M2 8h10M2 12h12M2 16h8" stroke="#E85D4A" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="pain-text">Feedback in email, support tickets, Slack, and sales calls</p>
          </li>
          <li className="pain-item">
            <div className="pain-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="8" stroke="#E85D4A" strokeWidth="2"/>
                <path d="M7 10h6M10 7v6" stroke="#E85D4A" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="pain-text">The same request appears 10+ times with different wording</p>
          </li>
          <li className="pain-item">
            <div className="pain-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="8" stroke="#E85D4A" strokeWidth="2"/>
                <path d="M10 6v4l3 3" stroke="#E85D4A" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="pain-text">Hours wasted manually triaging duplicates</p>
          </li>
          <li className="pain-item">
            <div className="pain-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 17L7 11L11 14L15 8L17 10" stroke="#E85D4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="17" cy="5" r="2" fill="#E85D4A"/>
              </svg>
            </div>
            <p className="pain-text">No data to justify roadmap decisions</p>
          </li>
        </ul>
      </div>

      <div className="fade-up fade-up-delay-2">
        <div className="problem-visual">
          <span className="problem-visual-badge">Before TriageInsight</span>
          <img
            src="https://private-us-east-1.manuscdn.com/sessionFile/L3VX7wDEeNJ7TK9BI99ZaV/sandbox/ETlcTfKWKGzisYHDoP3HfX-img-2_1771674752000_na1fn_Y2hhb3MtdmlzdWFs.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvTDNWWDd3REVlTko3VEs5Qkk5OVphVi9zYW5kYm94L0VUbGNUZktXS0d6aXNZSERvUDNIZlgtaW1nLTJfMTc3MTY3NDc1MjAwMF9uYTFmbl9ZMmhoYjNNdGRtbHpkV0ZzLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=mKphA6592xbPn-O-jYk3cZuzmj7mxMe7HoB4L6UH9F0~0UwGVXFgd9NeXwdgakhUzE-uLZvoaqhYAV6TzxKD7YY3AWYthhmSWj~GKJaeoWUY3pqLcpJnW~-1LISBzOepHB4SLggEMnADvh-6vGw-Iys77n4bB0L-OLeKiwxxK-DC~jrB3vsSClFC0wBG62R7FUyQb2bVU70weLQuuCosD5ZJldWS8ieUWubzhS2a1IT65dI3WN3YaPlqmMGazYYGgmF3ogVqKprts1JzdLkmuywQ7nLfDefF2uq2pBIv5Xga4TpCzrzpNptSgzwOCo~2aHu-9ONl55m9UiAqLkoU5g__"
            alt="Chaotic overlapping feedback sticky notes"
            loading="lazy"
            width="600"
          />
        </div>
      </div>

    </div>
  </div>
</section>
<section id="how-it-works">
  <div className="container">
    <div className="section-header fade-up">
      <span className="section-label">How It Works</span>
      <h2 className="section-headline">
        TriageInsight brings order to chaos.
        <span className="teal"> Automatically.</span>
      </h2>
      <p className="section-subtext">Three steps from noise to clarity.</p>
    </div>

    <div className="steps-grid">

      <div className="step-card fade-up fade-up-delay-1" style={{ position: 'relative' }}>
        <span className="step-number-bg">01</span>
        <span className="section-label">Capture</span>
        <div className="step-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="22" height="18" rx="3" stroke="#20A4A4" strokeWidth="2"/>
            <path d="M8 11h12M8 15h8" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round"/>
            <path d="M14 23v3M11 26h6" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <h3 className="step-title">Capture</h3>
        <p className="step-desc">Collect feedback from your portal, email, Slack, or CSV. One unified inbox.</p>
        <div className="step-connector" style={{ right: '-1.25rem' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <div className="step-card fade-up fade-up-delay-2" style={{ position: 'relative' }}>
        <span className="step-number-bg">02</span>
        <span className="section-label">AI Triage</span>
        <div className="step-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="9"  cy="9"  r="5" stroke="#20A4A4" strokeWidth="2"/>
            <circle cx="19" cy="9"  r="5" stroke="#20A4A4" strokeWidth="2"/>
            <ellipse cx="14" cy="9" rx="3" ry="3" fill="#20A4A4" fillOpacity="0.3"/>
            <circle cx="14" cy="9" r="2" fill="#20A4A4"/>
            <path d="M7 20c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <h3 className="step-title">AI Triage</h3>
        <p className="step-desc">AI automatically detects duplicates, clusters themes, and generates summaries. You approve the merges.</p>
        <div className="step-connector" style={{ right: '-1.25rem' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <div className="step-card fade-up fade-up-delay-3">
        <span className="step-number-bg">03</span>
        <span className="section-label">Prioritize</span>
        <div className="step-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="22" height="22" rx="3" stroke="#20A4A4" strokeWidth="2"/>
            <path d="M9 14l3.5 3.5L19 10" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 7h10M9 21h6" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
          </svg>
        </div>
        <h3 className="step-title">Prioritize &amp; Close the Loop</h3>
        <p className="step-desc">See what matters most. Update your public roadmap. Customers get notified when their feature ships.</p>
      </div>

    </div>
  </div>
</section>
<section id="features">
  <div className="container">
    <div className="section-header fade-up">
      <span className="section-label">Features</span>
      <h2 className="section-headline">Everything you need to master feedback</h2>
      <p className="section-subtext">Stop guessing. Start building what matters.</p>
    </div>

    <div className="features-grid">

      <div className="feature-card fade-up fade-up-delay-1">
        <div className="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="8"  cy="8" r="4" stroke="#20A4A4" strokeWidth="2"/>
            <circle cx="16" cy="8" r="4" stroke="#20A4A4" strokeWidth="2"/>
            <ellipse cx="12" cy="8" rx="2.5" ry="2.5" fill="#20A4A4" fillOpacity="0.3"/>
            <circle cx="12" cy="8" r="1.5" fill="#20A4A4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h3 className="feature-title">AI-Powered Deduplication</h3>
          <p className="feature-desc">Our AI automatically suggests duplicates, so you merge once instead of reading the same request 20 times.</p>
        </div>
      </div>

      <div className="feature-card fade-up fade-up-delay-2">
        <div className="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3"  y="3"  width="8" height="8" rx="2" stroke="#20A4A4" strokeWidth="2"/>
            <rect x="13" y="3"  width="8" height="8" rx="2" stroke="#20A4A4" strokeWidth="2"/>
            <rect x="3"  y="13" width="8" height="8" rx="2" stroke="#20A4A4" strokeWidth="2"/>
            <rect x="13" y="13" width="8" height="8" rx="2" stroke="#20A4A4" strokeWidth="2"/>
          </svg>
        </div>
        <div>
          <h3 className="feature-title">Smart Theme Clustering</h3>
          <p className="feature-desc">Related feedback is grouped into themes with AI-generated summaries. See the forest, not just the trees.</p>
        </div>
      </div>

      <div className="feature-card fade-up fade-up-delay-1">
        <div className="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#20A4A4" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <h3 className="feature-title">Revenue-Weighted Prioritization</h3>
          <p className="feature-desc">Not all customers are equal. Weight feedback by customer value and see what impacts your bottom line.</p>
        </div>
      </div>

      <div className="feature-card fade-up fade-up-delay-2">
        <div className="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="#20A4A4" strokeWidth="2"/>
            <path d="M3 9h18" stroke="#20A4A4" strokeWidth="2"/>
            <path d="M8 2v4M16 2v4" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round"/>
            <path d="M7 14h4M7 17h6" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h3 className="feature-title">Automated Weekly Digest</h3>
          <p className="feature-desc">Every Monday, get an email with top themes, rising requests, and suggested roadmap priorities.</p>
        </div>
      </div>

      <div className="feature-card fade-up fade-up-delay-1">
        <div className="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 12h18M3 6h18M3 18h12" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="20" cy="18" r="3" stroke="#20A4A4" strokeWidth="2"/>
            <path d="M18.5 18l1 1 2-2" stroke="#20A4A4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <h3 className="feature-title">Public Roadmap + Customer Notifications</h3>
          <p className="feature-desc">Show customers what's coming. When a feature ships, voters get notified automatically. Close the loop.</p>
        </div>
      </div>

      <div className="feature-card fade-up fade-up-delay-2">
        <div className="feature-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#20A4A4" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M9 12l2 2 4-4" stroke="#20A4A4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <h3 className="feature-title">Zero-Storage Architecture</h3>
          <p className="feature-desc">Your customer data never leaves your control. Enterprise-grade security by design.</p>
        </div>
      </div>

    </div>
  </div>
</section>
<section id="before-after">
  <div className="container">
    <div className="section-header fade-up">
      <span className="section-label">Before vs. After</span>
      <h2 className="section-headline">See the difference in 5 minutes</h2>
    </div>

    <div className="ba-grid">

      <div className="ba-panel fade-up fade-up-delay-1">
        <div className="ba-header before-hdr">
          <span className="ba-dot red"></span>
          <span className="ba-header-label">Without TriageInsight</span>
        </div>
        <div className="ba-body">
          <div className="ba-item"><span className="ba-item-dot"></span>API integration</div>
          <div className="ba-item"><span className="ba-item-dot"></span>API</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Integrate with API please</div>
          <div className="ba-item"><span className="ba-item-dot"></span>API access needed</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Need API access</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Export to CSV</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Can we export data?</div>
          <div className="ba-item"><span className="ba-item-dot"></span>CSV export feature</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Slack notifications</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Slack alerts please</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Notify via Slack</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Mobile app</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Mobile version</div>
          <div className="ba-item"><span className="ba-item-dot"></span>iOS app please</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Android app</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Dark mode</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Dark theme</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Need dark mode</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Dashboard export</div>
          <div className="ba-item"><span className="ba-item-dot"></span>Better dark mode</div>
        </div>
        <div className="ba-footer before-ftr">
          <span className="ba-footer-text">20 unorganised requests</span>
        </div>
      </div>
      <div className="ba-arrow-wrap fade-up fade-up-delay-2">
        <span className="ba-arrow-label">AI Triage</span>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M4 16h24M20 8l8 8-8 8" stroke="#20A4A4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="ba-panel after fade-up fade-up-delay-3">
        <div className="ba-header after-hdr">
          <span className="ba-dot teal"></span>
          <span className="ba-header-label">With TriageInsight</span>
        </div>
        <div className="ba-body">
          <div className="ba-theme">
            <div className="ba-theme-header">
              <span className="ba-theme-name">API Integrations</span>
              <span className="ba-theme-badge">12 requests</span>
            </div>
            <div className="ba-progress-track"><div className="ba-progress-fill" style={{ width: '85%' }}></div></div>
          </div>
          <div className="ba-theme">
            <div className="ba-theme-header">
              <span className="ba-theme-name">Dashboard Export</span>
              <span className="ba-theme-badge">8 requests</span>
            </div>
            <div className="ba-progress-track"><div className="ba-progress-fill" style={{ width: '65%' }}></div></div>
          </div>
          <div className="ba-theme">
            <div className="ba-theme-header">
              <span className="ba-theme-name">Slack Notifications</span>
              <span className="ba-theme-badge">5 requests</span>
            </div>
            <div className="ba-progress-track"><div className="ba-progress-fill" style={{ width: '40%' }}></div></div>
          </div>
          <div className="ba-theme">
            <div className="ba-theme-header">
              <span className="ba-theme-name">Mobile App</span>
              <span className="ba-theme-badge">3 requests</span>
            </div>
            <div className="ba-progress-track"><div className="ba-progress-fill" style={{ width: '25%' }}></div></div>
          </div>
        </div>
        <div className="ba-footer after-ftr">
          <span className="ba-footer-text">4 clear themes identified</span>
        </div>
      </div>

    </div>
  </div>
</section>
<section id="testimonials">
  <div className="container">
    <div className="section-header fade-up">
      <span className="section-label">Testimonials</span>
      <h2 className="section-headline">Loved by founders who were drowning in feedback</h2>
    </div>

    <div className="testimonials-grid">

      <div className="testimonial-card fade-up fade-up-delay-1">
        <div className="stars" aria-label="5 stars">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
        </div>
        <p className="testimonial-quote">"We had feature requests in 5 different places. TriageInsight found 40% were duplicates. Saved us weeks of work."</p>
        <div className="testimonial-author">
          <div className="author-avatar" style={{ background: '#E85D4A' }}>SC</div>
          <div>
            <p className="author-name">Sarah Chen</p>
            <p className="author-title">Founder, Buildr</p>
          </div>
        </div>
      </div>

      <div className="testimonial-card fade-up fade-up-delay-2">
        <div className="stars" aria-label="5 stars">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
        </div>
        <p className="testimonial-quote">"The weekly digest is worth the price alone. I finally know what customers actually want."</p>
        <div className="testimonial-author">
          <div className="author-avatar" style={{ background: '#20A4A4' }}>MW</div>
          <div>
            <p className="author-name">Marcus Williams</p>
            <p className="author-title">Head of Product, MetricHQ</p>
          </div>
        </div>
      </div>

      <div className="testimonial-card fade-up fade-up-delay-3">
        <div className="stars" aria-label="5 stars">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#FFC857"><path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10l-3.6 1.9.7-4L2.2 5.2l4-.6z"/></svg>
        </div>
        <p className="testimonial-quote">"Our customers love getting notified when their requested features ship. It's like magic."</p>
        <div className="testimonial-author">
          <div className="author-avatar" style={{ background: '#7B61FF' }}>AR</div>
          <div>
            <p className="author-name">Alex Rivera</p>
            <p className="author-title">CEO, ClientScope</p>
          </div>
        </div>
      </div>

    </div>
  </div>
</section>
<section id="pricing">
  <div className="container">
    <div className="section-header fade-up">
      <span className="section-label">Pricing</span>
      <h2 className="section-headline">Simple, transparent pricing</h2>
      <p className="section-subtext">Start free. Upgrade when you grow.</p>
    </div>

    <div className="pricing-grid">

      {/* Starter */}
      <div className="pricing-card fade-up fade-up-delay-1">
        <p className="pricing-tier">Starter</p>
        <div className="pricing-price">
          <span className="pricing-amount">$29</span>
          <span className="pricing-period">/month</span>
        </div>
        <p className="pricing-desc">Best for early-stage SaaS, 1–3 users</p>
        <ul className="pricing-features">
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Public feedback portal
          </li>
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            AI deduplication (up to 500 items/month)
          </li>
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Theme clustering
          </li>
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Public roadmap
          </li>
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Email notifications
          </li>
        </ul>
        <a href="#" className="btn btn-outline-teal" style={{ justifyContent: 'center' }}>Start free trial</a>
      </div>
      <div className="pricing-card featured fade-up fade-up-delay-2">
        <span className="pricing-badge">Most Popular</span>
        <p className="pricing-tier">Pro</p>
        <div className="pricing-price">
          <span className="pricing-amount">$79</span>
          <span className="pricing-period">/month</span>
        </div>
        <p className="pricing-desc">Best for growing teams, 3–10 users</p>
        <ul className="pricing-features">
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Everything in Starter
          </li>
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            AI deduplication (unlimited)
          </li>
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Weekly digest email
          </li>
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            CSV import/export
          </li>
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Slack / email integration
          </li>
          <li className="pricing-feature">
            <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#20A4A4" fillOpacity="0.12"/>
              <path d="M5 8l2.5 2.5L11 5.5" stroke="#20A4A4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Priority support
          </li>
        </ul>
        <a href="#" className="btn btn-teal" style={{ justifyContent: 'center' }}>Start free trial</a>
      </div>

    </div>
    <p className="pricing-note">
      All plans include a <strong>14-day free trial</strong>. No credit card required for trial.
    </p>
  </div>
</section>

<section id="cta">
  <div className="cta-glow"></div>
  <div className="container cta-content">
    <span className="section-label fade-up">Get Started Today</span>
    <h2 className="cta-headline fade-up fade-up-delay-1">Stop guessing what to build next.</h2>
    <p className="cta-subtext fade-up fade-up-delay-2">
      Join 200+ SaaS teams who've found clarity with TriageInsight.
    </p>
    <div className="cta-buttons fade-up fade-up-delay-3">
      <a href="#pricing" className="btn btn-yellow">
        Start your free trial
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </a>
    </div>
    <p className="cta-trust fade-up fade-up-delay-4">
      No credit card required &nbsp;•&nbsp; 14-day free trial &nbsp;•&nbsp; Cancel anytime
    </p>
  </div>
</section>
    </main>
  );
}