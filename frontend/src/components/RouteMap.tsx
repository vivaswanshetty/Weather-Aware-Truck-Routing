import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RouteOption, Checkpoint, HeatmapData, HeatmapMetricMode } from '../types/routing';
import { getRiskHex, getRiskLabel, formatTimestamp, formatHoursElapsed } from '../utils/riskColors';

interface RouteMapProps {
  routes: RouteOption[];
  activeRouteId: string;
  onSelectRoute: (routeId: string) => void;
  selectedCheckpoint: Checkpoint | null;
  onSelectCheckpoint: (cp: Checkpoint | null) => void;
  forecastHour: number;
  showHeatmap: boolean;
  heatmapMetric: HeatmapMetricMode;
  heatmapData?: HeatmapData;
}

const CARTO_DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const RouteMap: React.FC<RouteMapProps> = ({
  routes,
  activeRouteId,
  onSelectRoute,
  selectedCheckpoint,
  onSelectCheckpoint,
  forecastHour,
  showHeatmap,
  heatmapMetric,
  heatmapData,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef<boolean>(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const truckMarkerRef = useRef<maplibregl.Marker | null>(null);

  const activeRoute = routes.find((r) => r.route_id === activeRouteId) || routes[0];

  // Helper: compute truck coordinate at forecastHour along active route
  const getTruckPosition = useCallback((): { lat: number; lon: number; currentCp: Checkpoint } | null => {
    if (!activeRoute || !activeRoute.checkpoints || activeRoute.checkpoints.length === 0) return null;
    const cps = activeRoute.checkpoints;

    if (forecastHour <= cps[0].hours_from_departure) {
      return { lat: cps[0].lat, lon: cps[0].lon, currentCp: cps[0] };
    }
    const lastCp = cps[cps.length - 1];
    if (forecastHour >= lastCp.hours_from_departure) {
      return { lat: lastCp.lat, lon: lastCp.lon, currentCp: lastCp };
    }

    // Find interval [k, k+1] enclosing forecastHour
    for (let i = 0; i < cps.length - 1; i++) {
      const c1 = cps[i];
      const c2 = cps[i + 1];
      if (forecastHour >= c1.hours_from_departure && forecastHour <= c2.hours_from_departure) {
        const span = c2.hours_from_departure - c1.hours_from_departure;
        const frac = span > 0 ? (forecastHour - c1.hours_from_departure) / span : 0;
        const lat = c1.lat + frac * (c2.lat - c1.lat);
        const lon = c1.lon + frac * (c2.lon - c1.lon);
        return { lat, lon, currentCp: c1 };
      }
    }
    return { lat: cps[0].lat, lon: cps[0].lon, currentCp: cps[0] };
  }, [activeRoute, forecastHour]);

  // 1. Initialize MapLibre GL Map Instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: CARTO_DARK_STYLE,
      center: [-98.5795, 39.8283], // Center of Contiguous US
      zoom: 4.2,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      mapLoadedRef.current = true;

      // A. Heatmap Source & Layer
      map.addSource('corridor-heatmap', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'corridor-heatmap-layer',
        type: 'heatmap',
        source: 'corridor-heatmap',
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 2.2],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 0, 0)',
            0.15, 'rgba(16, 185, 129, 0.35)', // Emerald low
            0.35, 'rgba(245, 158, 11, 0.55)', // Amber mod
            0.6, 'rgba(249, 115, 22, 0.75)',  // Orange high
            0.8, 'rgba(239, 68, 68, 0.85)',   // Red severe
            1.0, 'rgba(225, 29, 72, 0.95)',   // Crimson No Travel
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 35, 7, 75],
          'heatmap-opacity': 0.75,
        },
      });

      // B. Secondary Unselected Routes Source & Layer
      map.addSource('secondary-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'secondary-routes-casing',
        type: 'line',
        source: 'secondary-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0f172a',
          'line-width': 6,
          'line-opacity': 0.6,
        },
      });

      map.addLayer({
        id: 'secondary-routes-line',
        type: 'line',
        source: 'secondary-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#64748b',
          'line-width': 4,
          'line-opacity': 0.65,
          'line-dasharray': [2, 1.5],
        },
      });

      // Clickable hit area for secondary routes
      map.addLayer({
        id: 'secondary-routes-hit',
        type: 'line',
        source: 'secondary-routes',
        paint: {
          'line-color': 'transparent',
          'line-width': 18,
        },
      });

      // C. Active Route Segments (Color-Coded by Risk)
      map.addSource('active-route-segments', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'active-route-casing',
        type: 'line',
        source: 'active-route-segments',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#020617',
          'line-width': 8,
          'line-opacity': 0.95,
        },
      });

      map.addLayer({
        id: 'active-route-line',
        type: 'line',
        source: 'active-route-segments',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'risk_color'],
          'line-width': 5,
          'line-opacity': 1.0,
        },
      });

      // D. Checkpoint Circle Markers
      map.addSource('active-checkpoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'active-checkpoints-halo',
        type: 'circle',
        source: 'active-checkpoints',
        paint: {
          'circle-radius': 8,
          'circle-color': '#000000',
          'circle-opacity': 0.6,
        },
      });

      map.addLayer({
        id: 'active-checkpoints-circle',
        type: 'circle',
        source: 'active-checkpoints',
        paint: {
          'circle-radius': 5.5,
          'circle-color': ['get', 'risk_color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Click handler on secondary routes to select route
      map.on('click', 'secondary-routes-hit', (e) => {
        if (e.features && e.features[0]) {
          const rId = e.features[0].properties?.route_id;
          if (rId) onSelectRoute(rId);
        }
      });

      map.on('mouseenter', 'secondary-routes-hit', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'secondary-routes-hit', () => {
        map.getCanvas().style.cursor = '';
      });

      // Click handler on checkpoints
      map.on('click', 'active-checkpoints-circle', (e) => {
        if (e.features && e.features[0]) {
          const props = e.features[0].properties;
          if (props && activeRoute) {
            const cp = activeRoute.checkpoints.find((c) => c.index === props.index);
            if (cp) onSelectCheckpoint(cp);
          }
        }
      });

      map.on('mouseenter', 'active-checkpoints-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'active-checkpoints-circle', () => {
        map.getCanvas().style.cursor = '';
      });

      // Create Custom Animated Truck Marker
      const truckEl = document.createElement('div');
      truckEl.className = 'truck-marker-container flex items-center justify-center';
      truckEl.innerHTML = `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-emerald-400 opacity-75"></span>
          <div class="relative bg-slate-900 border-2 border-emerald-400 text-emerald-400 p-1.5 rounded-full shadow-lg flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
            </svg>
          </div>
        </div>
      `;
      truckMarkerRef.current = new maplibregl.Marker({ element: truckEl, anchor: 'center' });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, [onSelectRoute, onSelectCheckpoint]);

  // 2. Update Heatmap Data for 60 FPS slider scrub (Only modifies GeoJSON source)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const source = map.getSource('corridor-heatmap') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (!showHeatmap || !heatmapData || !heatmapData.points || heatmapData.points.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const clampedHour = Math.max(0, Math.min(48, Math.round(forecastHour)));
    const features: GeoJSON.Feature[] = heatmapData.points.map((pt) => {
      const metric = pt.hourly[clampedHour] || pt.hourly[0];
      let weight = 0.2;

      if (heatmapMetric === 'risk') {
        weight = (metric.risk_level - 1) / 4.0; // 0.0 to 1.0
      } else if (heatmapMetric === 'wind') {
        weight = Math.min(1.0, metric.wind_mph / 60.0);
      } else if (heatmapMetric === 'precip') {
        const eqPrecip = metric.rain_in_hr + metric.snow_in_hr * 0.3;
        weight = Math.min(1.0, eqPrecip / 1.0);
      }

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [pt.lon, pt.lat],
        },
        properties: {
          weight: Math.max(0.05, Math.min(1.0, weight)),
          risk_level: metric.risk_level,
          wind_mph: metric.wind_mph,
          rain_in_hr: metric.rain_in_hr,
          snow_in_hr: metric.snow_in_hr,
        },
      };
    });

    source.setData({ type: 'FeatureCollection', features });
  }, [forecastHour, showHeatmap, heatmapMetric, heatmapData]);

  // 3. Update Routes and Segments Geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !routes || routes.length === 0) return;

    // A. Update secondary unselected routes
    const secondarySource = map.getSource('secondary-routes') as maplibregl.GeoJSONSource | undefined;
    if (secondarySource) {
      const secondaryFeatures: GeoJSON.Feature[] = routes
        .filter((r) => r.route_id !== activeRouteId)
        .map((r) => ({
          type: 'Feature',
          geometry: r.geometry as unknown as GeoJSON.Geometry,
          properties: {
            route_id: r.route_id,
            name: r.name,
            total_distance_miles: r.total_distance_miles,
          },
        }));
      secondarySource.setData({ type: 'FeatureCollection', features: secondaryFeatures });
    }

    // B. Update active route segments
    const activeSegmentsSource = map.getSource('active-route-segments') as maplibregl.GeoJSONSource | undefined;
    if (activeSegmentsSource && activeRoute) {
      const segmentFeatures: GeoJSON.Feature[] = [];

      for (const cp of activeRoute.checkpoints) {
        if (cp.segment_geometry && cp.segment_geometry.length >= 2) {
          segmentFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: cp.segment_geometry,
            },
            properties: {
              index: cp.index,
              milepost: cp.milepost,
              overall_risk: cp.overall_risk,
              risk_color: getRiskHex(cp.overall_risk),
            },
          });
        }
      }

      // Fallback if segment_geometry is missing: use full route line
      if (segmentFeatures.length === 0 && activeRoute.geometry) {
        segmentFeatures.push({
          type: 'Feature',
          geometry: activeRoute.geometry as unknown as GeoJSON.Geometry,
          properties: {
            index: 0,
            overall_risk: activeRoute.overall_route_risk,
            risk_color: getRiskHex(activeRoute.overall_route_risk),
          },
        });
      }

      activeSegmentsSource.setData({ type: 'FeatureCollection', features: segmentFeatures });
    }

    // C. Update active route checkpoints
    const cpSource = map.getSource('active-checkpoints') as maplibregl.GeoJSONSource | undefined;
    if (cpSource && activeRoute) {
      const cpFeatures: GeoJSON.Feature[] = activeRoute.checkpoints.map((cp) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [cp.lon, cp.lat],
        },
        properties: {
          index: cp.index,
          milepost: cp.milepost,
          overall_risk: cp.overall_risk,
          risk_color: getRiskHex(cp.overall_risk),
        },
      }));
      cpSource.setData({ type: 'FeatureCollection', features: cpFeatures });
    }

    // D. Fit map bounds to encompass all routes
    try {
      const bounds = new maplibregl.LngLatBounds();
      let hasCoords = false;
      for (const r of routes) {
        if (r.geometry && r.geometry.coordinates) {
          for (const coord of r.geometry.coordinates) {
            bounds.extend(coord as [number, number]);
            hasCoords = true;
          }
        }
      }
      if (hasCoords) {
        map.fitBounds(bounds, {
          padding: { top: 70, bottom: 90, left: 420, right: 60 },
          duration: 900,
          maxZoom: 12,
        });
      }
    } catch {
      // Ignore boundary errors
    }
  }, [routes, activeRouteId, activeRoute]);

  // 4. Synchronize Truck Position Marker with Forecast Slider
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !truckMarkerRef.current) return;

    const truckPos = getTruckPosition();
    if (truckPos) {
      truckMarkerRef.current.setLngLat([truckPos.lon, truckPos.lat]);
      if (!truckMarkerRef.current.getElement().parentElement) {
        truckMarkerRef.current.addTo(map);
      }
    } else {
      truckMarkerRef.current.remove();
    }
  }, [forecastHour, getTruckPosition]);

  // 5. Open/Update Checkpoint Popup when selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    if (!selectedCheckpoint) return;

    const cp = selectedCheckpoint;
    const riskHex = getRiskHex(cp.overall_risk);
    const riskLabel = getRiskLabel(cp.overall_risk);

    const reasonsHtml = cp.risk_reasons && cp.risk_reasons.length > 0
      ? `<div class="mt-2 text-xs bg-slate-800/90 rounded p-1.5 border border-slate-700 text-slate-300">
           ${cp.risk_reasons.map((r) => `<p class="leading-relaxed">• ${r}</p>`).join('')}
         </div>`
      : '';

    const popupContent = `
      <div class="bg-slate-900 text-slate-100 p-3 rounded-lg border border-slate-700 shadow-xl max-w-xs text-sm">
        <div class="flex items-center justify-between pb-1.5 border-b border-slate-800">
          <span class="font-bold text-slate-200">Mile ${cp.milepost.toFixed(1)}</span>
          <span class="text-xs px-2 py-0.5 rounded font-bold" style="background-color: ${riskHex}22; color: ${riskHex}; border: 1px solid ${riskHex}66;">
            ${riskLabel}
          </span>
        </div>
        <div class="mt-2 space-y-1 text-xs text-slate-300">
          <div class="flex justify-between">
            <span class="text-slate-400">Truck ETA:</span>
            <span class="font-medium">${formatTimestamp(cp.eta_iso)} (${formatHoursElapsed(cp.hours_from_departure)})</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Wind Speed:</span>
            <span class="font-medium ${cp.wind_speed_mph >= 35 ? 'text-orange-400 font-bold' : ''}">${cp.wind_speed_mph.toFixed(1)} mph</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Rain Rate:</span>
            <span class="font-medium ${cp.rain_rate_in_hr >= 0.25 ? 'text-amber-400 font-bold' : ''}">${cp.rain_rate_in_hr.toFixed(2)} in/hr</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Snow Rate:</span>
            <span class="font-medium ${cp.snow_rate_in_hr >= 1.0 ? 'text-sky-300 font-bold' : ''}">${cp.snow_rate_in_hr.toFixed(2)} in/hr</span>
          </div>
          ${cp.temperature_f !== null && cp.temperature_f !== undefined ? `
          <div class="flex justify-between">
            <span class="text-slate-400">Temperature:</span>
            <span class="font-medium">${cp.temperature_f.toFixed(1)}°F</span>
          </div>` : ''}
        </div>
        ${reasonsHtml}
      </div>
    `;

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 15,
      className: 'custom-maplibre-popup',
    })
      .setLngLat([cp.lon, cp.lat])
      .setHTML(popupContent)
      .addTo(map);

    popup.on('close', () => {
      onSelectCheckpoint(null);
    });

    popupRef.current = popup;
  }, [selectedCheckpoint, onSelectCheckpoint]);

  return (
    <div className="relative w-full h-full bg-slate-950">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};
