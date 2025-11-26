# WhatsApp Web Service Setup Guide

This guide will help you deploy the external WhatsApp Web service that enables QR code and pairing code connection for your WhatsApp integration.

## Overview

The WhatsApp Web service is a Node.js application that runs `whatsapp-web.js` to maintain persistent connections with WhatsApp. It provides API endpoints for generating QR codes, pairing codes, and managing WhatsApp sessions.

## Architecture

```
Frontend (React) 
    ↓
Edge Functions (Supabase)
    ↓
WhatsApp Web Service (Node.js + whatsapp-web.js)
    ↓
WhatsApp Servers
```

## Service Code

Create a new Node.js project with the following structure:

### 1. `package.json`

```json
{
  "name": "whatsapp-web-service",
  "version": "1.0.0",
  "description": "WhatsApp Web service for AutomateAI",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "whatsapp-web.js": "^1.23.0",
    "express": "^4.18.2",
    "qrcode-terminal": "^0.12.0",
    "cors": "^2.8.5"
  }
}
```

### 2. `index.js`

```javascript
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const cors = require('cors');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // Your Supabase edge function URL

// Store active WhatsApp clients
const clients = new Map();

// Initialize WhatsApp client for a profile
async function initializeClient(profileId, userId, usePairing) {
  // Clean up existing client if any
  if (clients.has(profileId)) {
    const existingClient = clients.get(profileId);
    await existingClient.destroy();
    clients.delete(profileId);
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `profile_${profileId}`,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  let qrCodeData = null;
  let pairingCode = null;

  // QR code generation
  client.on('qr', async (qr) => {
    console.log('QR code generated for profile:', profileId);
    qrCodeData = qr;
    
    // Send webhook to update QR code in database
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          event: 'qr_updated',
          data: { qrCode: qr }
        })
      });
    }
  });

  // Connection ready
  client.on('ready', async () => {
    console.log('WhatsApp connected for profile:', profileId);
    const phoneNumber = client.info.wid.user;
    
    // Send webhook for successful connection
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          event: 'connected',
          data: { 
            phoneNumber: `+${phoneNumber}`,
            sessionData: {} // You can store session info here if needed
          }
        })
      });
    }
  });

  // Authentication failure
  client.on('auth_failure', async () => {
    console.log('Authentication failed for profile:', profileId);
    
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          event: 'auth_failure',
          data: {}
        })
      });
    }
  });

  // Disconnection
  client.on('disconnected', async () => {
    console.log('WhatsApp disconnected for profile:', profileId);
    clients.delete(profileId);
    
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          event: 'disconnected',
          data: {}
        })
      });
    }
  });

  // Initialize client
  await client.initialize();

  // Generate pairing code if requested
  if (usePairing) {
    try {
      pairingCode = await client.getPairingCode();
      console.log('Pairing code generated:', pairingCode);
    } catch (error) {
      console.error('Error generating pairing code:', error);
    }
  }

  clients.set(profileId, client);

  return { qrCodeData, pairingCode };
}

// API Endpoints
app.post('/api/init', async (req, res) => {
  try {
    const { profileId, userId, usePairing } = req.body;

    if (!profileId || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`Initializing WhatsApp for profile ${profileId}, pairing: ${usePairing}`);

    const { qrCodeData, pairingCode } = await initializeClient(profileId, userId, usePairing);

    res.json({
      success: true,
      qrCode: qrCodeData,
      pairingCode: pairingCode,
    });
  } catch (error) {
    console.error('Error initializing client:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/disconnect', async (req, res) => {
  try {
    const { profileId } = req.body;

    if (!profileId) {
      return res.status(400).json({ error: 'Missing profileId' });
    }

    const client = clients.get(profileId);
    if (client) {
      await client.destroy();
      clients.delete(profileId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting client:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status/:profileId', (req, res) => {
  const { profileId } = req.params;
  const client = clients.get(profileId);
  
  res.json({
    connected: client ? true : false,
    state: client ? client.getState() : 'disconnected'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', activeClients: clients.size });
});

app.listen(PORT, () => {
  console.log(`WhatsApp Web Service running on port ${PORT}`);
  console.log(`Webhook URL: ${WEBHOOK_URL || 'Not configured'}`);
});
```

## Deployment Steps

### Option 1: Railway (Recommended)

1. **Create Railway Account**: Go to [Railway.app](https://railway.app) and sign up

2. **Create New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo" or "Empty Project"

3. **Add Environment Variables**:
   ```
   PORT=3000
   WEBHOOK_URL=https://hrshudfqrjyrgppkiaas.supabase.co/functions/v1/whatsapp-web-webhook
   ```

4. **Deploy**: 
   - Push your code to GitHub
   - Connect the repo to Railway
   - Railway will automatically build and deploy

5. **Get Service URL**: 
   - Copy your Railway service URL (e.g., `https://your-service.railway.app`)

### Option 2: Render

1. **Create Render Account**: Go to [Render.com](https://render.com) and sign up

2. **Create New Web Service**:
   - Select "New Web Service"
   - Connect your GitHub repo

3. **Configure**:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add environment variables as above

4. **Deploy**: Render will build and deploy automatically

5. **Get Service URL**: Copy your Render service URL

### Option 3: Heroku

1. **Create Heroku Account**: Go to [Heroku.com](https://heroku.com) and sign up

2. **Install Heroku CLI**: Follow [Heroku CLI installation](https://devcenter.heroku.com/articles/heroku-cli)

3. **Deploy**:
   ```bash
   heroku login
   heroku create your-whatsapp-service
   heroku config:set WEBHOOK_URL=https://hrshudfqrjyrgppkiaas.supabase.co/functions/v1/whatsapp-web-webhook
   git push heroku main
   ```

4. **Get Service URL**: `https://your-whatsapp-service.herokuapp.com`

## Configure AutomateAI

After deploying the service:

1. **Add Secret in Lovable Cloud**:
   - Go to your project
   - Open Cloud settings
   - Add a new secret named `WHATSAPP_WEB_SERVICE_URL`
   - Set value to your deployed service URL (e.g., `https://your-service.railway.app`)

2. **Test Connection**:
   - Go to WhatsApp Agent page
   - Create a new profile
   - Click "Connect with QR Code" or "Connect with Pairing Code"
   - You should see a real QR code or pairing code

## Monitoring

- **Railway**: Check logs in Railway dashboard
- **Render**: Check logs in Render dashboard  
- **Heroku**: Use `heroku logs --tail`

## Troubleshooting

### QR Code not showing
- Check service logs for errors
- Verify `WEBHOOK_URL` is set correctly
- Ensure service is running

### Connection timeout
- WhatsApp may take 30-60 seconds to connect
- Check if service has enough memory (512MB minimum)
- Verify firewall rules allow WhatsApp connections

### Session issues
- The service uses `LocalAuth` which stores session data
- On Railway/Render, you may need to configure persistent storage
- Consider using a database for session storage in production

## Security Notes

- Keep your service URL private
- Add authentication to API endpoints in production
- Use HTTPS only
- Implement rate limiting
- Monitor for unusual activity

## Cost Estimates

- **Railway**: Free tier available, ~$5-10/month for basic usage
- **Render**: Free tier available, ~$7/month for paid tier
- **Heroku**: ~$7/month for basic dyno

## Support

If you encounter issues:
1. Check service logs
2. Verify all environment variables
3. Test the `/health` endpoint
4. Check WhatsApp Web.js documentation
5. Contact support with error logs
