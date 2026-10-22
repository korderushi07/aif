from django.urls import path
from django.shortcuts import redirect
from django.conf import settings
from django.conf.urls.static import static

from .views import chat_page
from .stream_api import chat_stream_api
from .settings_api import llm_settings_api
from .rag_api import upload_and_ingest
from .knowledge_api import list_knowledge_files, delete_knowledge_file, clear_knowledge
from .chat_api import chats_api, chat_messages_api, rename_chat_api, delete_chat_api

urlpatterns = [
    path("", chat_page, name="chat"),
    path("login/", lambda r: redirect("/", permanent=False), name="login"),
    path("logout/", lambda r: redirect("/", permanent=False), name="logout"),
    path("signup/", lambda r: redirect("/", permanent=False), name="signup"),

    path("api/settings/", llm_settings_api, name="llm_settings_api"),
    path("api/chat/stream/", chat_stream_api, name="chat_stream_api"),
    path("api/rag/upload/", upload_and_ingest, name="upload_and_ingest"),
    path("api/rag/files/", list_knowledge_files, name="list_knowledge_files"),
    path("api/rag/files/delete/", delete_knowledge_file, name="delete_knowledge_file"),
    path("api/rag/clear/", clear_knowledge, name="clear_knowledge"),
    path("api/chats/", chats_api),
    path("api/chats/<int:chat_id>/messages/", chat_messages_api),
    path("api/chats/<int:chat_id>/rename/", rename_chat_api),
    path("api/chats/<int:chat_id>/delete/", delete_chat_api),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
