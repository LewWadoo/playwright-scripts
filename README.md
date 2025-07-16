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
