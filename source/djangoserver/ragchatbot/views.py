from django.shortcuts import render, redirect
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def chat_page(request):
    return render(request, "chat/index.html")


def login_view(request):
    return redirect("/")


def signup_view(request):
    return redirect("/")
