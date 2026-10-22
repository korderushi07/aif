from django.contrib.auth import get_user_model

User = get_user_model()


class AutoLoginMiddleware:
    """
    Bypasses login and signup completely by automatically assigning
    the default active user to every incoming request.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not getattr(request, "user", None) or not request.user.is_authenticated:
            user = User.objects.filter(is_superuser=True).first() or User.objects.first()
            if not user:
                user = User.objects.create(username="admin", is_staff=True, is_superuser=True)
            request.user = user
        return self.get_response(request)
