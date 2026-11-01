import logging

from django.conf import settings
from django.core.cache import caches
from rest_framework.throttling import AnonRateThrottle

logger = logging.getLogger(__name__)


class RegisterRateThrottle(AnonRateThrottle):
    """Per-client limit on the public farmer onboarding endpoint.

    The rate is read from ``settings.REGISTER_THROTTLE_RATE`` on every request so
    it can be tuned through the environment (and overridden in tests).

    Counters live in the ``throttle`` cache, which defaults to a database table so
    every serverless instance enforces one shared quota per client IP. If that
    store is unreachable the request is counted in the per-process cache instead:
    a degraded brake is better than turning registration into a 500.

    The client is identified by ``X-Forwarded-For``. Vercel overwrites that header
    with the caller's address, so a client cannot mint a fresh bucket by sending
    its own value.
    """

    scope = 'register'

    def __init__(self):
        super().__init__()
        self.cache = caches[getattr(settings, 'THROTTLE_CACHE_ALIAS', 'throttle')]

    def get_rate(self):
        return getattr(settings, 'REGISTER_THROTTLE_RATE', '30/hour')

    def allow_request(self, request, view):
        try:
            return super().allow_request(request, view)
        except Exception:  # noqa: BLE001 - any store failure must not block onboarding
            logger.warning(
                'Register throttle store unavailable; falling back to per-process counters',
                exc_info=True,
            )
            self.cache = caches['default']
            return super().allow_request(request, view)
