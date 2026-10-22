import json
from django.contrib.auth.decorators import login_required
from django.http import StreamingHttpResponse
from django.views.decorators.http import require_POST

from .models import LLMSettings, Chat, Message
from .crypto import decrypt_str
from .multi_retriever import retrieve_merged

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI

SYSTEM_PROMPT = "You are a helpful assistant."

def sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"

@login_required
@require_POST
def chat_stream_api(request):
    def generate():
        chat = None
        assistant_text = ""

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
            chat_id = payload.get("chat_id")
            prompt = (payload.get("message") or "").strip()
            history = payload.get("history") or []

            if not prompt:
                yield sse("error", json.dumps({"error": "Empty message"}))
                return

            if chat_id:
                chat = Chat.objects.get(id=chat_id, user=request.user)
            else:
                chat = Chat.objects.create(user=request.user, title="New chat")

            Message.objects.create(chat=chat, role="user", content=prompt)

            if chat.title == "New chat":
                chat.title = (prompt[:60] + "...") if len(prompt) > 60 else prompt
                chat.save(update_fields=["title", "updated_at"])
            else:
                chat.save(update_fields=["updated_at"])

            docs = retrieve_merged(request.user, prompt, k_per_backend=3, k_total=4, max_distance=0.55)

            def _src(d):

                return {"source": d.metadata.get("source", "unknown"),
                        "page": d.metadata.get("page", None)}

            sources, seen = [], set()
            for d in docs:
                s = _src(d)
                key = (s["source"], s["page"])
                if key in seen:
                    continue
                seen.add(key)
                sources.append(s)

            yield sse("sources", json.dumps({"sources": sources}))

            context = "\n\n".join(
                [f"[{i+1}] {d.metadata.get('source','')} p{d.metadata.get('page','?')}\n{d.page_content}"
                 for i, d in enumerate(docs)]
            )

            messages = [SystemMessage(content=SYSTEM_PROMPT)]

            if docs:
                context = "\n\n".join(
                    [f"[{i+1}] {d.metadata.get('source','')} p{d.metadata.get('page','?')}\n{d.page_content}"
                     for i, d in enumerate(docs)]
                )
                messages.append(SystemMessage(content=f"Use the following retrieved context when helpful:\n\n{context}"))

            for item in history:
                role = item.get("role")
                content = item.get("content", "")
                if role == "user":
                    messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    messages.append(AIMessage(content=content))

            messages.append(HumanMessage(content=prompt))

            cfg, _ = LLMSettings.objects.get_or_create(
                user=request.user,
                defaults={
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "temperature": 0.2,
                    "ollama_base_url": "http://localhost:11434",
                }
            )

            provider = cfg.provider
            model = cfg.model
            temperature = cfg.temperature

            if provider == "openai":
                api_key = decrypt_str(cfg.openai_api_key_enc)
                if not api_key:
                    raise ValueError("OpenAI API key is missing. Add it in Settings.")
                llm = ChatOpenAI(model=model, temperature=temperature, streaming=True, api_key=api_key)

            elif provider == "google":
                api_key = decrypt_str(cfg.google_api_key_enc)
                if not api_key:
                    raise ValueError("Google API key is missing. Add it in Settings.")
                if not model or model.startswith("gpt") or model == "gpt-4o-mini":
                    model = "gemini-2.5-flash"
                from langchain_google_genai import ChatGoogleGenerativeAI
                llm = ChatGoogleGenerativeAI(model=model, temperature=temperature, google_api_key=api_key, streaming=True)

            elif provider == "ollama":
                from langchain_ollama import ChatOllama
                llm = ChatOllama(
                    model=model,
                    temperature=temperature,
                    base_url=(cfg.ollama_base_url or "http://localhost:11434"),
                    streaming=True
                )
            else:
                raise ValueError(f"Unknown provider: {provider}")

            yield sse("start", json.dumps({"ok": True, "chat_id": chat.id}))

            for chunk in llm.stream(messages):
                token = chunk.content or ""
                assistant_text += token
                yield sse("token", json.dumps({"token": token}))

            Message.objects.create(chat=chat, role="assistant", content=assistant_text, is_partial=False)
            chat.save(update_fields=["updated_at"])
            yield sse("done", json.dumps({"ok": True, "chat_id": chat.id}))

        except GeneratorExit:
            if chat and assistant_text.strip():
                Message.objects.create(chat=chat, role="assistant", content=assistant_text, is_partial=True)
                chat.save(update_fields=["updated_at"])
            raise

        except Exception as e:
            yield sse("error", json.dumps({"error": str(e)}))

    resp = StreamingHttpResponse(generate(), content_type="text/event-stream; charset=utf-8")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"
    return resp
