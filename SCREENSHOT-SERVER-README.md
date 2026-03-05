# Metabase Screenshot Server (for Vidaa / Hisense TV)

Serves a static image of your Metabase dashboard. Works on Chrome 88 and Vidaa TVs that can't run Metabase directly.

## Requirements

- **Node.js** (v16 or newer) – [Download](https://nodejs.org/)
- Your PC and TV on the **same WiFi/network**

## Setup

1. Open a terminal in this folder:
   ```
   cd "c:\Users\elsha\OneDrive\Documents\coop projects\Michu-DashBoard"
   ```

2. Install dependencies (first time only):
   ```
   npm install
   ```

3. Start the server:
   ```
   npm start
   ```

4. You’ll see something like:
   ```
   On your TV:    http://192.168.1.xxx:3000
   ```

## On the TV

1. Open the Hisense/Vidaa browser.
2. Enter the TV URL: `http://YOUR_PC_IP:3000` (e.g. `http://192.168.1.100:3000`).
3. Choose a view:
   - **`/`** – Screenshot view (static image, auto-refresh)
   - **`/interactive`** – Interactive view (clickable tabs, data cards, refresh button)

The interactive view extracts data from Metabase and shows it as simple cards. You can click tabs to switch dashboards and use the Refresh button.

## Troubleshooting

- **Firewall**: Windows Firewall may block port 3000. Allow Node.js when prompted, or add an inbound rule for port 3000.
- **First load slow**: The first screenshot can take 15–30 seconds while Puppeteer loads the page.
- **Change refresh interval**: Edit `server.js`, change `REFRESH_MINUTES = 5` to another value.
- **Find your PC IP**: Run `ipconfig` in PowerShell and look for "IPv4 Address" under your WiFi adapter.

## Adding more tabs (interactive view)

Edit `server.js` and add URLs to the `DASHBOARD_TABS` array:

```javascript
var DASHBOARD_TABS = [
  { name: '24 Michu All', url: 'https://metabase...?tab=24-michu-all' },
  { name: 'Other Dashboard', url: 'https://metabase.../other-dashboard-id' }
];
```
