import { chromium } from 'playwright';

(async () => {
  console.log('🏁 Starting E2E headless validation test for CivicEngine...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to browser console and errors
  page.on('console', msg => console.log('🖥️  BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('🚨 BROWSER ERROR:', err.message));

  try {
    // ── 1. Navigate to Citizen Login ──────────────────────────────────────────
    console.log('🌐 Navigating to citizen portal login...');
    await page.goto('http://localhost:3000/login');
    console.log('📍 Current Page URL:', page.url());
    
    // Check if redirect happened
    if (page.url().endsWith('/login') || page.url().includes('/login')) {
      console.log('🔑 Login page loaded.');
    } else {
      console.log('🔀 Already logged in, redirected to:', page.url());
    }

    try {
      await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    } catch (e) {
      console.log('⚠️ input[type="email"] selector timeout. Page HTML:\n', await page.content());
      throw e;
    }
    
    console.log('✍️  Filling citizen credentials...');
    await page.fill('input[type="email"]', 'citizen@hackathon.com');
    await page.fill('input[type="password"]', 'securepassword');
    
    console.log('🔑 Clicking sign-in...');
    await page.click('button[type="submit"]');
    
    // Wait for navigation/redirection to the main page
    await page.waitForURL('http://localhost:3000/');
    console.log('✅ Citizen login successful. Redirected to /');

    // Accept DPDP consent
    console.log('🛡️  Accepting DPDP Act 2023 Consent Notice...');
    await page.click('button:has-text("I Agree & Give Consent")');
    console.log('✅ Consent granted successfully.');

    // ── 2. Create Grievance Report ───────────────────────────────────────────
    console.log('📝 Switching to Quick Post tab...');
    await page.click('button:has-text("Quick Post")');
    
    console.log('✍️  Formulating municipal grievance...');
    await page.selectOption('select[required]', 'ROADS');
    await page.fill('textarea[required]', 'Test pothole reported near Metro Station exit 2. Highly dangerous for two-wheelers.');
    await page.click('button:has-text("4")'); // Set severity 4
    
    console.log('🚀 Submitting grievance report...');
    await page.click('button[type="submit"]');
    
    // Wait for database insert & success feed refresh
    await page.waitForSelector('text=Report Submitted');
    console.log('✅ Grievance submitted and processed successfully!');

    // Wait for the feed item to show up
    console.log('🔍 Locating report in citizen feed...');
    await page.waitForSelector('text=Test pothole reported near Metro Station exit 2');
    console.log('✅ Report identified in citizen feed feed list.');

    // ── 3. Authority Dashboard Verification ──────────────────────────────────
    console.log('🚪 Logging out citizen...');
    await page.click('button[title="Log out"]');
    await page.waitForURL('http://localhost:3000/login');
    console.log('✅ Citizen logged out.');

    console.log('🌐 Navigating to Ward Officer Secure Portal...');
    await page.goto('http://localhost:3000/authority/login');
    await page.waitForSelector('input[type="email"]');
    
    console.log('✍️  Filling official credentials...');
    await page.fill('input[type="email"]', 'officer@municipal.gov.in');
    await page.fill('input[type="password"]', 'secureofficerpassword');
    
    console.log('🔑 Authenticating official...');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('http://localhost:3000/authority');
    console.log('✅ Officer authenticated. Redirected to /authority');

    console.log('📊 Waiting for analytics and active queue counters...');
    await page.waitForSelector('text=Active Open Cases');
    
    console.log('🔍 Locating actionable item in Queue...');
    await page.waitForSelector('text=Test pothole reported near Metro Station exit 2');
    console.log('✅ Grievance verified in high-priority execution queue.');

    console.log('🔧 Updating workflow state...');
    // Click on details or discuss to expand/interact
    await page.click('button:has-text("Details / Discuss")');
    await page.waitForSelector('text=Comments');
    console.log('✅ Timeline detail modal opened successfully.');

    console.log('🏆 E2E HEADLESS TEST SUCCEEDED! All modules verified functional.');
  } catch (err) {
    console.error('❌ E2E headless test failed with error:', err);
    process.exit(1);
  } finally {
    await browser.close();
    console.log('🏁 Headless browser closed.');
  }
})();
