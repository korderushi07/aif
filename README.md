# AI-Powered Document Intelligence Assistant

A Django application for uploading PDF and TXT documents, extracting and
chunking their text, indexing Sentence Transformer embeddings in FAISS, and
answering questions with Google Gemini using retrieved passages as context.
Answers include source excerpts with the document title and page number.

## MVP architecture

1. Django and Django REST Framework handle the web UI, authentication, upload,
   status, and chat APIs.
2. PyMuPDF extracts text page by page from PDFs; TXT files are treated as page 1.
3. `all-MiniLM-L6-v2` creates normalized embeddings; FAISS `IndexFlatIP`
   retrieves semantically similar chunks.
4. Retrieved passages and the user question are sent to Gemini. The prompt
   requires an evidence-only answer and asks for `[Source N]` references.
5. The API returns source excerpts built from the retrieved chunk records. If
   no passages meet the configured similarity threshold, the app abstains
   without calling the LLM.

The MVP uses one LLM provider (Gemini) and one vector store (FAISS). The
project also contains optional enterprise pages and utilities; these are not
needed for the core upload-and-chat demonstration.

## Requirements

- Python 3.12 recommended (3.11+ supported by the project dependencies)
- A Gemini API key
- Internet access on first run to download the embedding model and load Bootstrap
  from its CDN

The default maximum upload size is 10 MB. Scanned/image-only PDFs are not OCR'd;
upload a text-based PDF or a TXT file.

## Windows setup

Run these commands from the project root in PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set `SECRET_KEY` to a private random value and
`GEMINI_API_KEY` to your provider key. Do not commit `.env`. Generate a local
secret with:

```powershell
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

For local development, keep `DEBUG=True`. `GEMINI_MODEL` defaults to
`gemini-2.5-flash`. The model name may be changed to another Gemini model
enabled for your API key.

## Run and verify

```powershell
python manage.py check
python manage.py migrate
python -m pytest -q
python manage.py runserver
```

Open <http://127.0.0.1:8000/> and register a user. Upload a PDF or TXT document
from the dashboard and wait until its status is **completed**. Open Chat, select
the document if desired, and ask a question answered by its contents. Confirm
the answer shows source excerpts with the expected document and page. Also ask
something not present in the document and confirm the assistant abstains when
retrieval finds no sufficiently similar passage.

The first document/query may take longer while the embedding model is
downloaded. Ingestion runs in a background thread in the web process; keep the
server running until processing completes.

## Configuration

See `.env.example` for supported environment variables. Important settings:

| Name | Purpose | Default |
|---|---|---|
| `SECRET_KEY` | Django signing key | Must be configured for production |
| `DEBUG` | Django debug mode | `True` in the example |
| `GEMINI_API_KEY` | Backend-only Gemini credential | Placeholder |
| `GEMINI_MODEL` | Gemini generation model | `gemini-2.5-flash` |
| `EMBEDDING_MODEL_NAME` | Sentence Transformer model | `all-MiniLM-L6-v2` |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | Chunk length and overlap in characters | `1000` / `150` |
| `TOP_K_RETRIEVAL` | Candidate count for semantic search | `5` |
| `RETRIEVAL_SCORE_THRESHOLD` | Minimum cosine similarity for a source | `0.25` |
| `MAX_UPLOAD_SIZE` | Maximum upload bytes | `10485760` |

Document and chat metadata are stored in `db.sqlite3` by default. Uploaded
files are in `data/uploads`; the FAISS index is in `data/vector_store`. Keep
these together and persistent. The application does not delete or rebuild the
index during startup. If the embedding model changes, rebuild the index using
the project’s document reprocessing flow before relying on old vectors.

## Core APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/upload/` | POST | Validate and queue a PDF/TXT upload |
| `/api/documents/` | GET | List the authenticated user's documents and statuses |
| `/api/chat/` | POST | Retrieve document passages and generate a grounded answer |
| `/api/health/` | GET | Basic application health check |

Chat and upload require an authenticated session. The web interface handles
CSRF protection and status polling.

## Troubleshooting

- **Django REST Framework or PyMuPDF import errors:** activate `.venv` and
  install `requirements.txt` with that interpreter.
- **No embedding model or network errors:** check outbound access to the model
  host; the model is downloaded on first use.
- **Gemini configuration/API errors:** confirm `GEMINI_API_KEY` and
  `GEMINI_MODEL` in `.env`; server logs contain provider failure details but
  never return the key to the browser.
- **No readable PDF text:** image-only/scanned PDFs are not OCR'd in this MVP.
- **No source results:** check that ingestion completed and that the question
  is related to the document. Tune `RETRIEVAL_SCORE_THRESHOLD` only after
  checking retrieval quality.

## Optional existing features

Other project pages include collections, conversation history, search
inspection, comparison, summaries, bookmarks, feedback, evaluation, and PDF or
DOCX export. The core judging flow does not depend on them. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for the request flow and
[DEPLOYMENT.md](./DEPLOYMENT.md) for deployment notes.
