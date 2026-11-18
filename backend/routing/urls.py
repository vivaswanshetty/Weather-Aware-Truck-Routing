from django.urls import path
from .views import RoutePresetsView, RouteAnalyzeView

urlpatterns = [
    path('routes/presets/', RoutePresetsView.as_view(), name='route_presets'),
    path('routes/analyze/', RouteAnalyzeView.as_view(), name='route_analyze'),
]
