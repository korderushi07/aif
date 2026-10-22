# 🧠 RAG Chatbot (Django + LangChain)

A **multi-user, streaming AI chatbot** built with **Django, LangChain, and modern LLM providers**, featuring:

- ChatGPT-style UI with streaming responses
- Per-user chat history & settings
- Retrieval-Augmented Generation (RAG)
- Multi-provider support (OpenAI, Google Gemini, Ollama)
- Per-user knowledge bases with source attribution
- No forced re-embedding when switching LLM providers
- Docker ready

<img src="imgs/Sample1.png" alt="sample1" width="400"/> <img src="imgs/Sample2.png" alt="sample2" width="400"/>
<img src="imgs/Sample3.png" alt="sample3" width="400"/> <img src="imgs/Sample4.png" alt="sample4" width="400"/>
 
---

## ✨ Features

### 💬 Chat
- Streaming responses (SSE)
- Stop / Abort generation
- Persistent chat history
- Rename & delete chat threads
- Per-chat context

### 🔌 LLM Providers
- OpenAI (GPT-4o, GPT-4o-mini, etc.)
- Google Gemini
- Ollama (local, offline)
- Switch providers without breaking existing chats or knowledge

### 📚 Retrieval-Augmented Generation (RAG)
- Upload documents (PDF, TXT, MD)
- Per-user knowledge bases
- Source citations in responses
- Knowledge persists across provider switches
- Multiple embedding backends supported internally

### 🧩 Knowledge Management
- View uploaded documents
- Delete individual files
- Clear knowledge base
- Automatic re-indexing per backend

### 🔐 Authentication & Settings
- Django auth (multi-user)
- Per-user API keys (encrypted)
- Provider-specific configuration
- CSRF-protected API endpoints

---

## 🏗️ Architecture Overview

**Frontend**
- Vanilla JS (no framework)
- ChatGPT-style UI
- Server-Sent Events (SSE) for streaming

**Backend**
- Django (session-based auth)
- LangChain for LLM + RAG
- ChromaDB for vector storage
- Per-user, per-backend vector collections

**Key Design Choices**
- Chat provider and embedding backend are decoupled
- Knowledge is not re-embedded when switching LLM providers
- Multiple vector collections prevent embedding dimension conflicts

---

## 🧪 Supported Providers

| Provider | Chat | Embeddings | Notes |
|--------|------|------------|------|
| OpenAI | ✅ | ✅ | Uses `text-embedding-3-small` |
| Google | ✅ | ✅ | Uses `text-embedding-004` |
| Ollama | ✅ | ✅ | Uses `nomic-embed-text` |

> Embedding models are **fixed in the backend** for simplicity and cost safety.

---

## Run with Docker (fastest)

```bash
git clone https://github.com/sbkocoglu/ai-doc-search
cd ai-doc-search
docker compose up --build
```

Open http://127.0.0.1:8000/
(Optional) Create an admin user:
```bash
docker compose exec web python manage.py createsuperuser
```


## Install from source

### 1️⃣ Clone the repository
```bash
git clone https://github.com/sbkocoglu/ai-doc-search
cd ai-doc-search
```

### 2️⃣ Create virtual environment
```bash
python -m venv rag-chatbot-env
source rag-chatbot-env/bin/activate  # Windows: rag-chatbot-env\Scripts\activate
```

### 3️⃣ Install dependencies
```bash
pip install -r requirements.txt
```

### 4️⃣ Run migrations
```bash
python manage.py makemigrations
python manage.py migrate
```

### 5️⃣ Create a superuser
```bash
python manage.py createsuperuser
```

### 6️⃣ Run the server
```bash
python manage.py runserver
```
Open:
👉 http://127.0.0.1:8000/

---

### ⚙️ Ollama Setup (Optional)

If you want to use Ollama:

```bash
ollama serve
ollama pull llama3.1
ollama pull nomic-embed-text
```

Set provider to Ollama in Settings.

---
### 🔒 Security Notes

API keys are encrypted at rest

API keys are never returned in full via the API

CSRF protection enabled

Knowledge bases are isolated per user

This project is intended for local or trusted deployments.
Additional hardening is recommended for public hosting.

### 🛠️ Roadmap (Planned / Optional)

- Chat export (Markdown / JSON)
- Background indexing jobs
- Source preview & PDF page jumping
- User quotas & rate limiting
- ASGI + WebSocket streaming (optional)

### 🤝 Contributing

Pull requests are welcome.
If you’re adding a new provider or feature, please keep:

- Provider logic isolated
- No forced re-embedding behavior
- Backward compatibility for existing users

### 📄 License

GPL-3.0 license 

## FAQ
### Using Ollama with Docker

If you run this project with Docker and Ollama is installed on your **host machine**,  
you must use the following base URL in Settings:
```bash
http://host.docker.internal:11434
```

**Why?**  
When running inside Docker, `localhost` refers to the container itself, not your host OS.

This works out of the box on:
- macOS (Docker Desktop)
- Windows (Docker Desktop)

On Linux, add the following to `docker-compose.yml`:
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```