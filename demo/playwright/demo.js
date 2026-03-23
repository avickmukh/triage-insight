/**
 * TriageInsight Demo Automation Script
 * Records a full end-to-end product demo video
 * 
 * Strategy: Pre-seed localStorage + cookies via storageState so the
 * Next.js middleware and React Query both see a valid auth token from
 * the very first page load.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const BASE = 'http://localhost:3002';
const API_BASE = 'http://localhost:3000/api/v1';
const ORG_SLUG = 'acme-saas';
const ADMIN_EMAIL = 'founder@acme.com';
const ADMIN_PASSWORD = 'Demo1234!';

const VIDEO_DIR = '/home/ubuntu/demo-recorder/videos';
fs.mkdirSync(VIDEO_DIR, { recursive: true });

async function pause(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function smoothScroll(page, direction = 'down', amount = 400) {
  await page.evaluate(({ dir, amt }) => {
    window.scrollBy({ top: dir === 'down' ? amt : -amt, behavior: 'smooth' });
  }, { dir: direction, amt: amount });
  await pause(800);
}

async function waitForContent(page, timeout = 12000) {
  // Wait for the loading spinner to disappear
  try {
    await page.waitForFunction(() => {
      const body = document.body.innerText || '';
      return !body.includes('Loading workspace…') && document.readyState === 'complete';
    }, { timeout });
  } catch {
    // If timeout, just continue
  }
  await pause(800);
}

async function snap(page, name) {
  try {
    await page.screenshot({ path: `/home/ubuntu/demo-recorder/snap-${name}.png`, fullPage: false });
    console.log(`   📸 snap-${name}.png`);
  } catch {}
}

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(url, options, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Starting TriageInsight Demo Recording...\n');

  // Get auth tokens
  const tokens = await httpPost(`${API_BASE}/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  if (!tokens.accessToken) {
    console.error('Failed to get auth tokens:', tokens);
    process.exit(1);
  }
  console.log('Got auth tokens for', ADMIN_EMAIL);
  const { accessToken, refreshToken } = tokens;

  // Build storageState with tokens pre-seeded
  const storageState = {
    cookies: [
      {
        name: 'accessToken',
        value: encodeURIComponent(accessToken),
        domain: 'localhost',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 900,
        httpOnly: false,
        secure: false,
        sameSite: 'Strict',
      },
    ],
    origins: [
      {
        origin: BASE,
        localStorage: [
          { name: 'accessToken', value: accessToken },
          { name: 'refreshToken', value: refreshToken },
        ],
      },
    ],
  };

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,900',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState,
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 900 },
    },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  page.on('console', () => {}); // suppress

  async function goTo(url, label) {
    console.log(`\n   → ${label}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {
      console.log(`   ⚠ Navigation timeout for ${label}, continuing...`);
    }
    await waitForContent(page, 15000);
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Landing Page — show the product homepage
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 1: Landing Page ===');
    await goTo(`${BASE}/`, 'Landing Page');
    await pause(2000);
    await snap(page, '01-landing');

    await smoothScroll(page, 'down', 500);
    await pause(1500);
    await smoothScroll(page, 'down', 500);
    await pause(1500);
    await smoothScroll(page, 'down', 500);
    await pause(2000);
    await smoothScroll(page, 'up', 1500);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Login Page — show the login UI
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 2: Login Page ===');
    await goTo(`${BASE}/login`, 'Login Page');
    await pause(1500);
    await snap(page, '02-login');

    // Fill login form with human-like typing
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.isVisible({ timeout: 3000 })) {
      await emailInput.click();
      await pause(400);
      for (const ch of ADMIN_EMAIL) {
        await emailInput.type(ch, { delay: 50 + Math.random() * 30 });
      }
      await pause(600);
    }

    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.isVisible({ timeout: 3000 })) {
      await passwordInput.click();
      await pause(400);
      for (const ch of ADMIN_PASSWORD) {
        await passwordInput.type(ch, { delay: 50 + Math.random() * 30 });
      }
      await pause(800);
    }
    await snap(page, '03-login-filled');

    // Click Sign in
    const loginBtn = page.locator('button[type="submit"]').first();
    if (await loginBtn.isVisible({ timeout: 3000 })) {
      await loginBtn.click();
    }
    await pause(3000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Admin Dashboard
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 3: Admin Dashboard ===');
    await goTo(`${BASE}/${ORG_SLUG}/app`, 'Dashboard');
    await pause(3000);
    await snap(page, '04-dashboard');
    console.log('   URL after nav:', page.url());

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 800);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Team Members
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 4: Team Members ===');
    await goTo(`${BASE}/${ORG_SLUG}/admin/members`, 'Members');
    await pause(2000);
    await snap(page, '05-members');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 400);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Public Portal
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 5: Public Portal ===');
    await goTo(`${BASE}/${ORG_SLUG}/portal/feedback`, 'Portal');
    await pause(2000);
    await snap(page, '06-portal');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 400);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Submit Feedback
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 6: Submit Feedback ===');
    await goTo(`${BASE}/${ORG_SLUG}/portal/feedback/new`, 'New Feedback');
    await pause(2000);
    await snap(page, '07-portal-new');

    try {
      const inputs = page.locator('input:not([type="hidden"]):not([type="submit"])');
      const inputCount = await inputs.count();
      if (inputCount > 0) {
        await inputs.first().click();
        await pause(300);
        await inputs.first().fill('Need better API rate limits for enterprise integrations');
        await pause(500);
      }

      const textareas = page.locator('textarea');
      if (await textareas.count() > 0) {
        await textareas.first().click();
        await pause(300);
        await textareas.first().fill('Our enterprise integration hits the rate limit constantly during peak hours. We need at least 500 req/min to support our team of 200 users syncing data in real-time. This is blocking our Q2 rollout.');
        await pause(800);
      }
      await snap(page, '08-portal-filled');
    } catch (e) {
      console.log('   Portal form fill (non-fatal):', e.message.slice(0, 80));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Feedback Inbox + Themes
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 7: Feedback Inbox + Themes ===');
    await goTo(`${BASE}/${ORG_SLUG}/app/inbox`, 'Inbox');
    await pause(2000);
    await snap(page, '09-inbox');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 800);
    await pause(1000);

    await goTo(`${BASE}/${ORG_SLUG}/app/themes`, 'Themes');
    await pause(2000);
    await snap(page, '10-themes');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 400);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: AI Intelligence
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 8: AI Intelligence ===');
    await goTo(`${BASE}/${ORG_SLUG}/app/intelligence`, 'Intelligence');
    await pause(2000);
    await snap(page, '11-intelligence');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 800);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 9: Support Intelligence
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 9: Support Intelligence ===');
    await goTo(`${BASE}/${ORG_SLUG}/app/support`, 'Support');
    await pause(2000);
    await snap(page, '12-support');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 800);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 10: Support Tickets
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 10: Support Tickets ===');
    await goTo(`${BASE}/${ORG_SLUG}/app/support/tickets`, 'Tickets');
    await pause(2000);
    await snap(page, '13-tickets');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 800);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 11: Churn Intelligence
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 11: Churn Intelligence ===');
    await goTo(`${BASE}/${ORG_SLUG}/app/risk`, 'Churn Risk');
    await pause(2000);
    await snap(page, '14-churn-risk');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 800);
    await pause(1000);

    await goTo(`${BASE}/${ORG_SLUG}/app/customers`, 'Customers');
    await pause(2000);
    await snap(page, '15-customers');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 400);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 12: Roadmap Prioritization
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 12: Roadmap Prioritization ===');
    await goTo(`${BASE}/${ORG_SLUG}/app/prioritization`, 'Prioritization');
    await pause(2000);
    await snap(page, '16-prioritization');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 800);
    await pause(1000);

    await goTo(`${BASE}/${ORG_SLUG}/app/roadmap`, 'Roadmap');
    await pause(2000);
    await snap(page, '17-roadmap');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 400);
    await pause(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 13: Settings + Billing
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=== STEP 13: Settings + Billing ===');
    await goTo(`${BASE}/${ORG_SLUG}/admin/settings`, 'Settings');
    await pause(2000);
    await snap(page, '18-settings');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 400);
    await pause(1000);

    await goTo(`${BASE}/${ORG_SLUG}/admin/billing`, 'Billing');
    await pause(2000);
    await snap(page, '19-billing');

    await smoothScroll(page, 'down', 400);
    await pause(1500);
    await smoothScroll(page, 'up', 400);
    await pause(3000);

    console.log('\n✅ All 13 steps complete!');

  } catch (err) {
    console.error('\n❌ Demo script error:', err.message);
    await snap(page, 'error-state');
  }

  await context.close();
  await browser.close();

  const videoFiles = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'));
  console.log('\nRecorded video files:', videoFiles);
  if (videoFiles.length > 0) {
    const videoPath = path.join(VIDEO_DIR, videoFiles[videoFiles.length - 1]);
    const size = fs.statSync(videoPath).size;
    console.log(`Video: ${videoPath} (${(size/1024/1024).toFixed(1)} MB)`);
    fs.copyFileSync(videoPath, '/home/ubuntu/demo-recorder/raw-demo.webm');
    console.log('Copied to: /home/ubuntu/demo-recorder/raw-demo.webm');
  }

  console.log('\nDemo recording complete!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
