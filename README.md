# 🚀 LAN Chat Messenger - Complete Setup Guide
---

## 🔧 Installation Steps

### 1️⃣ **Install Dependencies**
```bash
npm install
```

```bash
npm install express socket.io express-fileupload
```

### 2️⃣ **Generate SSL Certificates (For HTTPS)**

**On Windows (with OpenSSL installed):**
```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365
```

**On Linux/Mac:**
```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365
```

**During certificate generation, you'll be asked questions. You can press Enter for all of them or fill them in:**
- Country Name: `US` (or your country)
- State: `California` (or leave blank)
- City: `San Francisco` (or leave blank)
- Organization: `My Company` (or leave blank)
- Common Name: `localhost` (IMPORTANT - use `localhost` or your IP)
- Email: (leave blank)

### 3️⃣ **File Structure**

Your project folder should look like this:
```
my-lan-chat/
├── server.js          (server code)
├── index.html         (client code)
├── key.pem           (SSL certificate - generated)
├── cert.pem          (SSL certificate - generated)
├── package.json
└── public/
    └── uploads/      (created automatically)
```

---

## ▶️ Running the Server

### **Option 1: HTTPS Mode (Recommended - Full Features)**
```bash
node server.js
```
If `key.pem` and `cert.pem` exist, the server automatically runs in HTTPS mode.

### **Option 2: HTTP Mode (Limited Features)**
If certificates don't exist, the server runs in HTTP mode automatically, but:
- ❌ Voice messages won't work
- ❌ Video/Audio calls won't work
- ✅ Text chat works
- ✅ File sharing works

---

## 🌐 Accessing the Chat

After starting the server, you'll see output like:
```
============================================================
🚀 LAN MESSENGER SERVER STARTED
============================================================
📡 Protocol: HTTPS
🔌 Port: 3000
============================================================

🌐 ACCESS FROM:

   📱 This device: https://localhost:3000
   🌍 Network (Wi-Fi): https://192.168.1.100:3000
   🌍 Network (Ethernet): https://192.168.0.50:3000

============================================================
✅ HTTPS ENABLED - All features available!
============================================================
```

### **Connect from:**
- **Same computer:** `https://localhost:3000`
- **Other devices on LAN:** Use the network IP (e.g., `https://192.168.1.100:3000`)

### **⚠️ SSL Certificate Warning**
When you first visit the HTTPS URL, your browser will show a security warning because it's a self-signed certificate. This is normal!

**How to proceed:**
- **Chrome:** Click "Advanced" → "Proceed to localhost (unsafe)"
- **Firefox:** Click "Advanced" → "Accept the Risk and Continue"
- **Safari:** Click "Show Details" → "Visit This Website"
- **Mobile:** Click "Advanced" → "Proceed"

This is safe for your LAN - it's just because the certificate isn't from a trusted authority.

---

## 🧪 Testing the Features

### **1. Private Messaging Test**
1. Open the app in two different browsers (or devices)
2. Login as "Alice" in one, "Bob" in another
3. Alice: Click on "Bob" in the ONLINE USERS section
4. Type a message - only Bob should see it
5. Check the server console - you should see detailed logs

### **2. Channel Creation Test**
1. Login as any user
2. Click the `+` icon next to "CHANNELS"
3. Enter a channel name (e.g., "dev-team")
4. Enter password (optional) or leave blank
5. The new channel should appear for ALL users immediately

### **3. Voice Message Test (HTTPS Only)**
1. Make sure you're on HTTPS
2. Open a chat (channel or private)
3. **Press and HOLD** the microphone button
4. Speak your message
5. **Release** the button to send
6. The voice message should upload and appear as an audio player

### **4. Video/Audio Call Test (HTTPS Only)**
1. Open private chat with another user
2. Click the phone icon (voice) or video icon
3. The other user should see an incoming call
4. They click the green phone icon to answer
5. Video/audio should connect

---

## 🐛 Troubleshooting

### **Problem: "Username already taken" when reconnecting**
**Solution:** Clear browser's localStorage:
- Open browser console (F12)
- Type: `localStorage.clear()`
- Refresh the page

### **Problem: Private messages not showing**
**Solution:** Check the server console logs. You should see:
```
💬 Message from Alice:
   Room: Bob
   Private: true
   Type: text
   Recipient: Bob
   Recipient Socket: xyz123
   Private Room ID: Alice___PRIVATE___Bob
   ✅ Message sent to room: Alice___PRIVATE___Bob
```

If you don't see these logs, there's a connection issue.

### **Problem: Voice messages don't work**
**Cause:** You're on HTTP, not HTTPS.
**Solution:** 
1. Generate SSL certificates (see step 2 above)
2. Restart the server
3. Access via `https://` (not `http://`)

### **Problem: "ERR_CERT_AUTHORITY_INVALID"**
**This is normal!** Your self-signed certificate triggers this. Just click "Advanced" and proceed.

### **Problem: Channel not appearing**
**Check server logs.** You should see:
```
🆕 Creating channel: dev-team by Alice
   Password: No
   ✅ Channel created successfully
```

If the channel was created, all connected users should receive the updated list automatically.

### **Problem: Can't connect from other devices**
1. Check firewall settings - allow port 3000
2. Make sure all devices are on the same network
3. Use the correct IP address (from server console output)
4. For HTTPS, you must accept the certificate warning on each device

---

## 📊 Server Console Logs Explained

The server now shows detailed logs:
```
✅ New connection: abc123          → Someone connected
👤 Join request from: Alice        → User trying to join
✅ Alice registered and joined General → Success
💬 Message from Alice:             → Message details
   Room: Bob
   Private: true
   ✅ Message sent to room: ...
📞 Alice calling Bob               → Call initiated
❌ Bob disconnected                → User left
```

These logs help you understand what's happening in real-time!

---

## 🎯 Quick Command Reference

```bash
# Install dependencies
npm install express socket.io express-fileupload

# Generate SSL certificates
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365

# Start server
node server.js

# Clear localStorage (in browser console)
localStorage.clear()
```

---

## ✨ Features Summary

| Feature | HTTP | HTTPS |
|---------|------|-------|
| Text Messaging | ✅ | ✅ |
| Private Chat | ✅ | ✅ |
| Channels | ✅ | ✅ |
| File Upload | ✅ | ✅ |
| Voice Messages | ❌ | ✅ |
| Audio Calls | ❌ | ✅ |
| Video Calls | ❌ | ✅ |

---

## 🎉 You're All Set!

Your LAN messenger is now fully functional with:
- ✅ Private messaging
- ✅ Channel creation
- ✅ Voice messages (HTTPS)
- ✅ Audio/Video calls (HTTPS)
- ✅ File sharing
- ✅ Modern UI
- ✅ Detailed logging

**Share the network URL with your team and start chatting!** 🚀