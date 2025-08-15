#!/usr/bin/env node

/**
 * Minimal test script to verify WhatsApp Web.js can initialize
 * Run with: node scripts/test-whatsapp-minimal.js
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('🔧 Testing WhatsApp Web.js initialization...\n');

// Get Chrome path from environment or try common locations
const chromePaths = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium'
].filter(Boolean);

let executablePath = null;
const fs = require('fs');

for (const path of chromePaths) {
  if (fs.existsSync(path)) {
    executablePath = path;
    console.log(`✓ Found Chrome at: ${path}`);
    break;
  }
}

if (!executablePath) {
  console.error('❌ No Chrome/Chromium installation found!');
  console.error('Please install Chrome: sudo apt-get install chromium-browser');
  process.exit(1);
}

// Create client with minimal config
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'test-client',
    dataPath: './whatsapp-test-session',
  }),
  puppeteer: {
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions'
    ],
  },
  // Disable some problematic features
  webVersionCache: {
    type: 'none'
  }
});

// Event handlers
client.on('qr', (qr) => {
  console.log('\n📱 QR Code received! Scan with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n✓ QR code displayed above');
});

client.on('authenticated', () => {
  console.log('✓ Authenticated successfully!');
});

client.on('ready', () => {
  console.log('✓ WhatsApp Web client is ready!');
  console.log('\nTest completed successfully! Press Ctrl+C to exit.');
});

client.on('disconnected', (reason) => {
  console.log('Client disconnected:', reason);
  process.exit(0);
});

// Error handling
client.on('auth_failure', (msg) => {
  console.error('Authentication failure:', msg);
});

// Initialize
console.log('Initializing WhatsApp Web client...');
console.log(`Using Chrome: ${executablePath}`);
console.log('This may take a moment...\n');

client.initialize().catch((error) => {
  console.error('❌ Initialization failed:', error.message);
  
  if (error.message.includes('setUserAgent')) {
    console.error('\nThis is a Puppeteer compatibility issue.');
    console.error('Try updating whatsapp-web.js: npm update whatsapp-web.js');
  } else if (error.message.includes('Failed to launch')) {
    console.error('\nChrome failed to launch. Check Chrome installation:');
    console.error('1. Run: chromium-browser --version');
    console.error('2. Install missing dependencies: sudo apt-get install chromium-codecs-ffmpeg');
  } else if (error.message.includes('EACCES') || error.message.includes('Permission denied')) {
    console.error('\nPermission issue detected.');
    console.error('Run: sudo chmod -R 755 ./whatsapp-test-session');
  }
  
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await client.destroy();
  process.exit(0);
});