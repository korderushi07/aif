from django.db import models
from django.contrib.auth.models import User

class LLMSettings(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="llm_settings")

    provider = models.CharField(max_length=32, default="openai") 
    model = models.CharField(max_length=128, blank=True, default="gpt-4o-mini")
    temperature = models.FloatField(default=0.2)

    openai_api_key_enc = models.TextField(blank=True, default="")
    google_api_key_enc = models.TextField(blank=True, default="")
    ollama_base_url = models.CharField(max_length=255, blank=True, default="http://localhost:11434")

    updated_at = models.DateTimeField(auto_now=True)


class KnowledgeFile(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="knowledge_files")
    file = models.FileField(upload_to="uploads/%Y/%m/%d/")
    original_name = models.CharField(max_length=255)
    size_bytes = models.BigIntegerField(default=0)
    backend = models.CharField(max_length=32, default="openai") 
    created_at = models.DateTimeField(auto_now_add=True)


    def __str__(self):
        return f"{self.user.username}: {self.original_name}"


class Chat(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chats")
    title = models.CharField(max_length=120, default="New chat")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Message(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=16)  
    content = models.TextField(default="")
    is_partial = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)