const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Capture console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to bot page...');
  try {
    // Go to the bot page
    await page.goto('http://localhost:3000/bot?difficulty=easy&color=white', { 
      waitUntil: 'load',
      timeout: 60000 
    });
    
    // Wait a bit more for the WASM engine to potentially load
    await page.waitForTimeout(5000);

    const screenshotPath = '/home/ubuntu/.gemini/antigravity/brain/44b72a0c-694c-4bd9-88ff-d7be36ba194f/bot_room.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshots saved to ' + screenshotPath);
  } catch (e) {
    console.log('Error during screenshot:', e.message);
  } finally {
    await browser.close();
  }
})();
