# Playwright scripts

## Setup Instructions

1. **Clone the Repository**

   Clone playwright-scripts to your local machine using:
   ```bash
   git clone https://github.com/LewWadoo/playwright-scripts.git
   ```

2. Install Node Modules

   - Navigate into the project directory:

   ```bash
   cd playwright-scripts
   ```

   - Install the necessary node modules:

   ```bash
   npm install
   ```

3. Configuration

   - Copy the example configuration file to create your own:

      ```bash
      cp application.yml.example application.yml      
      ```

   - Open application.yml in a text editor and set your bonus number:

      ```yaml
      BONUS_NUMBER: "YOUR_BONUS_NUMBER_HERE"      
      ```

4. Run the Script

   You can now run the mnogo-ru.js script using:

   ```bash
   node mnogo-ru.js
   ```

Make sure to have Yandex browser installed at the specified path (/usr/bin/yandex-browser) for the script to execute successfully.

## Additional Scripts

### Shaka Code Feedback Script

This script allows you to input non-monetary benefits into the feedback form for ShakaCode.

#### Running the Script

1. **Ensure Node Modules are Installed**
   
   Make sure you have the required Node modules installed:

   ```bash
   npm install
   ```

2. Configure your Application Settings

   Open application.yml and modify the NON_MONETARY_BENEFITS section to include your preferred items:

   # Non-monetary benefits for ShakaCode feedback
   NON_MONETARY_BENEFITS:
     - 'First benefit'
     - 'Second benefit'

3. Run the Feedback Script

   You can run the script using Node.js:

   ```bash
   node 15five-benefits.js
   ```

### Note:
- The script is configured to run in Firefox. Make sure it's installed on your system and accessible.
- The script keeps the browser open for 10 minutes to allow for manual inputs. Adjust the timeout in the script as needed.
- Adjust the script as necessary to accommodate any changes in the website structure or behavior.
