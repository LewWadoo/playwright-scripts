const fs = require('fs');
const yaml = require('js-yaml');
const { firefox } = require('playwright');

// Load configuration from application.yml
let config;
try {
  config = yaml.load(fs.readFileSync('application.yml', 'utf8'));
} catch (e) {
  console.error("Error reading configuration: ", e);
  process.exit(1);
}

// List of non-monetary things for ShakaCode feedback, retrieved from configuration
const nonMonetaryThings = config.NON_MONETARY_BENEFITS;

// 15Five credentials
const email = config['15FIVE_EMAIL_ADDRESS'];
const password = config['15FIVE_PASSWORD'];

(async () => {
  // Launch Firefox browser
  const browser = await firefox.launch({
    headless: false // Set to false to keep the browser visible
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the 15Five login page
    console.log("Navigating to the 15Five login page...");
    await page.goto('https://my.15five.com/report/current/', { timeout: 60000, waitUntil: 'domcontentloaded' });
    
    // Input email address
    console.log("Entering email address...");
    await page.fill('#id_username', email);
    
    // Input password
    console.log("Entering password...");
    await page.fill('#id_password', password);
    
    // Submit the form
    console.log("Submitting the login form...");
    await page.click('button[type="submit"]');
    
    // Wait for the input fields to load
    console.log("Waiting for input fields...");
    selectorInput = 'textarea[data-question-id="4707427"]:empty';
    await page.waitForSelector(selectorInput, { timeout: 60000 });

    // Input each non-monetary thing into the fields
    for (const item of nonMonetaryThings) {
      // Type the item into the input field
      await page.fill(selectorInput, item);
      // Press Tab to move to the next input field
      await page.keyboard.press('Tab');
    }

    console.log("Non-monetary benefits have been inputted. The browser will remain open for manual input.");
    
    // Keep the browser open for further manual inputs or examination
    
    await page.waitForTimeout(60000 * 10); // Keep the script running for 10 minutes (you can adjust this)
    
  } catch (error) {
    console.error("An error occurred: ", error);
  } finally {
    // Close the browser if necessary, or keep it open for manual input
    // await browser.close(); // Uncomment this line if you want to auto-close after manual input
  }
})();
