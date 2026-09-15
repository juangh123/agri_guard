import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django_asgi_app = get_asgi_application()

from core import routing


class EnsureHttpRequestBodyLength:
    """Restore Content-Length for proxies that forward an ASGI body without it."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get('type') != 'http':
            await self.app(scope, receive, send)
            return

        headers = list(scope.get('headers', []))
        if any(
            key.lower() == b'content-length' and value.strip()
            for key, value in headers
        ):
            await self.app(scope, receive, send)
            return

        body_parts = []
        while True:
            message = await receive()
            if message.get('type') == 'http.disconnect':
                await self.app(scope, receive, send)
                return
            body_parts.append(message.get('body', b''))
            if not message.get('more_body', False):
                break

        body = b''.join(body_parts)
        headers = [
            (key, value)
            for key, value in headers
            if key.lower() not in (b'content-length', b'transfer-encoding')
        ]
        headers.append((b'content-length', str(len(body)).encode('ascii')))
        scope = dict(scope, headers=headers)

        body_sent = False

        async def replay_body():
            nonlocal body_sent
            if not body_sent:
                body_sent = True
                return {
                    'type': 'http.request',
                    'body': body,
                    'more_body': False,
                }
            return await receive()

        await self.app(scope, replay_body, send)


application = ProtocolTypeRouter({
    "http": EnsureHttpRequestBodyLength(django_asgi_app),
    "websocket": AllowedHostsOriginValidator(
        URLRouter(
            routing.websocket_urlpatterns
        )
    ),
})
