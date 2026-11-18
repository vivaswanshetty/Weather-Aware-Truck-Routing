import sys
import threading
from django.apps import AppConfig


class RoutingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'routing'

    def ready(self):
        # Pre-warm OSRM cache for the default Chicago -> Denver corridor in background
        if any(cmd in " ".join(sys.argv) for cmd in ["runserver", "gunicorn", "wsgi"]):
            def _prewarm():
                try:
                    from routing.services.routing_service import fetch_three_routes
                    fetch_three_routes(41.8781, -87.6298, 39.7392, -104.9903)
                except Exception:
                    pass

            threading.Thread(target=_prewarm, daemon=True).start()
