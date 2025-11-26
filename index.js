import express from "express";
import cors from "cors";
import qrcode from "qrcode-terminal";
import { Client, RemoteAuth } from "whatsapp-web.js";
import { MongoStore } from "wwebjs-mongo";
import mongoose from "mongoose";

const app = express();
app.use(cors());
app.use(express.json());

// -------------------------------------
// 1. CONNECT TO MONGO (for saving session)
// -------------------------------------
const mongoURL = "mongodb://127.0.0.1:27017/whatsapp-sessions"; 
mongoose.connect(mongoURL).then(() => console.log("MongoDB connected"));

// -------------------------------------
// 2. Setup RemoteAuth (no puppeteer, no chrome)
// -------------------------------------
const store = new MongoStore({ mongoose: mongoose });

const client = new Client({
  authStrategy: new RemoteAuth({
    store,
    backupSyncIntervalMs: 300000,
  }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// -------------------------------------
// 3. QR Code
// -------------------------------------
client.on("qr", (qr) => {
  console.log("\n📌 SCAN QR CODE:");
  qrcode.generate(qr, { small: true });
});

// -------------------------------------
// 4. Client Ready
// -------------------------------------
client.on("ready", () => {
  console.log("✅ WhatsApp Client is ready!");
});

// -------------------------------------
// 5. Send Message API
// -------------------------------------
app.post("/send", async (req, res) => {
  const { number, message } = req.body;

  try {
    const chatId = number.includes("@c.us") ? number : number + "@c.us";
    await client.sendMessage(chatId, message);
    res.json({ success: true, msg: "Message sent!" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("WhatsApp API is running");
});

// -------------------------------------
client.initialize();
// -------------------------------------

// -------------------------------------
app.listen(3000, () => console.log("🚀 Server started on port 3000"));
// -------------------------------------
