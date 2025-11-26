const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Store active clients
const clients = new Map();

// Initialize WhatsApp client
function initializeClient(profileId, userId, usePairing = false) {
  console.log(`Initializing client for profile: ${profileId}, pairing: ${usePairing}`);
  
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: profileId }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  // QR Code handler
  client.on('qr', async (qr) => {
    console.log('QR Code received for profile:', profileId);
    qrcode.generate(qr, { small: true });
    
    // Send QR to webhook
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          userId,
          event: 'qr_updated',
          data: { qr }
        })
      }).catch(console.error);
    }
  });

  // Pairing code handler
  client.on('code', async (code) => {
    console.log('Pairing code received for profile:', profileId, ':', code);
    
    // Send pairing code to webhook
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          userId,
          event: 'pairing_code',
          data: { pairingCode: code }
        })
      }).catch(console.error);
    }
  });

  // Ready handler
  client.on('ready', async () => {
    console.log('Client ready for profile:', profileId);
    const info = client.info;
    
    // Send ready status to webhook
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          userId,
          event: 'connected',
          data: {
            phoneNumber: info.wid.user,
            name: info.pushname
          }
        })
      }).catch(console.error);
    }
  });

  // Auth failure handler
  client.on('auth_failure', async () => {
    console.log('Auth failure for profile:', profileId);
    
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          userId,
          event: 'auth_failure',
          data: {}
        })
      }).catch(console.error);
    }
  });

  // Disconnected handler
  client.on('disconnected', async () => {
    console.log('Client disconnected for profile:', profileId);
    clients.delete(profileId);
    
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          userId,
          event: 'disconnected',
          data: {}
        })
      }).catch(console.error);
    }
  });

  // Initialize with pairing if requested
  if (usePairing) {
    client.initialize({ 
      qrMaxRetries: 0,
      authTimeoutMs: 60000,
      takeoverTimeoutMs: 0
    }).then(() => {
      // Request pairing code
      client.requestPairingCode('+1234567890'); // Placeholder
    });
  } else {
    client.initialize();
  }

  clients.set(profileId, client);
  return client;
}

// API Routes
app.post('/api/init', async (req, res) => {
  try {
    const { profileId, userId, usePairing } = req.body;
    
    if (!profileId || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing profileId or userId' 
      });
    }

    // Check if client already exists
    if (clients.has(profileId)) {
      return res.json({ 
        success: true, 
        message: 'Client already initialized',
        status: 'existing'
      });
    }

    initializeClient(profileId, userId, usePairing);
    
    res.json({ 
      success: true, 
      message: 'Initialization started',
      status: 'initializing'
    });
  } catch (error) {
    console.error('Init error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.post('/api/disconnect', async (req, res) => {
  try {
    const { profileId } = req.body;
    const client = clients.get(profileId);
    
    if (client) {
      await client.destroy();
      clients.delete(profileId);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/status/:profileId', (req, res) => {
  const { profileId } = req.params;
  const client = clients.get(profileId);
  
  res.json({ 
    connected: client ? true : false,
    profileId 
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    activeClients: clients.size 
  });
});

app.listen(PORT, () => {
  console.log(`WhatsApp Web Service running on port ${PORT}`);
});
