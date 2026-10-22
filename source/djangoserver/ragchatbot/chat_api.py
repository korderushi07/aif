import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods, require_POST
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404

from .models import Chat, Message

def _title_from(text: str) -> str:
    t = (text or "").strip().replace("\n", " ")
    return (t[:60] + "...") if len(t) > 60 else (t or "New chat")

@login_required
@require_http_methods(["GET", "POST"])
def chats_api(request):
    if request.method == "GET":
        qs = Chat.objects.filter(user=request.user).order_by("-updated_at")
        return JsonResponse({
            "chats": [{"id": c.id, "title": c.title, "updated_at": c.updated_at.isoformat()} for c in qs]
        })

    payload = json.loads(request.body.decode("utf-8") or "{}")
    title = (payload.get("title") or "").strip() or "New chat"
    c = Chat.objects.create(user=request.user, title=title)
    return JsonResponse({"id": c.id, "title": c.title})

@login_required
@require_http_methods(["GET"])
def chat_messages_api(request, chat_id: int):
    chat = get_object_or_404(Chat, id=chat_id, user=request.user)
    msgs = chat.messages.order_by("created_at")
    return JsonResponse({
        "chat": {"id": chat.id, "title": chat.title},
        "messages": [
            {"id": m.id, "role": m.role, "content": m.content, "is_partial": m.is_partial, "created_at": m.created_at.isoformat()}
            for m in msgs
        ],
    })

@login_required
@require_POST
def rename_chat_api(request, chat_id: int):
    chat = get_object_or_404(Chat, id=chat_id, user=request.user)
    payload = json.loads(request.body.decode("utf-8") or "{}")
    title = (payload.get("title") or "").strip()
    if not title:
        return JsonResponse({"error": "Empty title"}, status=400)
    chat.title = title[:120]
    chat.save(update_fields=["title", "updated_at"])
    return JsonResponse({"ok": True})

@login_required
@require_POST
def delete_chat_api(request, chat_id: int):
    chat = get_object_or_404(Chat, id=chat_id, user=request.user)
    chat.delete()
    return JsonResponse({"ok": True})
