document.addEventListener("DOMContentLoaded", () => {
    // -----------------------------------------------------------------------
    // Markdown and Security Sanitization
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // DOM Elements
    // -----------------------------------------------------------------------
    const messagesEl = document.getElementById("messages");
    const formEl = document.getElementById("chatForm");
    const promptEl = document.getElementById("prompt");
    const sendBtn = document.getElementById("sendBtn");
    const newChatBtn = document.getElementById("newChatBtn");
    const sidebarTitle = document.getElementById("activeChatTitle");
    const topbarTitle = document.getElementById("topbarTitle");
    const chatListEl = document.getElementById("chatList");
    const welcomeHero = document.getElementById("welcomeHero");

    // Responsive Mobile Sidebar Toggle
    const sidebar = document.getElementById("sidebar");
    const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
    const sidebarOverlay = document.getElementById("sidebarOverlay");

    function toggleSidebar(open) {
        if (!sidebar) return;
        const shouldOpen = open !== undefined ? open : !sidebar.classList.contains("open");
        sidebar.classList.toggle("open", shouldOpen);
        sidebarOverlay?.classList.toggle("active", shouldOpen);
    }

    sidebarToggleBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSidebar();
    });

    sidebarOverlay?.addEventListener("click", () => {
        toggleSidebar(false);
    });

    // -----------------------------------------------------------------------
    // Settings Modal
    // -----------------------------------------------------------------------
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

    let currentChatId = null;

    clearKeyBtn?.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to clear your stored API key?")) return;
        settingsStatus.textContent = "Clearing...";
        const res = await fetch("/api/settings/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken,
            },
            body: JSON.stringify({ clear_api_key: true }),
        });
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
        const data = await res.json().catch(() => ({}));

        providerSelect.value = data.provider || "google";
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

        settingsStatus.textContent = "Settings saved ✓";
        setTimeout(() => {
            if (settingsStatus.textContent.includes("saved")) {
                settingsModal.hidden = true;
            }
        }, 900);
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

    // -----------------------------------------------------------------------
    // Chat Message Flow & Streaming
    // -----------------------------------------------------------------------
    let activeAbortController = null;
    let isStreaming = false;

    function setSendMode(mode) {
        if (mode === "stop") {
            sendBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="2"></rect>
                </svg>
                <span>Stop</span>
            `;
            sendBtn.dataset.mode = "stop";
        } else {
            sendBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                <span>Send</span>
            `;
            sendBtn.dataset.mode = "send";
        }
    }

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addMessage(role, text) {
        // Hide welcome hero if active
        const hero = document.getElementById("welcomeHero");
        if (hero) hero.remove();

        const wrap = document.createElement("div");
        wrap.className = `msg ${role}`;

        if (role === "bot") {
            const header = document.createElement("div");
            header.className = "msg-header";
            header.innerHTML = `
                <div class="avatar-badge bot">
                    <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                </div>
                <span>AIF Assistant</span>
            `;
            wrap.appendChild(header);
        }

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
            sourcesEl = document.createElement("details");
            sourcesEl.className = "sources";
            sourcesEl.hidden = true;
            sourcesEl.innerHTML = `
                <summary>Referenced Sources & Citations</summary>
                <div class="sources-list"></div>
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

    // Handle suggestion prompt card clicks
    document.addEventListener("click", (e) => {
        const card = e.target.closest(".prompt-card");
        if (card && card.dataset.prompt) {
            promptEl.value = card.dataset.prompt;
            autosize();
            formEl.requestSubmit();
        }
    });

    function showWelcomeHero() {
        messagesEl.innerHTML = `
            <div class="welcome-hero" id="welcomeHero">
                <div class="welcome-icon-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                </div>
                <h2 class="welcome-title">Welcome to AIF Assistant</h2>
                <p class="welcome-subtitle">Ask questions, search through your uploaded PDFs, analyze scanned images, and chat with RAG intelligence.</p>

                <div class="welcome-prompts">
                    <div class="prompt-card" data-prompt="Summarize the key points of the uploaded documents.">
                        <div class="prompt-card-icon">📄</div>
                        <div>Summarize the key points of uploaded documents</div>
                    </div>
                    <div class="prompt-card" data-prompt="Extract the main findings, dates, and conclusions from the files.">
                        <div class="prompt-card-icon">🔍</div>
                        <div>Extract main findings, dates & conclusions</div>
                    </div>
                    <div class="prompt-card" data-prompt="What questions can I ask based on the indexed knowledge base?">
                        <div class="prompt-card-icon">💡</div>
                        <div>Suggest questions based on indexed docs</div>
                    </div>
                </div>
            </div>
        `;
    }

    newChatBtn?.addEventListener("click", async () => {
        if (isStreaming && activeAbortController) activeAbortController.abort();

        currentChatId = null;
        const title = "New conversation";
        if (sidebarTitle) sidebarTitle.textContent = title;
        if (topbarTitle) topbarTitle.textContent = title;
        
        showWelcomeHero();
        promptEl.value = "";
        autosize();
        setSendMode("send");

        await refreshChatList();
        if (window.innerWidth <= 900) toggleSidebar(false);
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
            botBubble.innerHTML = `<span style="color:var(--text-muted); display:inline-flex; align-items:center; gap:6px;">Thinking...</span>`;

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
                                const page = (s.page !== null && s.page !== undefined) ? ` • Page ${s.page + 1}` : "";
                                const ocrTag = s.ocr ? `<span class="source-badge">OCR</span>` : "";
                                row.innerHTML = `
                                    <span style="font-size:14px;">📄</span>
                                    <div style="flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        <strong>${escapeHtml(s.source)}</strong>
                                        <span class="muted">${page}</span>
                                    </div>
                                    ${ocrTag}
                                `;
                                list.appendChild(row);
                            }

                            botSources.hidden = false;
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
                botMarkdown += "\n\n*(Generation stopped)*";
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

    // -----------------------------------------------------------------------
    // Upload Modal & Drag-and-Drop
    // -----------------------------------------------------------------------
    const uploadBtn = document.getElementById("uploadBtn");
    const uploadModal = document.getElementById("uploadModal");
    const uploadCloseBtn = document.getElementById("uploadCloseBtn");
    const uploadInput = document.getElementById("uploadInput");
    const uploadDropzone = document.getElementById("uploadDropzone");
    const uploadGoBtn = document.getElementById("uploadGoBtn");
    const uploadStatus = document.getElementById("uploadStatus");
    const selectedFilesSummary = document.getElementById("selectedFilesSummary");

    function updateUploadSummary(files) {
        if (!selectedFilesSummary) return;
        if (!files || files.length === 0) {
            selectedFilesSummary.textContent = "";
            return;
        }
        const names = Array.from(files).map(f => `${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)`).join(", ");
        selectedFilesSummary.innerHTML = `<strong>Selected (${files.length}):</strong> ${escapeHtml(names)}`;
    }

    uploadInput?.addEventListener("change", () => {
        updateUploadSummary(uploadInput.files);
    });

    // Drag and drop handling
    if (uploadDropzone) {
        ["dragenter", "dragover"].forEach(name => {
            uploadDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadDropzone.classList.add("dragover");
            });
        });

        ["dragleave", "drop"].forEach(name => {
            uploadDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadDropzone.classList.remove("dragover");
            });
        });

        uploadDropzone.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files.length) {
                uploadInput.files = dt.files;
                updateUploadSummary(dt.files);
            }
        });
    }

    uploadBtn?.addEventListener("click", () => {
        uploadModal.hidden = false;
        uploadStatus.textContent = "";
        updateUploadSummary(uploadInput?.files);
    });

    uploadCloseBtn?.addEventListener("click", () => {
        uploadModal.hidden = true;
    });

    uploadModal?.addEventListener("click", (e) => {
        if (e.target === uploadModal) uploadModal.hidden = true;
    });

    uploadGoBtn?.addEventListener("click", async () => {
        const files = uploadInput.files;
        if (!files || files.length === 0) {
            uploadStatus.textContent = "Please select at least one file.";
            return;
        }

        uploadGoBtn.disabled = true;
        uploadStatus.innerHTML = `<span style="color:var(--accent);">Uploading & indexing (with OCR)...</span>`;

        const fd = new FormData();
        for (const f of files) fd.append("files", f);

        try {
            const res = await fetch("/api/rag/upload/", {
                method: "POST",
                credentials: "same-origin",
                headers: { "X-CSRFToken": csrftoken },
                body: fd,
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = (data && (data.detail || data.error)) ? (data.detail || data.error) : `HTTP ${res.status}`;
                const hint = data && data.hint ? ` (${data.hint})` : "";
                uploadStatus.innerHTML = `<span style="color:var(--rose-accent);">Failed: ${escapeHtml(msg)}${escapeHtml(hint)}</span>`;
                return;
            }

            uploadStatus.innerHTML = `<span style="color:var(--emerald-accent);">Indexed ✓ ${data.files.map(x => `${escapeHtml(x.name)} (${x.chunks} chunks)`).join(", ")}</span>`;
            uploadInput.value = "";
            if (selectedFilesSummary) selectedFilesSummary.textContent = "";
        } catch (err) {
            uploadStatus.innerHTML = `<span style="color:var(--rose-accent);">Network error: ${escapeHtml(err.message)}</span>`;
        } finally {
            uploadGoBtn.disabled = false;
        }
    });

    // -----------------------------------------------------------------------
    // Knowledge Base Modal
    // -----------------------------------------------------------------------
    const knowledgeBtn = document.getElementById("knowledgeBtn");
    const knowledgeModal = document.getElementById("knowledgeModal");
    const knowledgeCloseBtn = document.getElementById("knowledgeCloseBtn");
    const knowledgeList = document.getElementById("knowledgeList");
    const knowledgeStatus = document.getElementById("knowledgeStatus");
    const clearKnowledgeBtn = document.getElementById("clearKnowledgeBtn");

    async function refreshKnowledgeList() {
        knowledgeStatus.textContent = "Loading knowledge base...";
        knowledgeList.innerHTML = "";

        const res = await fetch("/api/rag/files/", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            knowledgeStatus.textContent = "Failed to load files";
            return;
        }

        const files = data.files || [];
        knowledgeStatus.textContent = files.length ? `${files.length} document(s) indexed` : "No documents indexed yet.";

        if (!files.length) {
            knowledgeList.innerHTML = `
                <div style="text-align:center; padding:28px 16px; color:var(--text-muted);">
                    <div style="font-size:24px; margin-bottom:8px;">📂</div>
                    <div>Your knowledge base is empty.</div>
                    <div style="font-size:12px; margin-top:4px;">Upload PDFs, text, or markdown files to start asking questions.</div>
                </div>
            `;
            return;
        }

        for (const f of files) {
            const row = document.createElement("div");
            row.className = "source-row";
            row.style.justifyContent = "space-between";
            row.style.padding = "10px 14px";

            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                    <span style="font-size:18px;">📄</span>
                    <div style="min-width:0; flex:1;">
                        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-primary);">
                            ${escapeHtml(f.name)}
                        </div>
                        <div class="muted" style="font-size:11.5px; margin-top:2px;">
                            ${escapeHtml(f.size_human)} • ${new Date(f.created_at).toLocaleDateString()}
                        </div>
                    </div>
                </div>
                <button class="btn danger" type="button" data-del="${f.id}" style="padding:6px 12px; font-size:12px;">Delete</button>
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
        if (!confirm("Are you sure? This will delete ALL uploaded documents and wipe your vector index.")) return;

        clearKnowledgeBtn.disabled = true;
        knowledgeStatus.textContent = "Clearing vector database...";

        const res = await fetch("/api/rag/clear/", {
            method: "POST",
            credentials: "same-origin",
            headers: { "X-CSRFToken": csrftoken },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            knowledgeStatus.textContent = "Clear failed: " + (data.error || res.status);
        } else {
            knowledgeStatus.textContent = "Knowledge base wiped clean ✓";
            await refreshKnowledgeList();
        }
        clearKnowledgeBtn.disabled = false;
    });

    // -----------------------------------------------------------------------
    // Chat Conversations History
    // -----------------------------------------------------------------------
    async function refreshChatList() {
        if (!chatListEl) return;

        const res = await fetch("/api/chats/", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        const chats = data.chats || [];

        chatListEl.innerHTML = "";

        if (chats.length === 0) {
            chatListEl.innerHTML = `
                <div style="padding: 12px; color: var(--text-muted); font-size: 12.5px; text-align: center;">
                    No past conversations yet
                </div>
            `;
            return;
        }

        for (const c of chats) {
            const item = document.createElement("div");
            item.className = "chat-item" + (String(c.id) === String(currentChatId) ? " active" : "");

            item.innerHTML = `
                <div class="chat-item-row">
                    <div style="min-width:0; flex: 1;">
                        <div class="chat-title">${escapeHtml(c.title || "New chat")}</div>
                        <div class="chat-meta">${new Date(c.updated_at).toLocaleDateString()}</div>
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
                if (window.innerWidth <= 900) toggleSidebar(false);
            });

            const moreBtn = item.querySelector(".chat-more");
            moreBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllChatMenus();

                const menu = document.createElement("div");
                menu.className = "chat-menu";
                menu.innerHTML = `
                    <button type="button" data-action="rename">
                        <span>✏️</span>
                        <span>Rename</span>
                    </button>
                    <button type="button" class="danger" data-action="delete">
                        <span>🗑️</span>
                        <span>Delete</span>
                    </button>
                `;
                item.querySelector(".chat-actions").appendChild(menu);

                menu.addEventListener("click", async (ev) => {
                    ev.stopPropagation();
                    const btn = ev.target.closest("button[data-action]");
                    if (!btn) return;

                    const action = btn.getAttribute("data-action");
                    menu.remove();

                    if (action === "rename") {
                        const newTitle = prompt("Rename conversation:", c.title || "New chat");
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

                        if (String(currentChatId) === String(c.id)) {
                            if (sidebarTitle) sidebarTitle.textContent = newTitle.trim();
                            if (topbarTitle) topbarTitle.textContent = newTitle.trim();
                        }

                        await refreshChatList();
                    }

                    if (action === "delete") {
                        if (!confirm("Delete this conversation?")) return;

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
                            showWelcomeHero();
                            if (sidebarTitle) sidebarTitle.textContent = "New conversation";
                            if (topbarTitle) topbarTitle.textContent = "New conversation";
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
        const title = data.chat.title || "New conversation";
        if (sidebarTitle) sidebarTitle.textContent = title;
        if (topbarTitle) topbarTitle.textContent = title;

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