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

// Reply & Edit state
let replyingTo = null;
let editingMessage = null;

// Typing indicator state
let typingTimeout = null;
let isTyping = false;
let currentTypers = new Set();

// Reaction state
let currentReactionMessage = null;

// Mobile action menu state
let currentActionMessageId = null;
let currentActionMessageData = null;

// Detect if mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;

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
        if (editingMessage) {
            saveEdit();
        } else {
            sendMsg();
        }
    }
}

// Typing Indicator
function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        socket.emit("typing", { room: currentRoom, isPrivate });
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit("stopTyping", { room: currentRoom, isPrivate });
    }, 2000);
}

socket.on("userTyping", ({ username, room, isPrivate: isPrivateRoom }) => {
    if ((isPrivateRoom && room === currentRoom && isPrivate) || (!isPrivateRoom && room === currentRoom && !isPrivate)) {
        currentTypers.add(username);
        updateTypingIndicator();
    }
});

socket.on("userStoppedTyping", ({ username, room, isPrivate: isPrivateRoom }) => {
    if ((isPrivateRoom && room === currentRoom && isPrivate) || (!isPrivateRoom && room === currentRoom && !isPrivate)) {
        currentTypers.delete(username);
        updateTypingIndicator();
    }
});

function updateTypingIndicator() {
    const indicator = document.getElementById("typing-indicator");
    if (currentTypers.size === 0) {
        indicator.innerHTML = "";
    } else if (currentTypers.size === 1) {
        const typer = Array.from(currentTypers)[0];
        indicator.innerHTML = `${typer} is typing<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
    } else if (currentTypers.size === 2) {
        const typers = Array.from(currentTypers);
        indicator.innerHTML = `${typers[0]} and ${typers[1]} are typing<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
    } else {
        indicator.innerHTML = `Several people are typing<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
    }
}

function sendMsg() {
    const input = document.getElementById("msg-input");
    const msg = input.value.trim();
    if (!msg) return;
    
    const messageData = {
        room: currentRoom,
        isPrivate,
        type: "text",
        content: msg
    };

    // Add reply data if replying
    if (replyingTo) {
        messageData.replyTo = replyingTo;
    }
    
    socket.emit("sendMessage", messageData);
    input.value = "";
    cancelReply();
    
    // Stop typing
    if (isTyping) {
        isTyping = false;
        socket.emit("stopTyping", { room: currentRoom, isPrivate });
    }
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
    
    // Mark as viewed immediately when message appears (if not sent by me)
    if (msg.sender.username !== myUsername && msg.messageId) {
        setTimeout(() => {
            socket.emit("messageViewed", {
                messageId: msg.messageId,
                room: currentRoom,
                isPrivate: isPrivate
            });
        }, 100);
    }
});

socket.on("loadMessages", msgs => {
    msgs.forEach(msg => renderMessage(msg));
    scrollMessages();
    
    // Mark all loaded messages as viewed (except mine)
    setTimeout(() => {
        msgs.forEach(msg => {
            if (msg.sender.username !== myUsername && msg.messageId) {
                socket.emit("messageViewed", {
                    messageId: msg.messageId,
                    room: currentRoom,
                    isPrivate: isPrivate
                });
            }
        });
    }, 500);
});

// Message viewed update - FIXED
socket.on("messageViewedUpdate", ({ messageId, viewedBy }) => {
    const msgElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgElement) {
        const ticksElement = msgElement.querySelector('.read-ticks');
        if (ticksElement) {
            // Check if more than just the sender has viewed it
            if (viewedBy && viewedBy.length > 1) {
                ticksElement.innerHTML = '<span style="color:#48bb78;">✓✓</span>'; // Blue double ticks
            } else {
                ticksElement.innerHTML = '<span style="color:rgba(255,255,255,0.5);">✓✓</span>'; // Gray double ticks (sent)
            }
        }
    }
});

// Message edited update
socket.on("messageEdited", ({ messageId, newContent }) => {
    const msgElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgElement) {
        const contentElement = msgElement.querySelector('.msg-content');
        if (contentElement) {
            contentElement.innerHTML = escapeHtml(newContent) + ' <span class="edited-indicator">(edited)</span>';
        }
    }
});

// Reaction update
socket.on("reactionUpdate", ({ messageId, reactions }) => {
    const msgElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgElement) {
        updateReactionsDisplay(msgElement, reactions);
    }
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
    div.dataset.messageId = msg.messageId || (msg.timestamp + '_' + msg.sender.username);
    
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

    // Build reply HTML if this message is a reply
    let replyHtml = '';
    if (msg.replyTo) {
        const replyContent = msg.replyTo.content.length > 50 ? msg.replyTo.content.substring(0, 50) + '...' : msg.replyTo.content;
        replyHtml = `
            <div class="reply-container" onclick="scrollToMessage('${msg.replyTo.messageId}')">
                <div class="reply-sender">${msg.replyTo.sender}</div>
                <div class="reply-content">${escapeHtml(replyContent)}</div>
            </div>
        `;
    }

    if (msg.type !== "system") {
        let ticks = '';
        if (isMe) {
            // Show gray double ticks for sent, blue for viewed
            if (msg.viewedBy && msg.viewedBy.length > 1) {
                ticks = '<span class="read-ticks" style="color:#48bb78;">✓✓</span>';
            } else {
                ticks = '<span class="read-ticks" style="color:rgba(255,255,255,0.5);">✓✓</span>';
            }
        }

        const canEdit = isMe && msg.type === 'text';
        
        // Desktop action buttons (hover)
        let desktopActions = '';
        if (!isMobile) {
            desktopActions = `
                <div class="msg-actions">
                    ${canEdit ? `<button class="msg-action-btn" onclick='startEdit(${JSON.stringify({
                        messageId: div.dataset.messageId,
                        content: msg.content
                    })})' title="Edit">
                        <i class="fa-solid fa-edit"></i>
                    </button>` : ''}
                    <button class="msg-action-btn" onclick='startReply(${JSON.stringify({
                        sender: msg.sender.username,
                        content: msg.content,
                        messageId: div.dataset.messageId
                    })})' title="Reply">
                        <i class="fa-solid fa-reply"></i>
                    </button>
                    <button class="msg-action-btn" onclick='showReactionPicker("${div.dataset.messageId}", event)' title="React">
                        <i class="fa-solid fa-smile"></i>
                    </button>
                </div>
            `;
        }

        const editedIndicator = msg.edited ? ' <span class="edited-indicator">(edited)</span>' : '';

        div.innerHTML = `
            ${desktopActions}
            <span class="sender-name">${isMe ? 'You' : msg.sender.username}</span>
            ${replyHtml}
            <span class="msg-content">${content}${editedIndicator}</span>
            <div style="font-size:10px;color:var(--text-muted);text-align:right;margin-top:3px;display:flex;justify-content:space-between;align-items:center;">
                <span>${msg.timestamp}</span>
                ${ticks}
            </div>
            <div class="reactions-container"></div>
        `;

        // Add mobile long-press for actions
        if (isMobile) {
            let pressTimer;
            div.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    showMobileActionMenu(div.dataset.messageId, {
                        canEdit,
                        sender: msg.sender.username,
                        content: msg.content,
                        messageId: div.dataset.messageId
                    });
                }, 500); // 500ms long press
            });
            
            div.addEventListener('touchend', () => {
                clearTimeout(pressTimer);
            });
            
            div.addEventListener('touchmove', () => {
                clearTimeout(pressTimer);
            });
        }

        // Update reactions if any
        if (msg.reactions) {
            updateReactionsDisplay(div, msg.reactions);
        }
    } else {
        div.innerHTML = content;
    }
    
    box.appendChild(div);
    // Debounced scroll
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => scrollMessages(), 100);
}

// Mobile Action Menu
function showMobileActionMenu(messageId, msgData) {
    currentActionMessageId = messageId;
    currentActionMessageData = msgData;
    
    const menu = document.getElementById('mobile-action-menu');
    const overlay = document.getElementById('mobile-menu-overlay');
    const buttonsContainer = document.getElementById('mobile-action-buttons');
    
    buttonsContainer.innerHTML = '';
    
    // Reply button
    const replyBtn = document.createElement('button');
    replyBtn.innerHTML = '<i class="fa-solid fa-reply"></i> Reply';
    replyBtn.style.cssText = 'width:100%;padding:12px;background:var(--glass);color:var(--text);border:none;border-radius:10px;font-weight:600;display:flex;align-items:center;gap:10px;justify-content:center;';
    replyBtn.onclick = () => {
        startReply(msgData);
        closeMobileMenu();
    };
    buttonsContainer.appendChild(replyBtn);
    
    // React button
    const reactBtn = document.createElement('button');
    reactBtn.innerHTML = '<i class="fa-solid fa-smile"></i> React';
    reactBtn.style.cssText = 'width:100%;padding:12px;background:var(--glass);color:var(--text);border:none;border-radius:10px;font-weight:600;display:flex;align-items:center;gap:10px;justify-content:center;';
    reactBtn.onclick = () => {
        closeMobileMenu();
        setTimeout(() => {
            showReactionPicker(messageId, { preventDefault: () => {}, stopPropagation: () => {} });
        }, 300);
    };
    buttonsContainer.appendChild(reactBtn);
    
    // Edit button (only for own text messages)
    if (msgData.canEdit) {
        const editBtn = document.createElement('button');
        editBtn.innerHTML = '<i class="fa-solid fa-edit"></i> Edit';
        editBtn.style.cssText = 'width:100%;padding:12px;background:var(--glass);color:var(--text);border:none;border-radius:10px;font-weight:600;display:flex;align-items:center;gap:10px;justify-content:center;';
        editBtn.onclick = () => {
            startEdit({ messageId: msgData.messageId, content: msgData.content });
            closeMobileMenu();
        };
        buttonsContainer.appendChild(editBtn);
    }
    
    menu.style.display = 'block';
    overlay.style.display = 'block';
    
    // Vibrate if supported
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
}

function closeMobileMenu() {
    document.getElementById('mobile-action-menu').style.display = 'none';
    document.getElementById('mobile-menu-overlay').style.display = 'none';
    currentActionMessageId = null;
    currentActionMessageData = null;
}

// Edit Functions
function startEdit(msgData) {
    editingMessage = msgData;
    const input = document.getElementById('msg-input');
    const editPreview = document.getElementById('edit-preview');
    const sendBtn = document.getElementById('send-btn');
    
    input.value = msgData.content;
    editPreview.style.display = 'block';
    sendBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    sendBtn.style.color = 'var(--accent)';
    input.focus();
    
    cancelReply(); // Can't reply and edit at same time
}

function cancelEdit() {
    editingMessage = null;
    document.getElementById('edit-preview').style.display = 'none';
    document.getElementById('msg-input').value = '';
    const sendBtn = document.getElementById('send-btn');
    sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    sendBtn.style.color = '';
}

function saveEdit() {
    const input = document.getElementById('msg-input');
    const newContent = input.value.trim();
    
    if (!newContent) {
        cancelEdit();
        return;
    }
    
    socket.emit("editMessage", {
        messageId: editingMessage.messageId,
        newContent,
        room: currentRoom,
        isPrivate
    });
    
    cancelEdit();
}

// Reply Functions
function startReply(msgData) {
    replyingTo = msgData;
    const preview = document.getElementById('reply-preview');
    const replyName = document.getElementById('reply-to-name');
    const replyContent = document.getElementById('reply-to-content');
    
    replyName.textContent = msgData.sender;
    const content = msgData.content.length > 50 ? msgData.content.substring(0, 50) + '...' : msgData.content;
    replyContent.textContent = content;
    
    preview.style.display = 'block';
    document.getElementById('msg-input').focus();
    
    cancelEdit(); // Can't reply and edit at same time
}

function cancelReply() {
    replyingTo = null;
    document.getElementById('reply-preview').style.display = 'none';
}

function scrollToMessage(messageId) {
    const msgElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgElement) {
        msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        msgElement.style.background = 'rgba(102, 126, 234, 0.3)';
        setTimeout(() => {
            msgElement.style.background = '';
        }, 2000);
    }
}

// Reaction Functions - FIXED for mobile
function showReactionPicker(messageId, event) {
    event.stopPropagation();
    event.preventDefault();
    
    const picker = document.getElementById('reaction-picker');
    currentReactionMessage = messageId;
    
    if (isMobile) {
        // Center picker on mobile
        picker.style.left = '50%';
        picker.style.top = '50%';
        picker.style.transform = 'translate(-50%, -50%)';
        picker.style.position = 'fixed';
    } else {
        // Position picker near the message on desktop
        const msgElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (msgElement) {
            const rect = msgElement.getBoundingClientRect();
            picker.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
            picker.style.top = (rect.bottom + 5) + 'px';
            picker.style.transform = 'none';
            picker.style.position = 'fixed';
        }
    }
    
    picker.style.display = 'block';
    
    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closeReactionPicker, { once: true });
        document.addEventListener('touchstart', closeReactionPicker, { once: true });
    }, 100);
}

function closeReactionPicker(e) {
    if (e && e.target.closest('#reaction-picker')) return;
    document.getElementById('reaction-picker').style.display = 'none';
    currentReactionMessage = null;
}

function addReaction(emoji) {
    if (!currentReactionMessage) return;
    
    socket.emit("addReaction", {
        messageId: currentReactionMessage,
        emoji,
        room: currentRoom,
        isPrivate
    });
    
    closeReactionPicker();
}

function updateReactionsDisplay(msgElement, reactions) {
    const container = msgElement.querySelector('.reactions-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.entries(reactions).forEach(([emoji, users]) => {
        if (users.length === 0) return;
        
        const reactionItem = document.createElement('div');
        reactionItem.className = 'reaction-item';
        if (users.includes(myUsername)) {
            reactionItem.classList.add('reacted');
        }
        
        reactionItem.innerHTML = `
            <span class="reaction-emoji">${emoji}</span>
            <span class="reaction-count">${users.length}</span>
        `;
        
        // Toggle reaction on click
        reactionItem.onclick = () => {
            socket.emit("addReaction", {
                messageId: msgElement.dataset.messageId,
                emoji,
                room: currentRoom,
                isPrivate
            });
        };
        
        // Show who reacted on hover
        reactionItem.title = users.join(', ');
        
        container.appendChild(reactionItem);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    cancelReply();
    cancelEdit();
    currentTypers.clear();
    updateTypingIndicator();
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
    cancelReply();
    cancelEdit();
    currentTypers.clear();
    updateTypingIndicator();

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
            
            const messageData = { room: currentRoom, isPrivate, type, content: data.url };
            if (replyingTo) {
                messageData.replyTo = replyingTo;
            }
            
            socket.emit("sendMessage", messageData);
            cancelReply();
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
            audioBitsPerSecond: 320000 // 320kbps quality
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
                
                const messageData = { room: currentRoom, isPrivate, type: "audio", content: data.url };
                if (replyingTo) {
                    messageData.replyTo = replyingTo;
                }
                
                socket.emit("sendMessage", messageData);
                cancelReply();
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

function toggleStickerPicker() {
    const picker = document.getElementById("sticker-picker");
    picker.style.display = picker.style.display === "none" ? "block" : "none";
}

function sendSticker(sticker) {
    const messageData = {
        room: currentRoom,
        isPrivate,
        type: "text",
        content: sticker
    };
    
    if (replyingTo) {
        messageData.replyTo = replyingTo;
    }
    
    socket.emit("sendMessage", messageData);
    document.getElementById("sticker-picker").style.display = "none";
    cancelReply();
}

function sendGif() {
    const gifUrl = document.getElementById("gif-url").value.trim();
    if (!gifUrl) return;
    
    const messageData = {
        room: currentRoom,
        isPrivate,
        type: "image",
        content: gifUrl
    };
    
    if (replyingTo) {
        messageData.replyTo = replyingTo;
    }
    
    socket.emit("sendMessage", messageData);
    document.getElementById("gif-url").value = "";
    document.getElementById("sticker-picker").style.display = "none";
    cancelReply();
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