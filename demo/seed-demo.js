#!/usr/bin/env node
/**
 * TriageInsight Demo Data Seed Script
 * Creates realistic SaaS demo data via the live API
 */

const BASE = 'http://localhost:3000/api/v1';

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    console.error(`  ✗ ${method} ${path} → ${res.status}:`, JSON.stringify(data).slice(0, 300));
    return null;
  }
  return data;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n=== TriageInsight Demo Data Seed ===\n');

  // ─── 1. Sign up Org Admin ──────────────────────────────────────────────────
  console.log('1. Creating org admin: founder@acme.com ...');
  let signupRes = await api('POST', '/auth/signup', {
    firstName: 'John',
    lastName: 'Founder',
    organizationName: 'Acme SaaS',
    email: 'founder@acme.com',
    password: 'Demo1234!',
    planType: 'PRO',
  });

  if (!signupRes) {
    console.log('   Signup failed — trying login (user may already exist)');
    signupRes = await api('POST', '/auth/login', {
      email: 'founder@acme.com',
      password: 'Demo1234!',
    });
  }

  if (!signupRes?.accessToken) {
    console.error('   FATAL: Could not get access token for founder@acme.com');
    process.exit(1);
  }

  const founderToken = signupRes.accessToken;
  console.log('   ✓ Logged in as founder@acme.com');

  // ─── 2. Get workspace info ─────────────────────────────────────────────────
  const workspace = await api('GET', '/workspace/current', null, founderToken);
  if (!workspace) { console.error('   FATAL: Could not get workspace'); process.exit(1); }
  const workspaceId = workspace.id;
  const workspaceSlug = workspace.slug;
  console.log(`   ✓ Workspace: "${workspace.name}" (id=${workspaceId}, slug=${workspaceSlug})`);

  // ─── 3. Invite staff members ───────────────────────────────────────────────
  console.log('\n2. Inviting staff members ...');

  const staffInvites = [
    { email: 'support@acme.com', role: 'EDITOR', firstName: 'Sarah', lastName: 'Support', position: 'Head of Support' },
    { email: 'pm@acme.com', role: 'EDITOR', firstName: 'Mike', lastName: 'Product', position: 'Product Manager' },
  ];

  const inviteTokens = {};
  for (const staff of staffInvites) {
    const inv = await api('POST', '/workspace/current/invite', staff, founderToken);
    if (inv?.inviteToken) {
      inviteTokens[staff.email] = inv.inviteToken;
      console.log(`   ✓ Invited ${staff.email} (token: ${inv.inviteToken.slice(0, 8)}...)`);
    } else {
      console.log(`   ⚠ Could not invite ${staff.email} (may already be invited)`);
    }
    await sleep(200);
  }

  // Accept invites and set passwords
  for (const [email, token] of Object.entries(inviteTokens)) {
    const accept = await api('POST', '/auth/setup-password', { token, password: 'Demo1234!' });
    if (accept?.accessToken) {
      console.log(`   ✓ ${email} accepted invite and set password`);
    }
    await sleep(200);
  }

  // ─── 4. Create Customers ───────────────────────────────────────────────────
  console.log('\n3. Creating customers ...');

  const customersData = [
    { name: 'Alice Chen', companyName: 'TechCorp Inc', email: 'alice@techcorp.com', segment: 'ENTERPRISE', arrValue: 120000, lifecycleStage: 'ACTIVE', churnRisk: 15, accountOwner: 'Mike Product', accountPriority: 'HIGH' },
    { name: 'Bob Martinez', companyName: 'StartupXYZ', email: 'bob@startupxyz.com', segment: 'GROWTH', arrValue: 24000, lifecycleStage: 'ACTIVE', churnRisk: 45, accountOwner: 'Sarah Support', accountPriority: 'MEDIUM' },
    { name: 'Carol Johnson', companyName: 'MidMarket Co', email: 'carol@midmarket.com', segment: 'GROWTH', arrValue: 48000, lifecycleStage: 'ACTIVE', churnRisk: 72, accountOwner: 'Mike Product', accountPriority: 'HIGH' },
    { name: 'David Kim', companyName: 'Enterprise Ltd', email: 'david@enterprise.com', segment: 'ENTERPRISE', arrValue: 200000, lifecycleStage: 'ACTIVE', churnRisk: 8, accountOwner: 'John Founder', accountPriority: 'HIGH' },
    { name: 'Emma Wilson', companyName: 'SMB Solutions', email: 'emma@smbsolutions.com', segment: 'SMB', arrValue: 8400, lifecycleStage: 'ACTIVE', churnRisk: 60, accountOwner: 'Sarah Support', accountPriority: 'MEDIUM' },
    { name: 'Frank Lee', companyName: 'Global Systems', email: 'frank@globalsys.com', segment: 'ENTERPRISE', arrValue: 180000, lifecycleStage: 'ACTIVE', churnRisk: 20, accountOwner: 'John Founder', accountPriority: 'HIGH' },
    { name: 'Grace Park', companyName: 'Innovate Labs', email: 'grace@innovatelabs.com', segment: 'GROWTH', arrValue: 36000, lifecycleStage: 'CHURNED', churnRisk: 95, accountOwner: 'Sarah Support', accountPriority: 'MEDIUM' },
    { name: 'Henry Brown', companyName: 'DataDriven Co', email: 'henry@datadriven.com', segment: 'GROWTH', arrValue: 60000, lifecycleStage: 'ACTIVE', churnRisk: 30, accountOwner: 'Mike Product', accountPriority: 'HIGH' },
  ];

  const customers = [];
  for (const cust of customersData) {
    const c = await api('POST', `/workspaces/${workspaceId}/customers`, cust, founderToken);
    if (c?.id) {
      customers.push(c);
      console.log(`   ✓ Customer: ${c.name} (${c.companyName})`);
    }
    await sleep(100);
  }

  // ─── 5. Create Feedback entries ────────────────────────────────────────────
  console.log('\n4. Creating feedback entries ...');

  const feedbackData = [
    // Feature Requests
    { title: 'Bulk CSV export for all feedback', description: 'We need to be able to export all our feedback data to CSV for offline analysis. Currently we can only view it in the dashboard. This is blocking our quarterly reviews.', sourceType: 'MANUAL', customerId: customers[0]?.id },
    { title: 'Slack integration for real-time alerts', description: 'When a new feedback item is submitted with high priority, we want an instant Slack notification to our #product-alerts channel. This would save us hours of manual monitoring.', sourceType: 'MANUAL', customerId: customers[1]?.id },
    { title: 'Custom fields on feedback forms', description: 'We need to add custom metadata fields to our feedback portal — things like "affected module", "business impact", and "customer tier". Without this, we lose critical context.', sourceType: 'MANUAL', customerId: customers[2]?.id },
    { title: 'SSO / SAML support for enterprise login', description: 'Our security team requires SSO via Okta before we can roll this out company-wide. This is a hard blocker for our Q2 expansion from 5 to 50 seats.', sourceType: 'MANUAL', customerId: customers[3]?.id },
    { title: 'API webhooks for feedback events', description: 'We want to trigger our internal workflows whenever feedback is created, updated, or resolved. A webhook system would let us integrate with Zapier and our custom CRM.', sourceType: 'MANUAL', customerId: customers[4]?.id },
    { title: 'Advanced roadmap filtering by quarter', description: 'The roadmap view needs better filtering. We want to filter by quarter, team, and status simultaneously. Right now we can only filter by one dimension at a time.', sourceType: 'MANUAL', customerId: customers[5]?.id },
    { title: 'Mobile app for feedback submission', description: 'Our field team uses mobile devices exclusively. We need a native mobile app or at minimum a PWA that works offline for submitting feedback from customer sites.', sourceType: 'MANUAL', customerId: customers[6]?.id },
    { title: 'AI-powered duplicate detection', description: 'We are getting hundreds of feedback items per week and many are duplicates. An AI system that automatically flags and merges duplicates would save our PM team 3-4 hours per week.', sourceType: 'MANUAL', customerId: customers[7]?.id },
    // Bug Reports
    { title: 'Dashboard charts not loading on Safari', description: 'All charts on the executive dashboard show a blank white box on Safari 17.x. Chrome and Firefox work fine. This affects 30% of our executive team who use Macs.', sourceType: 'MANUAL', customerId: customers[0]?.id },
    { title: 'Feedback search returns wrong results', description: 'When I search for "integration" in the feedback list, I get results that don\'t contain that word at all. The search seems to be matching on random fields. Reproducible 100% of the time.', sourceType: 'MANUAL', customerId: customers[1]?.id },
    { title: 'Email notifications sent twice for same event', description: 'Every time a new feedback item is submitted, I receive two identical email notifications within seconds of each other. This has been happening for 2 weeks and is flooding my inbox.', sourceType: 'MANUAL', customerId: customers[2]?.id },
    { title: 'CSV import silently drops rows with special characters', description: 'When importing feedback via CSV, any row containing special characters (em dashes, curly quotes, accented letters) is silently dropped. No error message. We lost 200 feedback items this way.', sourceType: 'MANUAL', customerId: customers[3]?.id },
    // Churn Signals
    { title: 'Considering cancellation — too complex for our team', description: 'Our team of 3 is struggling to get value from the platform. The learning curve is steep and we don\'t have a dedicated PM. We are evaluating simpler alternatives. Please reach out before our renewal date.', sourceType: 'MANUAL', customerId: customers[6]?.id },
    { title: 'Pricing increase is not justified by new features', description: 'The recent 40% price increase has us questioning the ROI. We have not seen the AI features that were promised in the roadmap. We need to see a clear product roadmap before our board approves renewal.', sourceType: 'MANUAL', customerId: customers[4]?.id },
    // Positive Feedback
    { title: 'CIQ scoring has transformed our prioritization process', description: 'The Customer Intelligence Quotient scoring is genuinely game-changing. We used to spend 2 days per sprint debating priorities. Now the data speaks for itself and we ship what matters most. 10/10.', sourceType: 'MANUAL', customerId: customers[3]?.id },
    { title: 'Support clustering saved us from a major churn event', description: 'The support spike detection caught a pattern we missed — 15 enterprise customers all hitting the same bug within 48 hours. We fixed it before any of them escalated. This feature alone justifies the cost.', sourceType: 'MANUAL', customerId: customers[5]?.id },
  ];

  const feedbacks = [];
  for (const fb of feedbackData) {
    const f = await api('POST', `/workspaces/${workspaceId}/feedback`, fb, founderToken);
    if (f?.id) {
      feedbacks.push(f);
      console.log(`   ✓ Feedback: "${f.title.slice(0, 50)}..."`);
    }
    await sleep(100);
  }

  // ─── 6. Submit public portal feedback ─────────────────────────────────────
  console.log('\n5. Submitting public portal feedback ...');

  const portalFeedback = [
    { title: 'Would love a dark mode option', description: 'Working late nights and the bright white interface is hard on the eyes. A dark mode toggle would be much appreciated!', email: 'user1@example.com' },
    { title: 'The onboarding flow needs improvement', description: 'I spent 45 minutes trying to figure out how to connect my first integration. The setup wizard is confusing and the help docs are outdated.', email: 'user2@example.com' },
    { title: 'Great product, just needs better mobile support', description: 'Love what you\'re building but the mobile experience is rough. Buttons are too small and the navigation is hard to use on a phone.', email: 'user3@example.com' },
    { title: 'Feature request: team collaboration on feedback items', description: 'Multiple team members should be able to comment and collaborate on a single feedback item. Right now it feels like a solo tool.', email: 'user4@example.com' },
    { title: 'Integration with Jira is broken', description: 'The Jira sync stopped working after your last update. Tickets are no longer being created automatically. This is urgent for our workflow.', email: 'user5@example.com' },
    { title: 'Excellent customer support experience', description: 'Had an issue with my account and the support team resolved it within 2 hours. Really impressed with the responsiveness!', email: 'user6@example.com' },
  ];

  for (const pf of portalFeedback) {
    const f = await api('POST', `/public/feedback/${workspaceSlug}`, pf);
    if (f?.id) {
      console.log(`   ✓ Portal: "${pf.title.slice(0, 50)}..."`);
    }
    await sleep(100);
  }

  // ─── 7. Create Themes ──────────────────────────────────────────────────────
  console.log('\n6. Creating themes ...');

  const themesData = [
    { title: 'Integration & API Ecosystem', description: 'All feedback related to third-party integrations, webhooks, and API capabilities. High ARR impact due to enterprise customer demand.', feedbackIds: feedbacks.slice(1, 2).map(f => f.id).filter(Boolean) },
    { title: 'Enterprise Security & Compliance', description: 'SSO, SAML, audit logs, and compliance requirements from enterprise customers. Blocking expansion for several $100K+ accounts.', feedbackIds: feedbacks.slice(3, 4).map(f => f.id).filter(Boolean) },
    { title: 'Mobile & Cross-Platform Experience', description: 'Mobile app, PWA, and cross-browser compatibility issues. Affects field teams and executives on mobile devices.', feedbackIds: feedbacks.slice(6, 7).map(f => f.id).filter(Boolean) },
    { title: 'AI & Automation Features', description: 'AI-powered duplicate detection, smart clustering, and automated workflows. High demand from growth-tier customers.', feedbackIds: feedbacks.slice(7, 8).map(f => f.id).filter(Boolean) },
    { title: 'Data Export & Reporting', description: 'CSV export, custom reports, and data portability. Blocking quarterly business reviews for multiple enterprise accounts.', feedbackIds: feedbacks.slice(0, 1).map(f => f.id).filter(Boolean) },
    { title: 'Churn Risk & Retention', description: 'Customers expressing dissatisfaction, pricing concerns, or cancellation intent. Requires immediate product and CS attention.', feedbackIds: feedbacks.slice(12, 14).map(f => f.id).filter(Boolean) },
  ];

  const themes = [];
  for (const th of themesData) {
    const t = await api('POST', `/workspaces/${workspaceId}/themes`, th, founderToken);
    if (t?.id) {
      themes.push(t);
      console.log(`   ✓ Theme: "${t.title}"`);
    }
    await sleep(200);
  }

  // ─── 8. Create Roadmap Items ───────────────────────────────────────────────
  console.log('\n7. Creating roadmap items ...');

  const roadmapData = [
    { title: 'Slack & Webhook Integration', description: 'Native Slack integration with configurable alert rules. Webhook API for custom integrations.', status: 'IN_PROGRESS', isPublic: true, themeId: themes[0]?.id, targetQuarter: 'Q2', targetYear: 2026 },
    { title: 'SAML/SSO Enterprise Authentication', description: 'Okta, Azure AD, and Google Workspace SSO support. Required for enterprise seat expansion.', status: 'PLANNED', isPublic: true, themeId: themes[1]?.id, targetQuarter: 'Q2', targetYear: 2026 },
    { title: 'Mobile App (iOS & Android)', description: 'Native mobile app for feedback submission and review. Offline support for field teams.', status: 'EXPLORING', isPublic: true, themeId: themes[2]?.id, targetQuarter: 'Q3', targetYear: 2026 },
    { title: 'AI Duplicate Detection & Merging', description: 'ML-powered duplicate detection with one-click merge. Reduces manual triage time by 80%.', status: 'IN_PROGRESS', isPublic: true, themeId: themes[3]?.id, targetQuarter: 'Q2', targetYear: 2026 },
    { title: 'Advanced CSV Export & Scheduled Reports', description: 'Full data export with custom field selection. Scheduled email reports for stakeholders.', status: 'PLANNED', isPublic: true, themeId: themes[4]?.id, targetQuarter: 'Q2', targetYear: 2026 },
    { title: 'Churn Early Warning System', description: 'Automated churn risk scoring with proactive CS alerts. Integrates with CRM for account health tracking.', status: 'EXPLORING', isPublic: false, themeId: themes[5]?.id, targetQuarter: 'Q3', targetYear: 2026 },
    { title: 'Custom Fields on Feedback Forms', description: 'Admin-configurable metadata fields on public and internal feedback forms.', status: 'PLANNED', isPublic: true, targetQuarter: 'Q3', targetYear: 2026 },
    { title: 'Dark Mode', description: 'System-aware and manual dark mode toggle across the entire application.', status: 'BACKLOG', isPublic: true, targetQuarter: 'Q4', targetYear: 2026 },
  ];

  const roadmapItems = [];
  for (const ri of roadmapData) {
    const r = await api('POST', `/workspaces/${workspaceId}/roadmap`, ri, founderToken);
    if (r?.id) {
      roadmapItems.push(r);
      console.log(`   ✓ Roadmap: "${r.title}" [${r.status}]`);
    }
    await sleep(200);
  }

  // ─── 9. Create Support Tickets via Prisma direct (using API) ──────────────
  console.log('\n8. Creating support tickets ...');

  // Support tickets are created via integrations; we use the Prisma seed approach
  // by directly calling the DB through a seed endpoint if available, or via the
  // support sync endpoint
  const ticketData = [
    { subject: 'Cannot export data to CSV', description: 'Getting a 500 error when trying to export feedback to CSV. This is urgent — we have a board meeting tomorrow.', customerEmail: 'alice@techcorp.com', status: 'OPEN', tags: ['export', 'bug', 'urgent'] },
    { subject: 'Dashboard not loading for new team members', description: 'Three new users I added last week cannot see the dashboard. It just shows a loading spinner forever.', customerEmail: 'david@enterprise.com', status: 'OPEN', tags: ['onboarding', 'bug'] },
    { subject: 'Slack integration setup confusion', description: 'The Slack integration docs say to use a Webhook URL but the UI asks for a Bot Token. Which is correct?', customerEmail: 'bob@startupxyz.com', status: 'RESOLVED', tags: ['integration', 'docs'] },
    { subject: 'Pricing question before renewal', description: 'We are up for renewal next month. Can you explain what changed in the new pricing model? We are currently on the legacy plan.', customerEmail: 'emma@smbsolutions.com', status: 'OPEN', tags: ['billing', 'renewal'] },
    { subject: 'AI clustering not working on imported feedback', description: 'We imported 500 feedback items via CSV last week but the AI clustering has not run on them. The themes page still shows 0 items.', customerEmail: 'carol@midmarket.com', status: 'OPEN', tags: ['ai', 'clustering', 'import'] },
    { subject: 'Feature request: bulk status update', description: 'We need to be able to select 50 feedback items and change their status to "In Progress" in one click. Currently we have to do it one by one.', customerEmail: 'frank@globalsys.com', status: 'OPEN', tags: ['feature-request', 'bulk-actions'] },
    { subject: 'Considering downgrading plan', description: 'The PRO plan features we were promised are not available yet. We are considering downgrading to FREE until the roadmap items ship.', customerEmail: 'grace@innovatelabs.com', status: 'OPEN', tags: ['churn-risk', 'billing', 'escalation'] },
    { subject: 'API rate limits too restrictive', description: 'We are hitting the 100 req/min API rate limit constantly. Our integration makes burst requests when syncing data. Can this be increased?', customerEmail: 'henry@datadriven.com', status: 'OPEN', tags: ['api', 'rate-limit'] },
    { subject: 'SSO implementation timeline', description: 'Our security audit is in 6 weeks. Is SSO on the roadmap for Q2? If not, we may need to pause our enterprise rollout.', customerEmail: 'david@enterprise.com', status: 'OPEN', tags: ['sso', 'enterprise', 'urgent'] },
    { subject: 'Duplicate notifications issue', description: 'I am receiving 2-3 email notifications for every single feedback submission. My inbox is flooded. Please fix ASAP.', customerEmail: 'alice@techcorp.com', status: 'RESOLVED', tags: ['bug', 'notifications'] },
  ];

  // Use the Prisma client directly via a seed script
  const seedTicketsScript = `
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const workspace = await prisma.workspace.findFirst({ where: { slug: '${workspaceSlug}' } });
  if (!workspace) { console.error('Workspace not found'); process.exit(1); }
  const tickets = ${JSON.stringify(ticketData)};
  let count = 0;
  for (const t of tickets) {
    try {
      await prisma.supportTicket.create({
        data: {
          workspaceId: workspace.id,
          externalId: 'DEMO-' + Date.now() + '-' + Math.random().toString(36).slice(2),
          provider: 'ZENDESK',
          subject: t.subject,
          description: t.description,
          customerEmail: t.customerEmail,
          status: t.status,
          tags: t.tags,
          arrValue: Math.floor(Math.random() * 150000) + 10000,
          externalCreatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        }
      });
      count++;
    } catch(e) { console.error('Ticket error:', e.message); }
  }
  console.log('Created ' + count + ' support tickets');
  await prisma.$disconnect();
}
main().catch(console.error);
`;

  const fs = require('fs');
  fs.writeFileSync('/tmp/seed-tickets.js', seedTicketsScript);
  console.log('   Support tickets will be seeded via Prisma script');

  // ─── 10. Summary ──────────────────────────────────────────────────────────
  console.log('\n=== Seed Complete ===');
  console.log(`Workspace: ${workspace.name} (slug: ${workspaceSlug})`);
  console.log(`Workspace ID: ${workspaceId}`);
  console.log(`Customers: ${customers.length}`);
  console.log(`Feedback: ${feedbacks.length}`);
  console.log(`Themes: ${themes.length}`);
  console.log(`Roadmap Items: ${roadmapItems.length}`);
  console.log('\nCredentials:');
  console.log('  Admin:   founder@acme.com / Demo1234!');
  console.log('  Support: support@acme.com / Demo1234!');
  console.log('  PM:      pm@acme.com / Demo1234!');
  console.log(`\nWorkspace Slug: ${workspaceSlug}`);

  // Save seed data for use in Playwright script
  const seedData = {
    workspaceId,
    workspaceSlug,
    founderToken,
    customers: customers.map(c => ({ id: c.id, name: c.name, email: c.email })),
    feedbacks: feedbacks.map(f => ({ id: f.id, title: f.title })),
    themes: themes.map(t => ({ id: t.id, title: t.title })),
    roadmapItems: roadmapItems.map(r => ({ id: r.id, title: r.title })),
  };
  fs.writeFileSync('/tmp/seed-data.json', JSON.stringify(seedData, null, 2));
  console.log('\nSeed data saved to /tmp/seed-data.json');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
