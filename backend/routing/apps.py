import sys
import threading
from django.apps import AppConfig


class RoutingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'routing'

    def ready(self):
        # Pre-warm OSRM caches for all 4 freight corridors in background on server start
        if any(cmd in " ".join(sys.argv) for cmd in ["runserver", "gunicorn", "wsgi"]):
            def _prewarm():
                try:
                    from routing.services.routing_service import fetch_three_routes

                    # Pre-warm all 4 default corridor presets in memory
                    presets_coords = [
                        (41.8781, -87.6298, 39.7392, -104.9903),  # ORD -> DEN
                        (40.7608, -111.8910, 41.1400, -104.8202),  # SLC -> CYS
                        (32.7767, -96.7970, 33.7490, -84.3880),   # DFW -> ATL
                        (47.6062, -122.3321, 44.9778, -93.2650),  # SEA -> MSP
                    ]
                    for o_lat, o_lon, d_lat, d_lon in presets_coords:
                        fetch_three_routes(o_lat, o_lon, d_lat, d_lon)
                except Exception:
                    pass

            def _keepalive():
                import time
                import requests
                # Sleep initial 5 minutes before pinging
                time.sleep(300)
                while True:
                    try:
                        # Ping own public Render URL every 10 minutes to prevent Render free tier sleep (sleep threshold is 15m)
                        requests.get(
                            "https://weather-aware-truck-routing-k0ra.onrender.com/api/routes/presets/",
                            timeout=10,
                        )
                    except Exception:
                        pass
                    time.sleep(600)  # 10 minutes

            threading.Thread(target=_prewarm, daemon=True).start()
            threading.Thread(target=_keepalive, daemon=True).start()
