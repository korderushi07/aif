# Changelog
All notable changes to this project will be documented in this file.

## v0.9.1
### Fixed
- Active chat title is now properly displayed as the current chat title in the UI
- The chats list on the left sidebar now updates correctly upon refreshing the page
- Footer is now sticky at the bottom and chat auto-scrolls to the bottom

## v0.9.0 - Major Update
### Added
- Multi-user authentication with per-user settings
- Persistent chat threads (ChatGPT-style)
- Rename and delete chat threads
- Streaming responses with stop/abort support
- Retrieval-Augmented Generation (RAG)
- Document upload (PDF, TXT, MD)
- Per-user knowledge bases
- Knowledge management (list, delete, clear)
- Source attribution in chat responses
- Multi-provider LLM support:
  - OpenAI
  - Google Gemini
  - Ollama (local)
- Multi-backend embedding architecture:
  - Separate vector collections per embedding backend
  - No forced re-embedding when switching LLM providers
- Secure API key storage (encrypted at rest)
- CSRF-protected API endpoints
- Server-Sent Events (SSE) streaming backend

### Changed
- Chat provider and embedding backend are now decoupled
- Knowledge base persistence is independent of selected chat model
- Improved error handling with user-friendly messages
- Refactored backend architecture for extensibility

### Fixed
- Embedding dimension conflicts when switching providers
- Streaming interruptions on client disconnect
- Inconsistent chat history when refreshing the page
- RAG failures when providers were misconfigured

## v0.1 - Initial Commit
* Created the project with minimal structure and basic functionality.