/**
 * Screenshot server for Metabase dashboard
 * Serves a static image of the dashboard - works on Vidaa/Chrome 88 TVs
 * Run: npm install && npm start
 * Open on TV: http://YOUR_PC_IP:3000
 */

const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const PORT = process.env.PORT || 3000;
const DASHBOARD_URL = 'https://metabase.michu.com.et/public/dashboard/14c647bf-d063-49d9-b868-41b53b4334fa?tab=24-michu-all';
const REFRESH_MINUTES = 5;

var DASHBOARD_TABS = [
  { name: '24 Michu All', url: 'https://metabase.michu.com.et/public/dashboard/14c647bf-d063-49d9-b868-41b53b4334fa?tab=24-michu-all' }
];

let cachedScreenshot = null;
let lastCapture = 0;
let cachedDashboardData = null;
let lastDataCapture = 0;

const app = express();

// Main page - Michu TV layout with screenshot (must be before static)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'tv.html'));
});

app.get('/interactive', (req, res) => {
  res.sendFile(path.join(__dirname, 'tv-interactive.html'));
});

// Static files (logos, etc.)
app.use(express.static(__dirname));

function extractDashboardData(page) {
  return page.evaluate(function() {
    function text(el) { return el ? el.innerText.trim() : ''; }
    var cards = [];
    var seen = {};
    var sel = document.querySelectorAll('[data-testid="dashcard"], [data-testid="dashboard-card"], .Card, .DashCard, [class*="DashCard"], [class*="dashcard"], .EmbedFrame [class*="Card"], .dc-card');
    if (sel.length === 0) sel = document.querySelectorAll('[class*="card"]:not(header):not(footer), section, [role="region"]');
    for (var i = 0; i < Math.min(sel.length, 40); i++) {
      var el = sel[i];
      var t = el.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"], .Card-title, .card-title');
      var v = el.querySelector('[class*="ScalarValue"], [class*="ScalarValue"], [class*="value"], .text-brand, [class*="metric"], [class*="Legend"], .ScalarValue');
      var title = text(t);
      var value = text(v);
      var rows = [];
      var tbl = el.querySelector('table');
      if (tbl) {
        var trs = tbl.querySelectorAll('tr');
        for (var r = 0; r < Math.min(trs.length, 15); r++) {
          var cells = trs[r].querySelectorAll('td, th');
          var row = [];
          for (var c = 0; c < cells.length; c++) row.push(cells[c].innerText.trim());
          if (row.length) rows.push(row);
        }
      }
      if (value || rows.length || (title && el.querySelector('table, [class*="chart"], svg'))) {
        var key = (title + value).slice(0, 50);
        if (!seen[key]) { seen[key] = 1; cards.push({ title: title || 'Metric ' + (cards.length + 1), value: value, rows: rows }); }
      }
    }
    if (cards.length < 3) {
      var scalars = document.querySelectorAll('[class*="Scalar"], [class*="scalar"], [class*="single-value"]');
      for (var j = 0; j < scalars.length; j++) {
        var s = scalars[j];
        var lab = s.querySelector('[class*="title"], [class*="label"], h4');
        var val = s.querySelector('[class*="value"], [class*="Value"], .h1, .h2') || s;
        cards.push({ title: text(lab) || 'Metric', value: text(val), rows: [] });
      }
    }
    if (cards.length === 0) {
      var main = document.querySelector('.EmbedFrame, main, [role="main"], .dashboard');
      var txt = (main || document.body).innerText;
      var parts = txt.split(/\n+/).filter(function(p) { return p.trim().length > 2; });
      for (var k = 0; k < Math.min(parts.length, 25); k++) {
        var part = parts[k].trim();
        var num = part.match(/[\d,]+\.?\d*/);
        if (num || part.length < 80) cards.push({ title: part.replace(/[\d,]+\.?\d*/, '').trim() || 'Item', value: num ? num[0] : '', rows: [] });
      }
    }
    return { cards: cards.slice(0, 30), tab: document.title || '' };
  });
}

// Screenshot endpoint
app.get('/screenshot.png', async (req, res) => {
  var forceRefresh = req.query.force === '1' || req.query.t;
  var maxAgeSec = 30;
  if (!forceRefresh && cachedScreenshot && (Date.now() - lastCapture) < maxAgeSec * 1000) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(cachedScreenshot);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(function(r) { setTimeout(r, 8000); });

    await page.evaluate(function() {
      document.documentElement.style.zoom = '130%';
    });
    await new Promise(function(r) { setTimeout(r, 500); });
    await page.evaluate(function() {
      window.scrollTo(180, 0);
    });
    await new Promise(function(r) { setTimeout(r, 200); });

    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    cachedScreenshot = buffer;
    lastCapture = Date.now();

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(buffer);
  } catch (err) {
    console.error('Screenshot error:', err.message);
    if (cachedScreenshot) {
      res.set('Content-Type', 'image/png');
      return res.send(cachedScreenshot);
    }
    res.status(500).send('Screenshot failed. Check server logs.');
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/api/dashboard-data', async (req, res) => {
  var tabIndex = parseInt(req.query.tab, 10) || 0;
  var tab = DASHBOARD_TABS[tabIndex] || DASHBOARD_TABS[0];
  var url = tab.url || DASHBOARD_URL;
  var force = req.query.force === '1' || req.query.t;
  var maxAge = 30;
  if (!force && cachedDashboardData && cachedDashboardData.url === url && (Date.now() - lastDataCapture) < maxAge * 1000) {
    res.set('Cache-Control', 'no-cache');
    return res.json(cachedDashboardData);
  }

  var browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    var page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(function(r) { setTimeout(r, 8000); });

    var data = await extractDashboardData(page);
    data.url = url;
    data.tabName = tab.name || 'Dashboard';
    data.tabs = DASHBOARD_TABS.map(function(t, i) { return { name: t.name, index: i }; });

    cachedDashboardData = data;
    lastDataCapture = Date.now();

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(data);
  } catch (err) {
    console.error('Dashboard data error:', err.message);
    if (cachedDashboardData) return res.json(cachedDashboardData);
    res.status(500).json({ error: 'Failed to fetch', cards: [] });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }
  console.log('');
  console.log('  Metabase Screenshot Server');
  console.log('  --------------------------');
  console.log('  On this PC:    http://localhost:' + PORT);
  console.log('  On your TV:    http://' + localIP + ':' + PORT);
  console.log('');
  console.log('  Open the TV URL in the Hisense browser.');
  console.log('  Screenshot view:  /');
  console.log('  Interactive view: /interactive  (tabs, refresh, data cards)');
  console.log('');
});
