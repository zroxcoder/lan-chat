// server.js - FINAL VERSION (Without Call Features, HTTP mode for Cloudflare Tunnel)
const express = require("express");
const http = require("http"); // Only HTTP now
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
    limits: { fileSize: 150 * 1024 * 1024 }, // Increased to 150MB
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
let channelMembers = {}; // Track members in channels

// Helper: Get deterministic private room ID
function getPrivateRoom(usernameA, usernameB) {
    return [usernameA, usernameB].sort().join("___PRIVATE___");
}

// Helper: Leave all rooms except specified
function leaveAllRooms(socket, exceptRoom) {
    Array.from(socket.rooms).forEach(r => {
        if (r !== socket.id && r !== exceptRoom) {
            socket.leave(r);
        }
    });
}

// === HTTP Setup for Cloudflare Tunnel ===
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
console.log("⚠️  Running in HTTP mode for Cloudflare Tunnel");

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

    socket.on("join", username => {
        console.log(`👤 Join request from: ${username}`);
        
        if (usersByName[username] && usersByName[username] !== socket.id) {
            console.log(`❌ Username '${username}' already taken`);
            return socket.emit("joinFail", `Username '${username}' is already taken.`);
        }
        
        const oldUser = usersBySocket[socket.id];
        if (oldUser && oldUser.username !== username) {
            delete usersByName[oldUser.username];
        }

        usersBySocket[socket.id] = {
            username,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff&bold=true`
        };
        usersByName[username] = socket.id;

        leaveAllRooms(socket, "General");
        socket.join("General");

        console.log(`✅ ${username} registered and joined General`);
        
        // Add to General members
        if (!channelMembers["General"]) channelMembers["General"] = new Set();
        channelMembers["General"].add(username);
        
        socket.emit("joinSuccess");
        io.emit("updateUserList", usersBySocket);
        io.emit("channelList", Object.keys(channels).map(c => ({ name: c, members: channelMembers[c]?.size || 0 })));

        const welcome = {
            type: "system",
            content: `${username} joined General`,
            room: "General",
            sender: usersBySocket[socket.id],
            timestamp: new Date().toLocaleTimeString(),
            isPrivate: false
        };

        messages.General = messages.General || [];
        messages.General.push(welcome);
        io.to("General").emit("receiveMessage", welcome);
    });

    socket.on("sendMessage", data => {
        const user = usersBySocket[socket.id];
        if (!user) return;

        let targetRoom = data.room;

        if (data.isPrivate) {
            const recipientUsername = data.room;
            const recipientSocketId = usersByName[recipientUsername];
            
            if (!recipientSocketId) {
                return socket.emit("receiveMessage", {
                    type: "system",
                    content: `User ${recipientUsername} is offline.`,
                    room: recipientUsername,
                    isPrivate: true,
                    sender: user,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
            
            targetRoom = getPrivateRoom(user.username, recipientUsername);
            
            if (!socket.rooms.has(targetRoom)) socket.join(targetRoom);
            
            const recipientSocket = io.sockets.sockets.get(recipientSocketId);
            if (recipientSocket && !recipientSocket.rooms.has(targetRoom)) recipientSocket.join(targetRoom);
        }

        const msg = {
            sender: user,
            type: data.type || "text",
            content: data.content,
            timestamp: new Date().toLocaleTimeString(),
            isPrivate: data.isPrivate,
            room: data.isPrivate ? data.room : targetRoom,
            readBy: [user.username] // Sender has read it
        };

        messages[targetRoom] = messages[targetRoom] || [];
        messages[targetRoom].push(msg);

        if (messages[targetRoom].length > 200) messages[targetRoom].shift(); // Increased to 200

        io.to(targetRoom).emit("receiveMessage", msg);
    });

    socket.on("joinChannel", ({ name, password }) => {
        const user = usersBySocket[socket.id];
        if (!user) return;

        console.log(`📢 ${user.username} joining channel: ${name}`);

        if (!channels[name]) {
            console.log(`❌ Channel doesn't exist`);
            return socket.emit("joinFail", `Channel '${name}' does not exist.`);
        }

        if (channels[name].password && channels[name].password !== password) {
            console.log(`❌ Wrong password`);
            return socket.emit("joinFail", "Wrong password for channel.");
        }

        leaveAllRooms(socket, name);
        socket.join(name);
        console.log(`✅ Joined channel: ${name}`);

        // Add to channel members
        if (!channelMembers[name]) channelMembers[name] = new Set();
        channelMembers[name].add(user.username);

        if (messages[name]) {
            const recentMessages = messages[name].slice(-20); // Send only last 20 messages
            socket.emit("loadMessages", recentMessages.map(m => {
                if (!m.readBy) m.readBy = [];
                if (!m.readBy.includes(user.username)) m.readBy.push(user.username);
                return m;
            }));
        }

        socket.emit("receiveMessage", {
            type: "system",
            content: `You joined ${name}`,
            room: name,
            sender: user,
            timestamp: new Date().toLocaleTimeString(),
            isPrivate: false
        });
    });

    socket.on("createChannel", ({ name, password }) => {
        const user = usersBySocket[socket.id];
        if (!user) return;

        console.log(`🆕 Creating channel: ${name} by ${user.username}`);

        if (channels[name]) {
            console.log(`❌ Channel already exists`);
            return socket.emit("joinFail", `Channel '${name}' already exists.`);
        }

        channels[name] = { password: password || null };
        messages[name] = [];
        channelMembers[name] = new Set([user.username]); // Initialize with creator
        
        console.log(`✅ Channel created successfully`);
        io.emit("channelList", Object.keys(channels).map(c => ({ name: c, members: channelMembers[c]?.size || 0 })));
        
        leaveAllRooms(socket, name);
        socket.join(name);
        
        socket.emit("receiveMessage", {
            type: "system",
            content: `Channel '${name}' created. You have been added.`,
            room: name,
            sender: user,
            timestamp: new Date().toLocaleTimeString(),
            isPrivate: false
        });
    });

    socket.on("updateAvatar", avatarUrl => {
        const user = usersBySocket[socket.id];
        if (user) {
            user.avatar = avatarUrl;
            io.emit("updateUserList", usersBySocket);
        }
    });

    socket.on("joinPrivate", otherUsername => {
        const user = usersBySocket[socket.id];
        if (!user) return;

        console.log(`💬 ${user.username} opening private chat with ${otherUsername}`);

        const otherSocketId = usersByName[otherUsername];
        if (!otherSocketId) {
            console.log(`❌ User offline`);
            return socket.emit("receiveMessage", {
                type: "system",
                content: `User ${otherUsername} is offline.`,
                room: otherUsername,
                sender: user,
                timestamp: new Date().toLocaleTimeString(),
                isPrivate: true
            });
        }

        const roomId = getPrivateRoom(user.username, otherUsername);
        console.log(`💬 Private Room ID: ${roomId}`);
        
        leaveAllRooms(socket, roomId);
        socket.join(roomId);

        const otherSocket = io.sockets.sockets.get(otherSocketId);
        if (otherSocket && !otherSocket.rooms.has(roomId)) otherSocket.join(roomId);

        if (messages[roomId]) {
            const recentMessages = messages[roomId].slice(-50); // Send only last 50 messages
            socket.emit("loadMessages", recentMessages.map(m => {
                if (!m.readBy) m.readBy = [];
                if (!m.readBy.includes(user.username)) m.readBy.push(user.username);
                const msgCopy = { ...m, room: otherUsername };
                return msgCopy;
            }));
        }
    });

    socket.on("disconnect", () => {
        const user = usersBySocket[socket.id];
        if (user) {
            console.log(`\n❌ ${user.username} disconnected`);
            delete usersByName[user.username];
            delete usersBySocket[socket.id];
            
            // Remove from channel members
            Object.keys(channelMembers).forEach(channel => {
                channelMembers[channel].delete(user.username);
            });
            
            io.emit("updateUserList", usersBySocket);
            io.emit("channelList", Object.keys(channels).map(c => ({ name: c, members: channelMembers[c]?.size || 0 })));

            const disconnect = {
                type: "system",
                content: `${user.username} left`,
                room: "General",
                sender: user,
                timestamp: new Date().toLocaleTimeString(),
                isPrivate: false
            };
            
            messages.General = messages.General || [];
            messages.General.push(disconnect);
            io.to("General").emit("receiveMessage", disconnect);
        }
    });
});

// === FILE UPLOAD API ===
app.post("/upload", (req, res) => {
    try {
        if (!req.files || !req.files.file) return res.status(400).json({ error: "No files uploaded" });

        const file = req.files.file;
        const ext = path.extname(file.name) || '.bin';
        const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
        const uploadPath = path.join(UPLOAD_DIR, filename);

        file.mv(uploadPath, err => {
            if (err) return res.status(500).json({ error: "Upload failed" });

            console.log(`📎 File uploaded: ${filename} (${(file.size / 1024).toFixed(2)}KB)`);
            res.json({ url: `/uploads/${filename}`, type: file.mimetype, size: file.size });
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Upload failed" });
    }
});

// === Serve main HTML ===
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// === START SERVER ===
server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚀 LAN MESSENGER SERVER STARTED`);
    console.log(`${"=".repeat(60)}`);
    console.log(`📡 Protocol: HTTP`);
    console.log(`🔌 Port: ${PORT}`);
    console.log(`${"=".repeat(60)}`);
    console.log(`\n🌐 ACCESS FROM:\n`);
    console.log(`   📱 This device: http://localhost:${PORT}`);
    
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(name => {
        interfaces[name].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`   🌍 Network (${name}): http://${iface.address}:${PORT}`);
            }
        });
    });

    console.log(`\n⚠️  RUNNING IN HTTP MODE FOR CLOUDFLARE TUNNEL`);
    console.log(`${"=".repeat(60)}\n`);
});

process.on('uncaughtException', (err) => console.error('❌ Uncaught Exception:', err));
process.on('unhandledRejection', (reason, promise) => console.error('❌ Unhandled Rejection:', reason));
