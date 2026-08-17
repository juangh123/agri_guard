from rest_framework import routers
from django.urls import path
from .views import FarmViewSet, DisasterEventViewSet, RiskAlertViewSet, ClaimViewSet, chat_assistant, farmer_register

router = routers.DefaultRouter()
router.register(r'farms', FarmViewSet)
router.register(r'events', DisasterEventViewSet)
router.register(r'alerts', RiskAlertViewSet)
router.register(r'claims', ClaimViewSet)

urlpatterns = router.urls + [
    path('chat/', chat_assistant, name='chat_assistant'),
    path('auth/register/', farmer_register, name='farmer_register'),
]
