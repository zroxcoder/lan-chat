const socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });
let myUsername = "";
let currentRoom = "General";
let isPrivate = false;
let previousRoom = "General";
let usersList = {};
let usersByName = {};
let mediaRecorder = null;
let recordingChunks = [];
let recordingStream = null;
let isRecording = false;
let recordingStartTime = 0;

(function checkSession() {
    const storedUsername = localStorage.getItem('lanMessengerUsername');
    if (storedUsername) {
        myUsername = storedUsername;
        document.getElementById("username").value = storedUsername;
        join(true);
    }
})();

function scrollMessages() {
    const box = document.getElementById("messages");
    setTimeout(() => { box.scrollTop = box.scrollHeight; }, 0);
}

socket.on("connect", () => {
    document.getElementById("status").innerText = "Connected ✓";
    document.getElementById("status").style.color = "rgba(255,255,255,0.9)";
    if (myUsername) {
        socket.emit("join", myUsername);
    }
});

socket.on("connect_error", () => {
    document.getElementById("status").innerText = "Server not reachable ✗";
    document.getElementById("status").style.color = "#f56565";
});

socket.on("joinFail", (msg) => {
    alert(msg);
    localStorage.removeItem('lanMessengerUsername');
    myUsername = "";
    document.getElementById("username").value = "";
    document.getElementById("login").style.display = "flex";
    document.getElementById("app").style.display = "none";
});

function join(isReconnect = false) {
    const input = document.getElementById("username");
    const name = input.value.trim();
    if (!name) return alert("Please enter your name");
    
    localStorage.setItem('lanMessengerUsername', name);
    myUsername = name;
    socket.emit("join", myUsername);
}

socket.on("joinSuccess", () => {
    document.getElementById("login").style.display = "none";
    document.getElementById("app").style.display = "flex";
    switchChatUIOnly("General", false);
    
    // Set current user
    document.getElementById("current-name").textContent = myUsername;
    const avatar = localStorage.getItem('lanMessengerAvatar') || `https://ui-avatars.com/api/?name=${encodeURIComponent(myUsername)}&background=667eea&color=fff&bold=true`;
    document.getElementById("current-avatar").src = avatar;
});

function updateActiveUserAndChannel(roomTitle, isPrivateChat) {
    document.querySelectorAll(".user-item, .channel-item").forEach(el => el.classList.remove("active"));
    document.getElementById("chat-title").innerText = roomTitle;

    if (isPrivateChat) {
        const userDiv = Array.from(document.querySelectorAll("#users .user-item span"))
            .find(span => span.textContent === roomTitle)?.closest(".user-item");
        if (userDiv) userDiv.classList.add("active");
    } else {
        const channelDiv = Array.from(document.querySelectorAll("#channels .channel-item"))
            .find(div => div.textContent.trim().includes(roomTitle));
        if (channelDiv) channelDiv.classList.add("active");
    }
}

socket.on("updateUserList", list => {
    usersList = list;
    usersByName = {};
    const div = document.getElementById("users");
    div.innerHTML = "";
    
    Object.entries(list).forEach(([id, u]) => {
        usersByName[u.username] = id;
        if (u.username === myUsername) return;
        
        const item = document.createElement("div");
        item.className = "user-item";
        item.innerHTML = `<img src="${u.avatar}" class="avatar"><span>${u.username}</span>`;
        item.onclick = () => switchChat(u.username, true);
        div.appendChild(item);
    });
    updateActiveUserAndChannel(currentRoom, isPrivate);
});

socket.on("channelList", list => {
    const div = document.getElementById("channels");
    div.innerHTML = "";
    
    list.forEach(c => {
        const item = document.createElement("div");
        item.className = "channel-item";
        item.innerHTML = `<i class="fa-solid fa-hashtag"></i> ${c.name} <span style="font-size:10px;color:var(--text-muted);float:right;">${c.members}</span>`;
        item.onclick = () => switchChat(c.name, false);
        div.appendChild(item);
    });
    updateActiveUserAndChannel(currentRoom, isPrivate);
});

function handleEnter(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
    }
}

function sendMsg() {
    const input = document.getElementById("msg-input");
    const msg = input.value.trim();
    if (!msg) return;
    
    socket.emit("sendMessage", {
        room: currentRoom,
        isPrivate,
        type: "text",
        content: msg
    });
    input.value = "";
}

socket.on("receiveMessage", msg => {
    if (!msg || !msg.sender) return;
    
    let shouldShow = false;
    if (msg.isPrivate) {
        shouldShow = (msg.sender.username === currentRoom && isPrivate) || (msg.sender.username === myUsername && currentRoom === msg.room && isPrivate);
    } else {
        shouldShow = (msg.room === currentRoom && !isPrivate);
    }
    
    if (!shouldShow) return;
    renderMessage(msg);
    scrollMessages();
});

socket.on("loadMessages", msgs => {
    msgs.forEach(msg => renderMessage(msg));
    scrollMessages();
});

let messageQueue = [];
let renderTimeout = null;

function renderMessage(msg) {
    const box = document.getElementById("messages");
    // Limit to 50 messages for speed
    if (box.children.length >= 50) {
        box.removeChild(box.firstChild);
    }
    const div = document.createElement("div");
    const isMe = msg.sender.username === myUsername;
    div.className = `msg ${msg.type === 'system' ? 'system' : (isMe ? 'self' : 'other')}`;
    
    let content = msg.content;
    
    if (msg.type === "image") {
        content = `<div class="media-container"><img src="${msg.content}" alt="Image" onclick="window.open('${msg.content}', '_blank')"></div>`;
    } else if (msg.type === "video") {
        content = `<div class="media-container"><video src="${msg.content}" controls></video></div>`;
    } else if (msg.type === "audio") {
        content = `<audio src="${msg.content}" controls></audio>`;
    } else if (msg.type === "file") {
        const fname = msg.content.split('/').pop();
        content = `<a href="${msg.content}" target="_blank" style="color:white;text-decoration:underline;">📄 ${fname}</a>`;
    }

    if (msg.type !== "system") {
        let ticks = '';
        if (isMe) {
            if (msg.readBy && msg.readBy.length > 1) {
                ticks = '<span style="color:#48bb78;">✓✓</span>';
            } else {
                ticks = '<span style="color:var(--text-muted);">✓</span>';
            }
        }
        div.innerHTML = `
            <span class="sender-name">${isMe ? 'You' : msg.sender.username}</span>
            ${content}
            <div style="font-size:10px;color:var(--text-muted);text-align:right;margin-top:3px;display:flex;justify-content:space-between;align-items:center;">
                <span>${msg.timestamp}</span>
                ${ticks}
            </div>
        `;
    } else {
        div.innerHTML = content;
    }
    
    box.appendChild(div);
    // Debounced scroll
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => scrollMessages(), 100);
}

// Debounce input for speed
let inputTimeout = null;
document.getElementById("msg-input").addEventListener("input", () => {
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
        // Optional: Add any processing here if needed
    }, 100);
});

function switchChatUIOnly(title, privateChat) {
    currentRoom = title;
    isPrivate = privateChat;
    updateActiveUserAndChannel(title, privateChat);
    closeSidebar();
}

function closeSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    sidebar.classList.remove("show");
    if (overlay) overlay.classList.remove("show");
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const isShowing = sidebar.classList.contains("show");
    
    if (isShowing) {
        closeSidebar();
    } else {
        sidebar.classList.add("show");
        if (overlay) overlay.classList.add("show");
        document.getElementById("sticker-picker").style.display = "none";
    }
}

// Add event listener for overlay
document.getElementById("sidebar-overlay").addEventListener('click', closeSidebar);

function switchChat(title, privateChat = false) {
    if (currentRoom === title && isPrivate === privateChat) return;
    
    if (privateChat && !usersByName[title]) {
        alert("User is offline");
        return;
    }
    
    previousRoom = currentRoom;
    document.getElementById("messages").innerHTML = "";
    currentRoom = title;
    isPrivate = privateChat;
    updateActiveUserAndChannel(title, privateChat);

    if (privateChat) {
        socket.emit("joinPrivate", title);
    } else {
        let password = null;
        if (title !== 'General') {
            password = prompt(`Enter password for ${title}:`);
            if (password === null) {
                switchChatUIOnly(previousRoom, previousRoom !== 'General' && !!usersByName[previousRoom]);
                return;
            }
        }
        socket.emit("joinChannel", { name: title, password: password });
    }
    
    closeSidebar();
}

function createChannel() {
    const name = prompt("Enter Channel Name:");
    if (!name || !name.trim()) return;
    const password = prompt("Enter Password (optional):");
    socket.emit("createChannel", { name: name.trim(), password: password?.trim() || null });
}

function uploadAvatar() {
    const fileInput = document.getElementById("avatar-input");
    const file = fileInput.files[0];
    if (!file) return;
    
    const form = new FormData();
    form.append("file", file);
    
    fetch("/upload", { method: "POST", body: form })
        .then(r => r.json())
        .then(data => {
            const avatarUrl = data.url;
            localStorage.setItem('lanMessengerAvatar', avatarUrl);
            document.getElementById("current-avatar").src = avatarUrl;
            // Update user list
            socket.emit("updateAvatar", avatarUrl);
        })
        .catch(err => {
            console.error("Avatar upload error:", err);
            alert("Avatar upload failed.");
        });
    
    fileInput.value = "";
}

function uploadFile() {
    const fileInput = document.getElementById("file-input");
    const file = fileInput.files[0];
    if (!file) return;
    
    const form = new FormData();
    form.append("file", file);
    
    const tempMsg = document.createElement("div");
    tempMsg.className = "msg system";
    tempMsg.innerText = "Uploading file...";
    document.getElementById("messages").appendChild(tempMsg);
    scrollMessages();

    fetch("/upload", { method: "POST", body: form })
        .then(r => r.json())
        .then(data => {
            tempMsg.remove();
            let type = "file";
            if (data.type.startsWith("image/")) type = "image";
            else if (data.type.startsWith("video/")) type = "video";
            else if (data.type.startsWith("audio/")) type = "audio";
            
            socket.emit("sendMessage", { room: currentRoom, isPrivate, type, content: data.url });
        })
        .catch(err => {
            console.error("Upload error:", err);
            tempMsg.remove();
            alert("File upload failed.");
        });
    
    fileInput.value = "";
}

async function startVoiceRecord() {
    if (isRecording) return;
    
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     /^192\.168\./.test(window.location.hostname) ||
                     /^10\./.test(window.location.hostname) ||
                     /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname);
    
    if (!isSecure) {
        alert("⚠️ Voice messages require HTTPS!");
        return;
    }
    
    try {
        isRecording = true;
        recordingStartTime = Date.now();
        recordingStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: true, 
                noiseSuppression: true, 
                autoGainControl: true,
                sampleRate: 48000,
                channelCount: 1
            } 
        });
        recordingChunks = [];
        
        const micBtn = document.getElementById("mic-btn");
        micBtn.classList.add("recording");
        document.getElementById("msg-input").placeholder = "🎙️ Recording...";
        
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm';
        }
        
        const options = {
            mimeType,
            audioBitsPerSecond: 192000 // Confirmed 192kbps
        };
        
        mediaRecorder = new MediaRecorder(recordingStream, options);
        
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) recordingChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            const duration = Date.now() - recordingStartTime;
            const micBtn = document.getElementById("mic-btn");
            micBtn.classList.remove("recording");
            document.getElementById("msg-input").placeholder = "Type a message...";
            
            if (duration < 500 || recordingChunks.length === 0) {
                cleanupRecording();
                return;
            }
            
            const blob = new Blob(recordingChunks, { type: mimeType });
            if (blob.size < 100) {
                cleanupRecording();
                return;
            }
            
            const formData = new FormData();
            formData.append("file", blob, `voice_${Date.now()}.webm`);
            
            const tempMsg = document.createElement("div");
            tempMsg.className = "msg system";
            tempMsg.innerText = "Uploading voice...";
            document.getElementById("messages").appendChild(tempMsg);
            scrollMessages();

            try {
                const res = await fetch("/upload", { method: "POST", body: formData });
                const data = await res.json();
                tempMsg.remove();
                socket.emit("sendMessage", { room: currentRoom, isPrivate, type: "audio", content: data.url });
            } catch (err) {
                tempMsg.remove();
                console.error("Audio upload error:", err);
            }
            
            cleanupRecording();
        };
        
        mediaRecorder.start();
        
    } catch (err) {
        alert("Microphone access denied");
        isRecording = false;
        const micBtn = document.getElementById("mic-btn");
        micBtn.classList.remove("recording");
    }
}

function stopVoiceRecord() {
    const micBtn = document.getElementById("mic-btn");
    
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
    
    micBtn.classList.remove("recording");
}

function cleanupRecording() {
    if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
    }
    mediaRecorder = null;
    recordingChunks = [];
    isRecording = false;
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const isShowing = sidebar.classList.contains("show");
    
    if (isShowing) {
        closeSidebar();
    } else {
        sidebar.classList.add("show");
        if (overlay) overlay.classList.add("show");
        document.getElementById("sticker-picker").style.display = "none";
    }
}

function toggleStickerPicker() {
    const picker = document.getElementById("sticker-picker");
    picker.style.display = picker.style.display === "none" ? "block" : "none";
}

function sendSticker(sticker) {
    socket.emit("sendMessage", {
        room: currentRoom,
        isPrivate,
        type: "text",
        content: sticker
    });
    document.getElementById("sticker-picker").style.display = "none";
}

function sendGif() {
    const gifUrl = document.getElementById("gif-url").value.trim();
    if (!gifUrl) return;
    socket.emit("sendMessage", {
        room: currentRoom,
        isPrivate,
        type: "image",
        content: gifUrl
    });
    document.getElementById("gif-url").value = "";
    document.getElementById("sticker-picker").style.display = "none";
}

function logout(event) {
    event.stopPropagation();
    localStorage.removeItem('lanMessengerUsername');
    localStorage.removeItem('lanMessengerAvatar');
    location.reload();
}

socket.on("disconnect", () => {
    document.getElementById("status").innerText = "Disconnected ✗";
    document.getElementById("status").style.color = "#f56565";
});

function fixVH() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}
fixVH();
window.addEventListener('resize', fixVH);