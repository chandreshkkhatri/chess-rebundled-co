const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  
  // Capture console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to bot page...');
  try {
    // Go to the bot page
    await page.goto('http://localhost:3000/bot?difficulty=easy&color=white');
    await page.waitForTimeout(5000);

    // Save base layout before opening modal
    const baseScreenshotPath = '/home/ubuntu/.gemini/antigravity/brain/44b72a0c-694c-4bd9-88ff-d7be36ba194f/bot_room_mobile.png';
    await page.screenshot({ path: baseScreenshotPath });
    console.log('Base screenshot saved to ' + baseScreenshotPath);

    // Click the Log button (it has text 'LOG')
    await page.getByRole('button', { name: /LOG/i }).click();
    await page.waitForTimeout(1000); // Wait for animation
    
    const modalScreenshotPath = '/home/ubuntu/.gemini/antigravity/brain/44b72a0c-694c-4bd9-88ff-d7be36ba194f/bot_room_mobile_modal.png';
    await page.screenshot({ path: modalScreenshotPath });
    console.log('Modal screenshot saved to ' + modalScreenshotPath);
  } catch (e) {
    console.log('Error during screenshot:', e.message);
  } finally {
    await browser.close();
  }
})();
