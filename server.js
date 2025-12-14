// server.js - COMPLETELY FIXED VERSION
const express = require("express");
const https = require("https");
const http = require("http");
const { Server } = require("socket.io");
const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();

// === File Storage Setup ===
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.static("public"));
app.use("/uploads", express.static(UPLOAD_DIR));

app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 100 * 1024 * 1024 },
    debug: false,
    abortOnLimit: true,
    responseOnLimit: "File size limit exceeded"
}));

app.use(express.json());

// === Data Stores ===
let usersBySocket = {};
let usersByName = {};
let channels = { General: { password: null } };
let messages = {};

// Helper: Get deterministic private room ID
function getPrivateRoom(usernameA, usernameB) {
    return [usernameA, usernameB].sort().join("___PRIVATE___");
}

// Helper: Leave all rooms except specified
function leaveAllRooms(socket, exceptRoom) {
    Array.from(socket.rooms).forEach(r => {
        if (r !== socket.id && r !== exceptRoom) {
            socket.leave(r);
            console.log(`  🚪 Left room: ${r}`);
        }
    });
}

// === HTTPS/HTTP Setup with Auto-Detection ===
let server;
const PORT = process.env.PORT || 3000;
let isHttps = false;

// Try HTTPS first, fallback to HTTP
if (fs.existsSync("key.pem") && fs.existsSync("cert.pem")) {
    try {
        const privateKey = fs.readFileSync("key.pem", "utf8");
        const certificate = fs.readFileSync("cert.pem", "utf8");
        const credentials = { key: privateKey, cert: certificate };
        server = https.createServer(credentials, app);
        isHttps = true;
        console.log("🔒 HTTPS mode enabled");
    } catch (e) {
        console.log("⚠️  SSL certificate error, falling back to HTTP:", e.message);
        server = http.createServer(app);
    }
} else {
    console.log("⚠️  SSL certificates not found (key.pem, cert.pem)");
    console.log("📝 Generate with: openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365");
    server = http.createServer(app);
}

// === Socket.IO Setup ===
const io = new Server(server, {
    maxHttpBufferSize: 1e8,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// === Socket.IO Event Handlers ===
io.on("connection", socket => {
    console.log(`\n✅ New connection: ${socket.id}`);

    // === JOIN ===
    socket.on("join", username => {
        console.log(`\n👤 Join request from: ${username}`);
        
        // Check if username already exists
        if (usersByName[username]) {
            console.log(`❌ Username '${username}' already taken`);
            return socket.emit("joinFail", `Username '${username}' is already taken.`);
        }

        // Register user
        usersBySocket[socket.id] = {
            username,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff&bold=true`
        };
        usersByName[username] = socket.id;

        // Join General channel by default
        leaveAllRooms(socket, "General");
        socket.join("General");

        console.log(`✅ ${username} registered and joined General`);
        
        socket.emit("joinSuccess");
        io.emit("updateUserList", usersBySocket);
        socket.emit("channelList", Object.keys(channels));

        // Send welcome message
        const welcome = {
            type: "system",
            content: `${username} joined General`,
            room: "General",
            timestamp: new Date().toLocaleTimeString()
        };

        messages.General = messages.General || [];
        messages.General.push(welcome);
        io.to("General").emit("receiveMessage", welcome);
    });

    // === SEND MESSAGE - CRITICAL FIX ===
    socket.on("sendMessage", data => {
        const user = usersBySocket[socket.id];
        if (!user) {
            console.log(`❌ Message from unregistered socket: ${socket.id}`);
            return;
        }

        console.log(`\n💬 Message from ${user.username}:`);
        console.log(`   Room: ${data.room}`);
        console.log(`   Private: ${data.isPrivate}`);
        console.log(`   Type: ${data.type}`);

        let targetRoom = data.room;

        // CRITICAL FIX: Handle private messaging
        if (data.isPrivate) {
            const recipientUsername = data.room;
            const recipientSocketId = usersByName[recipientUsername];
            
            console.log(`   Recipient: ${recipientUsername}`);
            console.log(`   Recipient Socket: ${recipientSocketId}`);
            
            if (!recipientSocketId) {
                console.log(`   ❌ Recipient offline`);
                return socket.emit("receiveMessage", {
                    type: "system",
                    content: `User ${recipientUsername} is offline.`,
                    room: recipientUsername, // Keep original room name for UI
                    timestamp: new Date().toLocaleTimeString()
                });
            }
            
            // Generate private room ID
            targetRoom = getPrivateRoom(user.username, recipientUsername);
            console.log(`   Private Room ID: ${targetRoom}`);
            
            // Ensure sender is in the room
            if (!socket.rooms.has(targetRoom)) {
                socket.join(targetRoom);
                console.log(`   ✅ Sender joined private room`);
            }
            
            // Ensure recipient is in the room
            const recipientSocket = io.sockets.sockets.get(recipientSocketId);
            if (recipientSocket && !recipientSocket.rooms.has(targetRoom)) {
                recipientSocket.join(targetRoom);
                console.log(`   ✅ Recipient joined private room`);
            }
        }

        const msg = {
            sender: user,
            type: data.type || "text",
            content: data.content,
            timestamp: new Date().toLocaleTimeString(),
            isPrivate: data.isPrivate,
            room: data.isPrivate ? data.room : targetRoom  // CRITICAL: Use original room name for private chats
        };

        // Store message
        messages[targetRoom] = messages[targetRoom] || [];
        messages[targetRoom].push(msg);

        // Broadcast to room
        io.to(targetRoom).emit("receiveMessage", msg);
        console.log(`   ✅ Message sent to room: ${targetRoom}`);
    });

    // === JOIN CHANNEL - FIXED ===
    socket.on("joinChannel", ({ name, password }) => {
        const user = usersBySocket[socket.id];
        if (!user) return;

        console.log(`\n📢 ${user.username} joining channel: ${name}`);

        if (!channels[name]) {
            console.log(`   ❌ Channel doesn't exist`);
            return socket.emit("joinFail", `Channel '${name}' does not exist.`);
        }

        if (channels[name].password && channels[name].password !== password) {
            console.log(`   ❌ Wrong password`);
            return socket.emit("joinFail", "Wrong password for channel.");
        }

        leaveAllRooms(socket, name);
        socket.join(name);
        console.log(`   ✅ Joined channel: ${name}`);

        // Send message history
        if (messages[name]) {
            console.log(`   📜 Sending ${messages[name].length} messages`);
            messages[name].forEach(m => socket.emit("receiveMessage", m));
        }

        socket.emit("receiveMessage", {
            type: "system",
            content: `You joined ${name}`,
            room: name,
            timestamp: new Date().toLocaleTimeString()
        });
    });

    // === CREATE CHANNEL - FIXED ===
    socket.on("createChannel", ({ name, password }) => {
        const user = usersBySocket[socket.id];
        if (!user) return;

        console.log(`\n🆕 Creating channel: ${name} by ${user.username}`);
        console.log(`   Password: ${password ? 'Yes' : 'No'}`);

        if (channels[name]) {
            console.log(`   ❌ Channel already exists`);
            return socket.emit("joinFail", `Channel '${name}' already exists.`);
        }

        channels[name] = { password: password || null };
        messages[name] = []; // Initialize message array
        
        console.log(`   ✅ Channel created successfully`);
        
        // Broadcast updated channel list to ALL users
        io.emit("channelList", Object.keys(channels));
        
        // Automatically join the creator to the new channel
        leaveAllRooms(socket, name);
        socket.join(name);
        
        socket.emit("receiveMessage", {
            type: "system",
            content: `Channel '${name}' created successfully. You have been added to it.`,
            room: name,
            timestamp: new Date().toLocaleTimeString()
        });
    });

    // === JOIN PRIVATE CHAT - FIXED ===
    socket.on("joinPrivate", otherUsername => {
        const user = usersBySocket[socket.id];
        if (!user) return;

        console.log(`\n💬 ${user.username} opening private chat with ${otherUsername}`);

        const otherSocketId = usersByName[otherUsername];
        if (!otherSocketId) {
            console.log(`   ❌ User offline`);
            return socket.emit("receiveMessage", {
                type: "system",
                content: `User ${otherUsername} is offline.`,
                room: otherUsername,
                timestamp: new Date().toLocaleTimeString()
            });
        }

        const roomId = getPrivateRoom(user.username, otherUsername);
        console.log(`   Private Room ID: ${roomId}`);
        
        leaveAllRooms(socket, roomId);
        socket.join(roomId);
        console.log(`   ✅ ${user.username} joined private room`);

        // Ensure the other user is in the room too
        const otherSocket = io.sockets.sockets.get(otherSocketId);
        if (otherSocket && !otherSocket.rooms.has(roomId)) {
            otherSocket.join(roomId);
            console.log(`   ✅ ${otherUsername} added to private room`);
        }

        // Send message history
        if (messages[roomId]) {
            console.log(`   📜 Sending ${messages[roomId].length} messages`);
            // CRITICAL FIX: Send messages with correct room name for UI
            messages[roomId].forEach(m => {
                const msgCopy = { ...m, room: otherUsername };
                socket.emit("receiveMessage", msgCopy);
            });
        } else {
            console.log(`   📜 No message history`);
        }
    });

    // === WebRTC SIGNALING ===
    socket.on("callUser", data => {
        const user = usersBySocket[socket.id];
        if (!user) return;

        const recipientSocketId = usersByName[data.userToCall];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("incomingCall", {
                signal: data.signalData,
                name: user.username,
                fromSocketId: socket.id,
                video: data.video
            });
            console.log(`📞 ${user.username} calling ${data.userToCall}`);
        }
    });

    socket.on("answerCall", data => {
        io.to(data.toSocketId).emit("callAnswered", { signal: data.signal });
        console.log(`✅ Call answered`);
    });

    socket.on("rejectCall", data => {
        io.to(data.toSocketId).emit("callEnded");
        console.log(`❌ Call rejected`);
    });

    socket.on("endCall", data => {
        io.to(data.toSocketId).emit("callEnded");
        console.log(`📴 Call ended`);
    });

    // === DISCONNECT ===
    socket.on("disconnect", () => {
        const user = usersBySocket[socket.id];
        if (user) {
            console.log(`\n❌ ${user.username} disconnected`);
            delete usersByName[user.username];
            delete usersBySocket[socket.id];
            io.emit("updateUserList", usersBySocket);
        }
    });
});

// === FILE UPLOAD API ===
app.post("/upload", (req, res) => {
    try {
        if (!req.files || !req.files.file) {
            return res.status(400).json({ error: "No files were uploaded." });
        }

        const file = req.files.file;
        const ext = path.extname(file.name) || '.bin';
        const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
        const uploadPath = path.join(UPLOAD_DIR, filename);

        file.mv(uploadPath, err => {
            if (err) {
                console.error("Upload error:", err);
                return res.status(500).json({ error: "Upload failed: " + err.message });
            }

            console.log(`📎 File uploaded: ${filename} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
            res.json({
                url: `/uploads/${filename}`,
                type: file.mimetype,
                size: file.size
            });
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Upload failed: " + error.message });
    }
});

// === Serve main HTML ===
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// === START SERVER ===
server.listen(PORT, "0.0.0.0", () => {
    const protocol = isHttps ? "https" : "http";
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚀 LAN MESSENGER SERVER STARTED`);
    console.log(`${"=".repeat(60)}`);
    console.log(`📡 Protocol: ${protocol.toUpperCase()}`);
    console.log(`🔌 Port: ${PORT}`);
    console.log(`${"=".repeat(60)}`);
    console.log(`\n🌐 ACCESS FROM:\n`);
    console.log(`   📱 This device: ${protocol}://localhost:${PORT}`);
    
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(name => {
        interfaces[name].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`   🌍 Network (${name}): ${protocol}://${iface.address}:${PORT}`);
            }
        });
    });
    
    console.log(`\n${"=".repeat(60)}`);
    if (!isHttps) {
        console.log(`\n⚠️  RUNNING IN HTTP MODE`);
        console.log(`   Voice messages & calls require HTTPS!`);
        console.log(`\n📝 To enable HTTPS, generate certificates:`);
        console.log(`   openssl req -x509 -newkey rsa:2048 -nodes \\`);
        console.log(`           -keyout key.pem -out cert.pem -days 365`);
        console.log(`\n   Then restart the servera.`);
        console.log(`${"=".repeat(60)}\n`);
    } else {
        console.log(`\n✅ HTTPS ENABLED - All features available!`);
        console.log(`${"a=".repeat(60)}\n`);
    }
});1

// === Error Handling ===
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});