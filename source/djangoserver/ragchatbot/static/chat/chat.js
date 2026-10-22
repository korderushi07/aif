document.addEventListener("DOMContentLoaded", () => {
    function renderMarkdown(md) {
        if (window.marked && window.DOMPurify) {
            marked.setOptions({ gfm: true, breaks: true });
            const html = marked.parse(md || "");
            return DOMPurify.sanitize(html);
        }
        return (md || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>");
    }
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(";").shift();
    }
    const csrftoken = getCookie("csrftoken");

    function closeAllChatMenus() {
        document.querySelectorAll(".chat-menu").forEach(m => m.remove());
    }
    document.addEventListener("click", () => closeAllChatMenus());

    const messagesEl = document.getElementById("messages");
    const formEl = document.getElementById("chatForm");
    const promptEl = document.getElementById("prompt");
    const sendBtn = document.getElementById("sendBtn");
    const newChatBtn = document.getElementById("newChatBtn");
    const sidebarTitle = document.getElementById("activeChatTitle");
    const topbarTitle = document.getElementById("topbarTitle");
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settingsModal");
    const settingsCloseBtn = document.getElementById("settingsCloseBtn");
    const providerSelect = document.getElementById("providerSelect");
    const apiKeyField = document.getElementById("apiKeyField");
    const apiKeyInput = document.getElementById("apiKeyInput");
    const baseUrlField = document.getElementById("baseUrlField");
    const baseUrlInput = document.getElementById("baseUrlInput");
    const modelInput = document.getElementById("modelInput");
    const tempInput = document.getElementById("tempInput");
    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    const settingsStatus = document.getElementById("settingsStatus");
    const clearKeyBtn = document.getElementById("clearKeyBtn");
    const chatListEl = document.getElementById("chatList");
    let currentChatId = null;

    clearKeyBtn?.addEventListener("click", async () => {
        settingsStatus.textContent = "Clearing...";
        const res = await fetch("/api/settings/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken,
            },
            body: JSON.stringify({ clear_api_key: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            settingsStatus.textContent = "Clear failed";
            return;
        }
        apiKeyInput.value = "";
        apiKeyInput.placeholder = "Paste key…";
        settingsStatus.textContent = "Cleared ✓";
    });

    function applyProviderUI(provider) {
        if (provider === "ollama") {
            baseUrlField.hidden = false;
            apiKeyField.hidden = true;
        } else {
            baseUrlField.hidden = true;
            apiKeyField.hidden = false;
        }
    }

    async function loadSettings() {
        const res = await fetch("/api/settings/");
        const data = await res.json();

        providerSelect.value = data.provider || "openai";
        apiKeyInput.value = "";
        apiKeyInput.placeholder = data.has_api_key ? "Saved (enter to replace)" : "Paste key…";
        baseUrlInput.value = data.base_url || "";
        modelInput.value = data.model || "";
        tempInput.value = String(data.temperature ?? 0.2);

        applyProviderUI(providerSelect.value);
    }

    async function saveSettings() {
        settingsStatus.textContent = "Saving...";
        const payload = {
            provider: providerSelect.value,
            api_key: apiKeyInput.value,
            base_url: baseUrlInput.value,
            model: modelInput.value.trim(),
            temperature: parseFloat(tempInput.value || "0.2"),
        };

        const res = await fetch("/api/settings/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            settingsStatus.textContent = "Save failed: " + (txt || res.status);
            return;
        }

        settingsStatus.textContent = "Saved ✓";
    }

    settingsBtn?.addEventListener("click", async () => {
        settingsModal.hidden = false;
        settingsStatus.textContent = "";
        await loadSettings();
    });

    settingsCloseBtn?.addEventListener("click", () => {
        settingsModal.hidden = true;
    });

    settingsModal?.addEventListener("click", (e) => {
        if (e.target === settingsModal) settingsModal.hidden = true;
    });

    providerSelect?.addEventListener("change", () => {
        applyProviderUI(providerSelect.value);
    });

    saveSettingsBtn?.addEventListener("click", saveSettings);


    let activeAbortController = null;
    let isStreaming = false;

    function setSendMode(mode) {
        if (mode === "stop") {
            sendBtn.textContent = "Stop";
            sendBtn.dataset.mode = "stop";
        } else {
            sendBtn.textContent = "Send";
            sendBtn.dataset.mode = "send";
        }
    }

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }


    function addMessage(role, text) {
        const wrap = document.createElement("div");
        wrap.className = `msg ${role}`;

        const bubble = document.createElement("div");
        bubble.className = "bubble";

        if (role === "bot") {
            bubble.innerHTML = renderMarkdown(text || "");
        } else {
            bubble.textContent = text || "";
        }

        wrap.appendChild(bubble);

        let sourcesEl = null;
        if (role === "bot") {
            sourcesEl = document.createElement("div");
            sourcesEl.className = "sources";
            sourcesEl.hidden = true;
            sourcesEl.innerHTML = `
                <details class="sources-details">
                    <summary>Sources</summary>
                    <div class="sources-list"></div>
                </details>
            `;
            wrap.appendChild(sourcesEl);
        }

        messagesEl.appendChild(wrap);
        scrollToBottom();

        return { wrap, bubble, sourcesEl };
    }
    function autosize() {
        promptEl.style.height = "auto";
        promptEl.style.height = Math.min(promptEl.scrollHeight, 180) + "px";
    }

    promptEl.addEventListener("input", autosize);

    promptEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            formEl.requestSubmit();
        }
    });

    newChatBtn?.addEventListener("click", async () => {
        if (isStreaming && activeAbortController) activeAbortController.abort();

        currentChatId = null;
        title = "New Conversation";
        sidebarTitle.textContent = title
        topbarTitle.textContent = title
        messagesEl.innerHTML = "";
        addMessage("bot", "New chat started. Ask me anything.");
        promptEl.value = "";
        autosize();
        setSendMode("send");

        await refreshChatList();
    });


    async function streamSSEPost(url, payload, onEvent, signal) {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken,
            },
            body: JSON.stringify(payload),
            signal,
        });

        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(txt || `HTTP ${res.status}`);
        }
        if (!res.body) throw new Error("No response body (streaming not supported?)");

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");

        let buffer = "";

        const pump = async () => {
            while (true) {
                let boundaryIdx = buffer.indexOf("\n\n");
                let boundaryLen = 2;
                if (boundaryIdx === -1) {
                    boundaryIdx = buffer.indexOf("\r\n\r\n");
                    boundaryLen = 4;
                }
                if (boundaryIdx === -1) return;

                const raw = buffer.slice(0, boundaryIdx);
                buffer = buffer.slice(boundaryIdx + boundaryLen);

                if (!raw.trim() || raw.trim().startsWith(":")) continue;

                let eventType = "message";
                let dataStr = "";

                for (const line of raw.split(/\r?\n/)) {
                    if (line.startsWith("event:")) eventType = line.slice(6).trim();
                    if (line.startsWith("data:")) dataStr += line.slice(5).trim();
                }

                onEvent(eventType, dataStr);

                await new Promise(requestAnimationFrame);
            }
        };

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            await pump();
        }

        await pump();
    }

    formEl.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (isStreaming && activeAbortController) {
            activeAbortController.abort();
            return;
        }

        const prompt = promptEl.value.trim();
        if (!prompt) return;

        promptEl.value = "";
        autosize();

        addMessage("user", prompt);

        const botMsg = addMessage("bot", "");
        const botBubble = botMsg.bubble;
        const botSources = botMsg.sourcesEl;

        let botMarkdown = "";

        activeAbortController = new AbortController();
        isStreaming = true;
        setSendMode("stop");

        try {
            const history = Array.from(messagesEl.querySelectorAll(".msg")).map((node) => {
                const role = node.classList.contains("user") ? "user" : "assistant";
                const content = node.querySelector(".bubble")?.textContent ?? "";
                return { role, content };
            });

            botMarkdown = "";
            botBubble.innerHTML = "";

            await streamSSEPost(
                "/api/chat/stream/",
                { chat_id: currentChatId, message: prompt, history },
                (event, data) => {
                    if (!data) return;

                    if (event === "token") {
                        const obj = JSON.parse(data);
                        botMarkdown += (obj.token || "");
                        botBubble.innerHTML = renderMarkdown(botMarkdown);
                        scrollToBottom();
                    } else if (event === "sources") {
                        const obj = JSON.parse(data);
                        const sources = obj.sources || [];

                        if (botSources) {
                            const list = botSources.querySelector(".sources-list");
                            list.innerHTML = "";

                            if (!sources.length) {
                                botSources.hidden = true;   
                                return;
                            }

                            for (const s of sources) {
                                const row = document.createElement("div");
                                row.className = "source-row";

                                const page = (s.page !== null && s.page !== undefined) ? ` p.${s.page + 1}` : "";
                                row.textContent = `${s.source}${page}`;

                                list.appendChild(row);
                            }

                            botSources.hidden = false; 
                            if (sources.length > 0) botSources.open = false;
                        }
                    } else if (event === "start") {
                        const obj = JSON.parse(data);
                        if (!currentChatId && obj.chat_id) currentChatId = obj.chat_id;
                    } else if (event === "done") {
                        const obj = JSON.parse(data);
                        if (!currentChatId && obj.chat_id) currentChatId = obj.chat_id;
                        refreshChatList();
                    } else if (event === "error") {
                        const obj = JSON.parse(data);
                        botBubble.textContent = "Error: " + (obj.error || "unknown");
                    }
                },
                activeAbortController.signal
            );
        } catch (err) {
            if (err?.name === "AbortError") {
                botMarkdown += "\n\n*(Stopped)*";
                botBubble.innerHTML = renderMarkdown(botMarkdown);
            } else {
                botBubble.textContent = "Error: " + (err?.message || "unknown");
            }
        } finally {
            isStreaming = false;
            activeAbortController = null;
            setSendMode("send");
            promptEl.focus();
        }

    });

    const uploadBtn = document.getElementById("uploadBtn");
    const uploadModal = document.getElementById("uploadModal");
    const uploadCloseBtn = document.getElementById("uploadCloseBtn");
    const uploadInput = document.getElementById("uploadInput");
    const uploadGoBtn = document.getElementById("uploadGoBtn");
    const uploadStatus = document.getElementById("uploadStatus");

    uploadBtn?.addEventListener("click", () => {
        uploadModal.hidden = false;
        uploadStatus.textContent = "";
    });

    uploadCloseBtn?.addEventListener("click", () => {
        uploadModal.hidden = true;
    });

    uploadModal?.addEventListener("click", (e) => {
        if (e.target === uploadModal) uploadModal.hidden = true;
    });

    uploadGoBtn?.addEventListener("click", async () => {
        const files = uploadInput.files;
        if (!files || files.length === 0) return;

        uploadStatus.textContent = "Uploading + indexing...";
        const fd = new FormData();
        for (const f of files) fd.append("files", f);

        const res = await fetch("/api/rag/upload/", {
            method: "POST",
            credentials: "same-origin",
            headers: { "X-CSRFToken": csrftoken },
            body: fd,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg =
                (data && (data.detail || data.error)) ? (data.detail || data.error) : `HTTP ${res.status}`;
            const hint = data && data.hint ? `\n${data.hint}` : "";
            uploadStatus.textContent = "Failed: " + msg + hint;
            return;
        }

        uploadStatus.textContent = "Indexed ✓ " + data.files.map(x => `${x.name} (${x.chunks} chunks)`).join(", ");
    });

    const knowledgeBtn = document.getElementById("knowledgeBtn");
    const knowledgeModal = document.getElementById("knowledgeModal");
    const knowledgeCloseBtn = document.getElementById("knowledgeCloseBtn");
    const knowledgeList = document.getElementById("knowledgeList");
    const knowledgeStatus = document.getElementById("knowledgeStatus");
    const clearKnowledgeBtn = document.getElementById("clearKnowledgeBtn");

    function escHtml(s) {
        return (s ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[c]));
    }

    async function refreshKnowledgeList() {
        knowledgeStatus.textContent = "Loading...";
        knowledgeList.innerHTML = "";

        const res = await fetch("/api/rag/files/", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            knowledgeStatus.textContent = "Failed to load";
            return;
        }

        const files = data.files || [];
        knowledgeStatus.textContent = files.length ? `${files.length} file(s)` : "No files uploaded yet.";

        for (const f of files) {
            const row = document.createElement("div");
            row.className = "source-row";

            row.innerHTML = `
                          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
                            <div style="min-width:0;">
                              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                ${escHtml(f.name)}
                              </div>
                              <div class="muted" style="font-size:12px;">
                                ${escHtml(f.size_human)} • ${new Date(f.created_at).toLocaleString()}
                              </div>
                            </div>
                            <button class="btn" type="button" data-del="${f.id}" style="padding:8px 10px;">Delete</button>
                          </div>
                        `;
            knowledgeList.appendChild(row);
        }

        knowledgeList.querySelectorAll("button[data-del]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-del");
                btn.disabled = true;
                knowledgeStatus.textContent = "Deleting & reindexing...";
                const fd = new FormData();
                fd.append("id", id);

                const delRes = await fetch("/api/rag/files/delete/", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "X-CSRFToken": csrftoken },
                    body: fd,
                });
                const delData = await delRes.json().catch(() => ({}));

                if (!delRes.ok) {
                    knowledgeStatus.textContent = "Delete failed: " + (delData.error || delRes.status);
                } else {
                    const r = delData.reindexed;
                    knowledgeStatus.textContent = `Deleted ✓ Reindexed ${r.files} file(s), ${r.chunks} chunks`;
                    await refreshKnowledgeList();
                }
                btn.disabled = false;
            });
        });
    }

    knowledgeBtn?.addEventListener("click", async () => {
        knowledgeModal.hidden = false;
        await refreshKnowledgeList();
    });

    knowledgeCloseBtn?.addEventListener("click", () => {
        knowledgeModal.hidden = true;
    });

    knowledgeModal?.addEventListener("click", (e) => {
        if (e.target === knowledgeModal) knowledgeModal.hidden = true;
    });

    clearKnowledgeBtn?.addEventListener("click", async () => {
        if (!confirm("Clear ALL uploaded documents and wipe your knowledge base?")) return;

        clearKnowledgeBtn.disabled = true;
        knowledgeStatus.textContent = "Clearing...";

        const res = await fetch("/api/rag/clear/", {
            method: "POST",
            credentials: "same-origin",
            headers: { "X-CSRFToken": csrftoken },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            knowledgeStatus.textContent = "Clear failed: " + (data.error || res.status);
        } else {
            knowledgeStatus.textContent = "Cleared ✓";
            await refreshKnowledgeList();
        }
        clearKnowledgeBtn.disabled = false;
    });

    async function refreshChatList() {
        if (!chatListEl) return;

        const res = await fetch("/api/chats/", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        const chats = data.chats || [];

        chatListEl.innerHTML = "";

        for (const c of chats) {
            const item = document.createElement("div");
            item.className = "chat-item" + (String(c.id) === String(currentChatId) ? " active" : "");

            item.innerHTML = `
                          <div class="chat-item-row">
                            <div style="min-width:0; flex: 1;">
                              <div class="chat-title">${escapeHtml(c.title || "New chat")}</div>
                              <div class="chat-meta">${new Date(c.updated_at).toLocaleString()}</div>
                            </div>

                            <div class="chat-actions">
                              <button class="chat-more" type="button" aria-label="Chat menu">⋯</button>
                            </div>
                          </div>
                        `;

            item.addEventListener("click", async (e) => {
                if (e.target.closest(".chat-more") || e.target.closest(".chat-menu")) return;
                await loadChat(c.id);
                await refreshChatList();
            });

            const moreBtn = item.querySelector(".chat-more");
            moreBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllChatMenus();

                const menu = document.createElement("div");
                menu.className = "chat-menu";
                menu.innerHTML = `
                                <button type="button" data-action="rename">Rename</button>
                                <button type="button" class="danger" data-action="delete">Delete</button>
                              `;
                item.querySelector(".chat-actions").appendChild(menu);

                menu.addEventListener("click", async (ev) => {
                    ev.stopPropagation();
                    const btn = ev.target.closest("button[data-action]");
                    if (!btn) return;

                    const action = btn.getAttribute("data-action");
                    menu.remove();

                    if (action === "rename") {
                        const newTitle = prompt("Rename chat:", c.title || "New chat");
                        if (!newTitle || !newTitle.trim()) return;

                        const res = await fetch(`/api/chats/${c.id}/rename/`, {
                            method: "POST",
                            credentials: "same-origin",
                            headers: {
                                "Content-Type": "application/json",
                                "X-CSRFToken": csrftoken,
                            },
                            body: JSON.stringify({ title: newTitle.trim() }),
                        });

                        if (!res.ok) {
                            const t = await res.text().catch(() => "");
                            alert("Rename failed: " + (t || res.status));
                            return;
                        }

                        await refreshChatList();
                    }

                    if (action === "delete") {
                        if (!confirm("Delete this chat? This cannot be undone.")) return;

                        const res = await fetch(`/api/chats/${c.id}/delete/`, {
                            method: "POST",
                            credentials: "same-origin",
                            headers: { "X-CSRFToken": csrftoken },
                        });

                        if (!res.ok) {
                            const t = await res.text().catch(() => "");
                            alert("Delete failed: " + (t || res.status));
                            return;
                        }

                        if (String(currentChatId) === String(c.id)) {
                            currentChatId = null;
                            messagesEl.innerHTML = "";
                            addMessage("bot", "New chat started. Ask me anything.");
                        }

                        await refreshChatList();
                    }
                });
            });

            chatListEl.appendChild(item);
        }
    }

    async function loadChat(chatId) {
        const res = await fetch(`/api/chats/${chatId}/messages/`, { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;

        currentChatId = data.chat.id;

        title = data.chat.title || "New Conversation"; 
        sidebarTitle.textContent = title
        topbarTitle.textContent = title
        messagesEl.innerHTML = "";
        for (const m of data.messages || []) {
            const role = (m.role === "assistant") ? "bot" : "user";
            addMessage(role, m.content || "");
        }
        scrollToBottom();
    }

    function escapeHtml(s) {
        return (s ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[c]));
    }



    refreshChatList();
});