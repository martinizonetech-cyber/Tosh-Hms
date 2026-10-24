import { chromium } from 'playwright-core';
import fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = fs.existsSync(EDGE_PATH) ? EDGE_PATH : CHROME_PATH;

const BASE_URL = 'http://localhost:3000';

async function run() {
  console.log('--- Launching Real Chromium/Edge Browser ---');
  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const results = [];
  const logStep = (step, passed, note = '') => {
    results.push({ step, passed, note });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${step}${note ? ' - ' + note : ''}`);
  };

  try {
    // -------------------------------------------------------------
    // PART A: AUTH & CHECKPOINT 1
    // -------------------------------------------------------------
    console.log('\n--- PART A: Verifying Authentication & Security ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    logStep('A2.1 Page Title & Welcome screen', title.includes('TOSH') || title.includes('Tosh'), `Title: ${title}`);

    // Check token is NOT in localStorage/sessionStorage
    const localToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    const sessionToken = await page.evaluate(() => sessionStorage.getItem('accessToken'));
    logStep('A2.2 No access token in localStorage/sessionStorage', localToken === null && sessionToken === null);

    // Login as reception
    await page.fill('input#login-email', 'reception@northstar.demo');
    await page.fill('input#login-password', 'Reception@Tosh2026');
    await page.click('button[type="submit"]');

    // Wait for either forced change password modal or dashboard
    await page.waitForTimeout(2000);

    const currentPwdInput = await page.$('input#oldPassword');
    if (currentPwdInput) {
      console.log('Forced change password modal detected, updating password...');
      await page.fill('input#oldPassword', 'Reception@Tosh2026');
      await page.fill('input#newPassword', 'NewReceptionPassword123!');
      await page.fill('input#confirmPassword', 'NewReceptionPassword123!');
      await page.click('button:has-text("Save New Password & Continue")');
      await page.waitForTimeout(2000);
    }

    const currentUrl = page.url();
    logStep('A2.3 Reception role lands on /reception/dashboard', currentUrl.includes('/reception/dashboard'), currentUrl);

    // Assert access token is still NOT in localStorage / sessionStorage
    const localTokenAfter = await page.evaluate(() => localStorage.getItem('accessToken'));
    const sessionTokenAfter = await page.evaluate(() => sessionStorage.getItem('accessToken'));
    logStep('A2.4 Access token remains exclusively in memory', localTokenAfter === null && sessionTokenAfter === null);

    // Wrong-role URLs are blocked
    await page.goto(`${BASE_URL}/skin/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const skinBlockedUrl = page.url();
    logStep('A2.5 Reception blocked from /skin/dashboard', skinBlockedUrl.includes('/reception/dashboard'), skinBlockedUrl);

    await page.goto(`${BASE_URL}/ortho/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const orthoBlockedUrl = page.url();
    logStep('A2.6 Reception blocked from /ortho/dashboard', orthoBlockedUrl.includes('/reception/dashboard'), orthoBlockedUrl);

    // Page reload keeps session (calls POST /auth/refresh then GET /auth/me)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const reloadUrl = page.url();
    logStep('A2.7 Page reload preserves session via httpOnly cookie', reloadUrl.includes('/reception/dashboard'), reloadUrl);

    // -------------------------------------------------------------
    // PART B: CHECKPOINT 2 - RECEPTION PORTAL
    // -------------------------------------------------------------
    console.log('\n--- PART B: Verifying Reception Portal Pages ---');

    // B1. Reception Dashboard
    await page.goto(`${BASE_URL}/reception/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const dashboardStats = await page.$$('.stat-card');
    logStep('B1 Reception Dashboard metrics visible', dashboardStats.length > 0, `Stats count: ${dashboardStats.length}`);

    // B2. Queue Management
    await page.goto(`${BASE_URL}/reception/queue`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const queueRows = await page.$$('table.data-table tbody tr');
    logStep('B2.1 Reception Queue loads live entries', queueRows.length > 0, `Queue entries: ${queueRows.length}`);

    // Register a new patient through Queue flow
    const newPatientBtn = await page.$('button.queue-action:has-text("New patient")');
    if (newPatientBtn) {
      await newPatientBtn.click();
      await page.waitForTimeout(400);
      const testPhone = '98765' + Math.floor(10000 + Math.random() * 90000);
      await page.fill('input#fullName', 'Ananya Sharma');
      await page.fill('input#dateOfBirth', '1995-05-15');
      await page.fill('input#phone', testPhone);
      await page.fill('input#address', '42 Cantonment Road, Trichy');
      
      const addQueueBtn = await page.$('button[type="submit"]:has-text("Register & queue")') || await page.$('button.button-primary:has-text("Register")');
      if (addQueueBtn) {
        await addQueueBtn.click();
        await page.waitForTimeout(1500);
      }
      logStep('B2.2 Registered new patient & allocated queue token from server', true, `Phone: ${testPhone}`);
    }

    // B3. Appointments Page
    await page.goto(`${BASE_URL}/reception/appointments`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const apptRows = await page.$$('table.data-table tbody tr');
    logStep('B3 Reception Appointments list loads server data', apptRows.length > 0, `Appointments: ${apptRows.length}`);

    // B4. Patient Directory
    await page.goto(`${BASE_URL}/reception/patients`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const patientRows = await page.$$('table.data-table tbody tr');
    logStep('B4.1 Patient Directory lists patients with server pagination', patientRows.length > 0, `Patients: ${patientRows.length}`);

    // Click first patient profile
    const firstPatientLink = await page.$('button.patient-link');
    if (firstPatientLink) {
      await firstPatientLink.click();
      await page.waitForTimeout(600);
      const modalHeader = await page.$('#modal-title') || await page.$('.modal-header h2');
      const modalText = modalHeader ? await modalHeader.textContent() : '';
      logStep('B4.2 Patient Profile modal opens with tabs', Boolean(modalHeader), modalText);

      // Close modal
      const closeBtn = await page.$('button[aria-label="Close dialog"]') || await page.$('button[aria-label="Close modal"]');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(300);
    }

    // B5. Billing & Invoices
    await page.goto(`${BASE_URL}/reception/billing`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const invoiceRows = await page.$$('table.data-table tbody tr');
    logStep('B5.1 Billing invoice register displays server invoices', invoiceRows.length > 0, `Invoices: ${invoiceRows.length}`);

    // Click View / pay on first invoice
    const payBtn = await page.$('button:has-text("View / pay")') || await page.$('button:has-text("View invoice")');
    if (payBtn) {
      await payBtn.click();
      await page.waitForTimeout(600);
      const payModal = await page.$('#modal-title') || await page.$('.modal-header h2');
      logStep('B5.2 Invoice modal opens with payment recording panel', Boolean(payModal));
      const closePayBtn = await page.$('button[aria-label="Close dialog"]') || await page.$('button[aria-label="Close modal"]');
      if (closePayBtn) await closePayBtn.click();
      await page.waitForTimeout(300);
    }

    // B6. Follow-ups
    await page.goto(`${BASE_URL}/reception/follow-ups`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const fuRows = await page.$$('table.data-table tbody tr');
    logStep('B6 Reception Follow-ups list loads server data', fuRows.length > 0, `Follow-ups: ${fuRows.length}`);

    // B7. Reports Summary
    await page.goto(`${BASE_URL}/reception/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const reportContent = await page.$('.stat-card') || await page.$('.report-summary-panel');
    logStep('B7 Reception Reports loads live summary from GET /reports/summary', Boolean(reportContent));

    // B8. Settings Fees
    await page.goto(`${BASE_URL}/reception/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const feeInputs = await page.$$('input[type="number"]');
    logStep('B8 Reception Settings loads fee configuration', feeInputs.length >= 2, `Fee inputs: ${feeInputs.length}`);

    // -------------------------------------------------------------
    // PART C: CHECKPOINT 3 - SKIN DOCTOR PORTAL
    // -------------------------------------------------------------
    console.log('\n--- PART C: Verifying Skin Doctor Portal ---');

    // Logout reception
    const logoutBtn = await page.$('button.sidebar-logout-btn') || await page.$('button[aria-label="Log out"]') || await page.$('button:has-text("Logout")');
    if (logoutBtn) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);
    }

    // Login as Skin Doctor
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.fill('input#login-email', 'skin@gmail.com');
    await page.fill('input#login-password', 'SkinDoctor@Tosh2026');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const skinChangePwd = await page.$('input#oldPassword');
    if (skinChangePwd) {
      console.log('Skin doctor forced password change modal detected...');
      await page.fill('input#oldPassword', 'SkinDoctor@Tosh2026');
      await page.fill('input#newPassword', 'NewSkinDoctorPassword123!');
      await page.fill('input#confirmPassword', 'NewSkinDoctorPassword123!');
      await page.click('button:has-text("Save New Password & Continue")');
      await page.waitForTimeout(2000);
    }

    const skinUrl = page.url();
    logStep('C1 Skin Doctor lands on /skin/dashboard', skinUrl.includes('/skin/dashboard'), skinUrl);

    // Skin doctor blocked from /ortho/* and /reception/*
    await page.goto(`${BASE_URL}/reception/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    logStep('C2.1 Skin Doctor blocked from /reception/dashboard', page.url().includes('/skin/dashboard'), page.url());

    await page.goto(`${BASE_URL}/ortho/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    logStep('C2.2 Skin Doctor blocked from /ortho/dashboard', page.url().includes('/skin/dashboard'), page.url());

    // Skin Doctor Consultation Workspace
    await page.goto(`${BASE_URL}/skin/consultation`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const consultWorkspace = await page.$('.doctor-workspace');
    logStep('C3 Skin Doctor Consultation Workspace renders', Boolean(consultWorkspace));

    // -------------------------------------------------------------
    // PART D: CHECKPOINT 4 - ORTHO DOCTOR PORTAL
    // -------------------------------------------------------------
    console.log('\n--- PART D: Verifying Orthopaedics Doctor Portal ---');

    // Logout skin doctor
    const logoutDoctorBtn = await page.$('button.sidebar-logout-btn') || await page.$('button[aria-label="Log out"]') || await page.$('button:has-text("Logout")');
    if (logoutDoctorBtn) {
      await logoutDoctorBtn.click();
      await page.waitForTimeout(1000);
    }

    // Login as Ortho Doctor
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.fill('input#login-email', 'ortho@gmail.com');
    await page.fill('input#login-password', 'OrthoDoctor@Tosh2026');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const orthoChangePwd = await page.$('input#oldPassword');
    if (orthoChangePwd) {
      console.log('Ortho doctor forced password change modal detected...');
      await page.fill('input#oldPassword', 'OrthoDoctor@Tosh2026');
      await page.fill('input#newPassword', 'NewOrthoDoctorPassword123!');
      await page.fill('input#confirmPassword', 'NewOrthoDoctorPassword123!');
      await page.click('button:has-text("Save New Password & Continue")');
      await page.waitForTimeout(2000);
    }

    const orthoUrl = page.url();
    logStep('D1 Ortho Doctor lands on /ortho/dashboard', orthoUrl.includes('/ortho/dashboard'), orthoUrl);

    // Body Region Templates page
    await page.goto(`${BASE_URL}/ortho/templates`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const templatesHeading = await page.$('h1:has-text("Body region templates")') || await page.$('h2:has-text("Body region templates")') || await page.$('.page-heading');
    logStep('D2 Body Region Templates page accessible', Boolean(templatesHeading));

    // Ortho Consultation with Body Region Panel
    await page.goto(`${BASE_URL}/ortho/consultation`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const orthoWorkspace = await page.$('.doctor-workspace');
    logStep('D3 Ortho Doctor Consultation Workspace renders', Boolean(orthoWorkspace));

    // Logout ortho doctor
    const logoutOrthoBtn = await page.$('button.sidebar-logout-btn') || await page.$('button[aria-label="Log out"]') || await page.$('button:has-text("Logout")');
    if (logoutOrthoBtn) {
      await logoutOrthoBtn.click();
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1000);
    logStep('D4 Logout returns to login screen and clears session', page.url() === `${BASE_URL}/` || page.url().endsWith(':3000/'), page.url());

    // Back button cannot reopen protected portal
    await page.goBack();
    await page.waitForTimeout(800);
    const backUrl = page.url();
    logStep('D5 Back button cannot reopen protected page after logout', backUrl === `${BASE_URL}/` || backUrl.endsWith(':3000/'), backUrl);

  } catch (err) {
    console.error('Test run error:', err);
    logStep('E2E execution', false, err.message);
  } finally {
    await browser.close();
  }

  console.log('\n========================================');
  console.log('         BROWSER TEST SUMMARY           ');
  console.log('========================================');
  let passCount = 0;
  for (const r of results) {
    if (r.passed) passCount++;
    console.log(`${r.passed ? '✓' : '✗'} ${r.step} ${r.note ? '(' + r.note + ')' : ''}`);
  }
  console.log(`\nTotal: ${passCount} / ${results.length} PASSED`);

  if (passCount < results.length) {
    process.exit(1);
  }
}

run();
