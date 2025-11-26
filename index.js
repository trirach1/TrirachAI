const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
app.use(cors());
app.use(express.json());

let client;

async function startWhatsApp() {
  client = new Client({
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage"
      ],
      executablePath: "/usr/bin/chromium-browser"
    },
    authStrategy: new LocalAuth({ clientId: "session" }),
  });

  client.on("qr", (qr) => {
    console.log("Scan this QR code to login:");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    console.log("WhatsApp is ready!");
  });

  client.on("authenticated", () => {
    console.log("Authenticated!");
  });

  client.on("auth_failure", () => {
    console.log("Auth failed!");
  });

  client.on("message", async (msg) => {
    console.log("Message received:", msg.body);

    if (msg.body === "!ping") {
      msg.reply("pong!");
    }
  });

  client.initialize();
}

startWhatsApp();

// API to send messages
app.post("/send", async (req, res) => {
  const { number, message } = req.body;

  if (!client) return res.status(500).json({ success: false, message: "Client not ready" });

  try {
    const formattedNumber = number.includes("@c.us")
      ? number
      : number + "@c.us";

    await client.sendMessage(formattedNumber, message);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.toString() });
  }
});

app.listen(3000, () => {
  console.log("WhatsApp Web Service running on port 3000");
});
