from django.conf import settings
from rest_framework.throttling import AnonRateThrottle


class RegisterRateThrottle(AnonRateThrottle):
    """Per-client limit on the public farmer onboarding endpoint.

    The rate is read from ``settings.REGISTER_THROTTLE_RATE`` on every request so
    it can be tuned through the environment (and overridden in tests).

    Counters live in Django's cache. On a serverless deployment with the default
    per-process cache this is a best-effort brake on bursts from one client, not
    a global quota; point ``CACHES`` at a shared store to make it global.
    """

    scope = 'register'

    def get_rate(self):
        return getattr(settings, 'REGISTER_THROTTLE_RATE', '30/hour')
