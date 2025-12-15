# 🚀 LAN Chat Messenger - Complete Setup Guide

A modern, real-time messaging application for local area networks with text chat, voice messages, file sharing, and more!

---

## ✨ Features

| Feature | Status |
|---------|--------|
| 💬 Text Messaging | ✅ |
| 🔒 Private 1:1 Chat | ✅ |
| 📢 Channels with Password | ✅ |
| 🎤 Voice Messages | ✅ (HTTPS) |
| 📁 File Upload (100MB) | ✅ |
| 🖼️ Image/Video Preview | ✅ |
| 👥 Real-time User List | ✅ |
| 📱 Mobile Responsive UI | ✅ |
| 🌙 Dark Theme | ✅ |
| 💾 Message History | ✅ |
| 🔐 HTTPS Support | ✅ |

---

## 🔧 Installation Steps

### 1️⃣ **Install Dependencies**

```bash
npm install
```

```bash
npm install express socket.io express-fileupload
```

### 2️⃣ **Generate SSL Certificates (For HTTPS & Voice Messages)**

**Generate self-signed certificate:**

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365
```

**During certificate generation, press Enter for all questions or fill in:**
- Country Name: `US`
- State: `California` (or leave blank)
- City: `San Francisco` (or leave blank)
- Organization: `My Organization` (or leave blank)
- Common Name: `localhost` ⚠️ **IMPORTANT**
- Email: (leave blank)

### 3️⃣ **File Structure**

```
my-lan-chat/
├── server.js              # Backend server
├── index.html             # Frontend client
├── package.json           # Dependencies
├── key.pem               # SSL key (generated)
├── cert.pem              # SSL certificate (generated)
└── public/
    └── uploads/          # File uploads (auto-created)
```

---

## ▶️ Running the Server

### **HTTPS Mode (Recommended - Full Features)**

```bash
node server.js
```

If `key.pem` and `cert.pem` exist, the server automatically runs in HTTPS mode with all features enabled.

### **HTTP Mode (Limited)**

If SSL certificates don't exist, HTTP mode runs automatically:
- ✅ Text messaging
- ✅ Private chat
- ✅ Channels
- ✅ File upload
- ❌ Voice messages (requires HTTPS)

---

## 🌐 Accessing the Chat

After starting the server, you'll see:

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

- **Same Computer:** `https://localhost:3000`
- **Other Devices on LAN:** Use the network IP shown (e.g., `https://192.168.1.100:3000`)
- **Mobile Devices:** Same network IP with HTTPS

### **⚠️ SSL Certificate Warning**

When visiting HTTPS URL for the first time, your browser shows a security warning. This is **normal and safe** for self-signed certificates!

**How to proceed:**
- **Chrome:** Click "Advanced" → "Proceed to localhost (unsafe)"
- **Firefox:** Click "Advanced" → "Accept the Risk and Continue"
- **Safari:** Click "Show Details" → "Visit This Website"
- **Edge:** Click "Advanced" → "Continue to [URL]"
- **Mobile:** Tap "Advanced" → "Proceed"

---

## 🧪 Testing the Features

### **1. Text Messaging**
1. Login as two different users
2. Type a message in General channel
3. Message appears instantly on all clients

### **2. Private Chat**
1. Login as "Alice" and "Bob" on different devices
2. Alice clicks "Bob" in ONLINE USERS section
3. Type a private message
4. Only Bob sees the message
5. Bob can reply and chat with Alice

### **3. Create Password-Protected Channel**
1. Click `+` next to CHANNELS
2. Enter channel name (e.g., "marketing")
3. Enter optional password
4. Channel appears for all users immediately
5. Users need password to join

### **4. Voice Message Recording**
1. Must be on **HTTPS** (not HTTP)
2. Open any chat
3. **Press and HOLD** the microphone button 🎤
4. Speak your message (minimum 500ms)
5. **Release** to upload
6. Voice message appears as audio player
7. Others can play and hear your message

### **5. File Upload**
1. Click attachment icon 📎
2. Select file (image, video, audio, document)
3. Maximum 100MB
4. File uploads and appears as:
   - Image: Preview thumbnail
   - Video: Playable video
   - Audio: Audio player
   - Other: Download link

### **6. User List Updates**
1. User A joins chat
2. User B immediately sees User A in ONLINE USERS
3. User A goes offline
4. User A immediately disappears from list
5. Notification message appears in General channel

---

## 📱 Mobile Features

✅ **Fully Responsive Design**
- Touch-friendly buttons (34-36px)
- Optimized layout for all screen sizes
- Proper text sizing
- Works on phone and tablet

✅ **Mobile-Specific Features**
- Hamburger menu for sidebar
- Auto-close sidebar on selection
- Proper keyboard handling
- Voice recording on mobile
- File upload on mobile

---

## 🎯 How It Works

### **Architecture**
```
┌─────────────────────────────────────────────────┐
│                   Browser (Client)               │
│  ┌──────────────────────────────────────────┐   │
│  │  HTML/CSS/JavaScript UI                   │   │
│  │  - Real-time message display              │   │
│  │  - Voice recording                        │   │
│  │  - File upload handler                    │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ Socket.IO
                       │ (WebSocket)
┌──────────────────────▼──────────────────────────┐
│              Node.js Server (server.js)          │
│  ┌──────────────────────────────────────────┐   │
│  │  Express + Socket.IO                      │   │
│  │  - User authentication                    │   │
│  │  - Channel management                     │   │
│  │  - Message routing                        │   │
│  │  - File storage                           │   │
│  │  - Real-time updates                      │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

### **Data Flow**

```
User Action → Client → Socket.IO → Server → Process → Broadcast → All Clients
```

---

## 🐛 Troubleshooting

### **Problem: "Username already taken"**

**Solution:** Clear browser localStorage
```javascript
// In browser console (F12)
localStorage.clear()
```
Then refresh and login with new username.

### **Problem: Private messages not showing**

**Check Server Logs:** Should show:
```
💬 Private Room ID: Alice___PRIVATE___Bob
✅ Message sent to room: Alice___PRIVATE___Bob
```

If missing, reconnect and try again.

### **Problem: Voice messages don't record**

**Causes & Solutions:**
- ❌ Using HTTP → Switch to HTTPS
- ❌ Holding button <500ms → Hold for at least 1 second
- ❌ Microphone blocked → Allow microphone in browser
- ❌ No HTTPS certificate → Generate certificate (see above)

**To Enable HTTPS:**
1. Generate certificates: `openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365`
2. Restart server: `node server.js`
3. Access via `https://`

### **Problem: Can't connect from other devices**

**Check:**
1. ✅ Both devices on same network (Wi-Fi/Ethernet)
2. ✅ Server running: `node server.js`
3. ✅ Firewall allows port 3000
4. ✅ Using correct IP from server output
5. ✅ Using HTTPS and accepted certificate
6. ✅ No proxy or VPN blocking connection

### **Problem: Channel not appearing for other users**

**Check Server Console:** Should show:
```
✅ Channel created successfully
```

All connected clients should receive updated channel list. Try refreshing page if needed.

### **Problem: File upload fails**

**Causes:**
- File larger than 100MB
- Server `/public/uploads` folder not writable
- Disk full

**Solution:** Check server console for error details.

### **Problem: "ERR_CERT_AUTHORITY_INVALID"**

**This is normal!** Self-signed certificate always shows this warning on first visit.

**Solution:** Click "Advanced" and proceed. It's safe for your LAN.

---

## 📊 Server Console Output

The server shows detailed real-time logs:

```
✅ New connection: socket123              # Client connected
👤 Join request from: Alice               # User joining
✅ Alice registered and joined General    # Join successful
💬 Message from Alice:                    # Message event
   Room: Bob
   Private: true
   Type: text
   ✅ Message sent
📎 File uploaded: voice_123.webm          # Voice message
❌ Alice disconnected                     # User left
```

---

## 🔒 Security Notes

- ✅ Self-signed HTTPS certificates (secure for LAN)
- ✅ Password-protected channels
- ✅ Private 1:1 messaging
- ✅ No authentication database (usernames only)
- ✅ Messages stored in memory (cleared on restart)
- ✅ File upload limited to 100MB
- ⚠️ Not intended for internet/public use

---

## 📋 API Reference

### **Socket.IO Events**

**Client → Server:**
```javascript
socket.emit("join", username)
socket.emit("sendMessage", { room, isPrivate, type, content })
socket.emit("joinChannel", { name, password })
socket.emit("createChannel", { name, password })
socket.emit("joinPrivate", otherUsername)
```

**Server → Client:**
```javascript
socket.on("joinSuccess")
socket.on("receiveMessage", message)
socket.on("updateUserList", users)
socket.on("channelList", channels)
socket.on("joinFail", errorMessage)
```

---

## 🚀 Quick Commands

```bash
# Install everything
npm install express socket.io express-fileupload

# Generate SSL certificates
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365

# Start server
node server.js

# Clear browser data (in console)
localStorage.clear()
```

---

## 📦 Dependencies

- **express** - Web server framework
- **socket.io** - Real-time communication
- **express-fileupload** - File handling
- **Node.js** - Runtime environment

---

## 💡 Tips & Tricks

1. **Use HTTPS for best experience** - All features work
2. **Create channels for team discussions** - Organize conversations
3. **Password protect sensitive channels** - Add security
4. **Voice messages save bandwidth** - Better than text for complex topics
5. **File sharing works great** - Share documents, images, videos
6. **Message history saves** - Scroll up to see previous messages
7. **User list updates in real-time** - See who's online instantly

---

## 🎯 Tested On

- ✅ Windows 10/11 with Chrome, Firefox, Edge
- ✅ macOS with Safari, Chrome
- ✅ Ubuntu Linux with Chrome, Firefox
- ✅ iOS Safari (mobile)
- ✅ Android Chrome (mobile)

---

## 📝 License

Open source - Use freely for your LAN

---

## 🎉 You're All Set!

Your LAN Messenger is ready to use with all features:
- ✅ Instant messaging
- ✅ Private chat
- ✅ Channels
- ✅ Voice messages
- ✅ File sharing
- ✅ Mobile support

**Share the network URL with your team and start chatting!** 🚀

---

**Questions?** Check the troubleshooting section or review the server console logs for detailed diagnostics.