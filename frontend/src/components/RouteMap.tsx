import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RouteOption, Checkpoint, HeatmapData, HeatmapMetricMode } from '../types/routing';
import { getRiskHex, getRiskLabel, formatTimestamp, formatHoursElapsed } from '../utils/riskColors';
import { Maximize2 } from 'lucide-react';

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
  isRightDeckOpen?: boolean;
  isBottomChartOpen?: boolean;
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
  isRightDeckOpen = true,
  isBottomChartOpen = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef<boolean>(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const truckMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeBadgeMarkersRef = useRef<maplibregl.Marker[]>([]);

  const activeRoute = routes.find((r) => r.route_id === activeRouteId) || routes[0];

  // Helper: Fit map bounds tightly to routes corridor with clearance for right deck and bottom dock
  const fitCorridorBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map || !routes || routes.length === 0) return;

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
        const rightPad = isRightDeckOpen ? 430 : 80;
        const bottomPad = isBottomChartOpen ? 220 : 120;
        map.fitBounds(bounds, {
          padding: { top: 80, bottom: bottomPad, left: 70, right: rightPad },
          maxZoom: 7.2,
          duration: 750,
        });
      }
    } catch {
      // Ignore boundary errors
    }
  }, [routes, isRightDeckOpen, isBottomChartOpen]);

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
      center: [-98.5795, 39.8283],
      zoom: 4.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');

    map.on('load', () => {
      mapLoadedRef.current = true;

      // A. Heatmap Radar Layer (308 points continuous meteorological field)
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
            0.0, 'rgba(0, 0, 0, 0)',
            0.08, 'rgba(16, 185, 129, 0.35)',
            0.25, 'rgba(56, 189, 248, 0.45)',
            0.45, 'rgba(245, 158, 11, 0.60)',
            0.68, 'rgba(249, 115, 22, 0.78)',
            0.88, 'rgba(239, 68, 68, 0.88)',
            1.0, 'rgba(217, 70, 239, 0.95)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 30, 5, 52, 7, 85, 9, 125],
          'heatmap-opacity': 0.70,
        },
      });

      // B. Secondary Unselected Routes
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
          'line-color': '#070b11',
          'line-width': 5.5,
          'line-opacity': 0.7,
        },
      });

      map.addLayer({
        id: 'secondary-routes-line',
        type: 'line',
        source: 'secondary-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#475569',
          'line-width': 3,
          'line-opacity': 0.7,
          'line-dasharray': [3, 2],
        },
      });

      // Invisible Click Hit Area for Secondary Routes
      map.addLayer({
        id: 'secondary-routes-hit',
        type: 'line',
        source: 'secondary-routes',
        paint: {
          'line-color': 'transparent',
          'line-width': 22,
        },
      });

      // C. Active Route Color-Coded Segments
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
          'line-width': 8.0,
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
          'line-width': 5.0,
          'line-opacity': 1.0,
        },
      });

      // D. Checkpoint Markers (Precision Dots Scaled by Zoom to Prevent Overlapping Blobs)
      map.addSource('active-checkpoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Crisp Checkpoint Circles with Zoom-Scaled Radii
      map.addLayer({
        id: 'active-checkpoints-circle',
        type: 'circle',
        source: 'active-checkpoints',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4,
            [
              'match',
              ['get', 'overall_risk'],
              'NO_TRAVEL', 4.0,
              'SEVERE', 3.5,
              'HIGH', 3.0,
              'MODERATE', 2.5,
              2.0,
            ],
            7,
            [
              'match',
              ['get', 'overall_risk'],
              'NO_TRAVEL', 5.5,
              'SEVERE', 5.0,
              'HIGH', 4.0,
              'MODERATE', 3.0,
              2.5,
            ],
            10,
            [
              'match',
              ['get', 'overall_risk'],
              'NO_TRAVEL', 7.5,
              'SEVERE', 6.5,
              'HIGH', 5.5,
              'MODERATE', 4.5,
              3.5,
            ],
          ],
          'circle-color': ['get', 'risk_color'],
          'circle-stroke-width': 1.0,
          'circle-stroke-color': '#070b11',
          'circle-pitch-alignment': 'map',
        },
      });

      // Route selection on click
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

      // Checkpoint selection on click
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

      // Truck Position Marker
      const truckEl = document.createElement('div');
      truckEl.className = 'truck-marker flex items-center justify-center';
      truckEl.style.width = '28px';
      truckEl.style.height = '28px';
      truckEl.style.position = 'absolute';
      truckEl.style.pointerEvents = 'none';
      truckEl.innerHTML = `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-sky-400 opacity-60"></span>
          <div class="relative bg-[#070b11] border-2 border-sky-400 text-sky-400 p-1.5 rounded-full shadow-xl flex items-center justify-center">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
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

  // 2. Update Heatmap Radar Layer (60 FPS, updates GeoJSON source only, organic boundary feathering)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const source = map.getSource('corridor-heatmap') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (!showHeatmap || !heatmapData || !heatmapData.points || heatmapData.points.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    // Downsample route coordinates for fast corridor distance feathering
    const sampleCoords: [number, number][] = [];
    if (routes && routes.length > 0) {
      for (const r of routes) {
        const c = r.geometry?.coordinates;
        if (c) {
          const step = Math.max(1, Math.floor(c.length / 40));
          for (let i = 0; i < c.length; i += step) {
            sampleCoords.push(c[i] as [number, number]);
          }
        }
      }
    }

    const clampedHour = Math.max(0, Math.min(48, Math.round(forecastHour)));
    const features: GeoJSON.Feature[] = heatmapData.points
      .map((pt) => {
        let falloff = pt.falloff;
        if ((falloff === undefined || falloff === 1.0) && sampleCoords.length > 0) {
          let minDist2 = Infinity;
          const cosLat = Math.cos((pt.lat * Math.PI) / 180);
          for (const [rLon, rLat] of sampleCoords) {
            const dLat = pt.lat - rLat;
            const dLon = (pt.lon - rLon) * cosLat;
            const d2 = dLat * dLat + dLon * dLon;
            if (d2 < minDist2) minDist2 = d2;
          }
          const distDeg = Math.sqrt(minDist2);
          falloff = Math.max(0.0, Math.min(1.0, 1.0 - Math.pow(distDeg / 1.8, 1.6)));
        }
        falloff = falloff ?? 1.0;

        // Feather outer boundary to zero - eliminate rectangular box edges
        if (falloff <= 0.04) {
          return null;
        }

        const metric = pt.hourly[clampedHour] || pt.hourly[0];
        let weight = 0.2;

        if (heatmapMetric === 'risk') {
          const baseRisk = (metric.risk_level - 1) / 4.0;
          const windFactor = Math.min(0.2, (metric.wind_mph / 60.0) * 0.2);
          weight = Math.max(0.14, baseRisk * 0.8 + 0.14 + windFactor);
        } else if (heatmapMetric === 'wind') {
          weight = Math.max(0.12, Math.min(1.0, metric.wind_mph / 50.0));
        } else if (heatmapMetric === 'precip') {
          const eqPrecip = metric.rain_in_hr + metric.snow_in_hr * 0.35;
          weight = eqPrecip > 0.01 ? Math.max(0.18, Math.min(1.0, eqPrecip / 0.5)) : 0.05;
        }

        const featheredWeight = weight * falloff;

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [pt.lon, pt.lat],
          },
          properties: {
            weight: Math.max(0.02, Math.min(1.0, featheredWeight)),
            risk_level: metric.risk_level,
            wind_mph: metric.wind_mph,
            rain_in_hr: metric.rain_in_hr,
            snow_in_hr: metric.snow_in_hr,
          },
        };
      })
      .filter(Boolean) as GeoJSON.Feature[];

    source.setData({ type: 'FeatureCollection', features });
  }, [forecastHour, showHeatmap, heatmapMetric, heatmapData, routes]);

  // 3. Update Routes Geometry, Segments, Checkpoints & On-Map Badges
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !routes || routes.length === 0) return;

    // A. Update secondary routes
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

    // B. Update active route color-coded segments
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

    // D. Render Staggered On-Map Interstate Callout Badges
    routeBadgeMarkersRef.current.forEach((m) => m.remove());
    routeBadgeMarkersRef.current = [];

    const badgeRatios = [0.32, 0.52, 0.68];

    routes.forEach((r, idx) => {
      const coords = r.geometry?.coordinates;
      if (!coords || coords.length === 0) return;

      const ratio = badgeRatios[idx % badgeRatios.length];
      const targetIdx = Math.min(coords.length - 1, Math.max(0, Math.floor(coords.length * ratio)));
      const [midLon, midLat] = coords[targetIdx];
      const isSelected = r.route_id === activeRouteId;

      const badgeEl = document.createElement('div');
      badgeEl.className = 'route-callout-badge cursor-pointer';
      badgeEl.style.width = 'max-content';
      badgeEl.style.maxWidth = '220px';
      badgeEl.style.position = 'absolute';
      badgeEl.style.whiteSpace = 'nowrap';
      badgeEl.style.pointerEvents = 'auto';
      badgeEl.innerHTML = `
        <div class="inline-flex items-center w-max max-w-[200px] whitespace-nowrap px-2 py-1 rounded border text-[10px] font-mono tabular-nums shadow-xl gap-1.5 transition-all select-none ${
          isSelected
            ? 'bg-[#0f172a] border-sky-400 text-sky-200 font-bold ring-2 ring-sky-400/50 scale-105 z-20'
            : 'bg-[#0b0f17]/95 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white z-10'
        }">
          <span class="text-sky-400 font-bold">#${idx + 1}</span>
          <span class="truncate max-w-[120px] font-sans">${r.name.replace(/^Via\s+/i, '')}</span>
          <span class="text-slate-500">•</span>
          <span>${r.travel_time_formatted}</span>
        </div>
      `;

      badgeEl.onclick = (e) => {
        e.stopPropagation();
        onSelectRoute(r.route_id);
      };

      const marker = new maplibregl.Marker({ element: badgeEl, anchor: 'center' })
        .setLngLat([midLon, midLat])
        .addTo(map);

      routeBadgeMarkersRef.current.push(marker);
    });

    // E. Fit corridor bounds with a short delay to ensure canvas dimension is settled
    const timer = setTimeout(() => {
      fitCorridorBounds();
    }, 80);
    return () => clearTimeout(timer);
  }, [routes, activeRouteId, activeRoute, onSelectRoute, fitCorridorBounds]);

  // 4. Re-fit camera bounds smoothly when right deck or bottom profile chart collapses/expands
  useEffect(() => {
    const timer = setTimeout(() => {
      fitCorridorBounds();
    }, 120);
    return () => clearTimeout(timer);
  }, [isRightDeckOpen, isBottomChartOpen, fitCorridorBounds]);

  // 4. Update Truck Position on Slider Scrub
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
      ? `<div class="mt-2 text-[11px] bg-[#070b11] rounded p-2 border border-slate-800 text-slate-300 space-y-1">
           ${cp.risk_reasons.map((r) => `<p class="leading-relaxed">• ${r}</p>`).join('')}
         </div>`
      : '';

    const popupContent = `
      <div class="bg-[#0b0f17] text-slate-100 p-3 rounded-lg border border-slate-700/90 shadow-2xl max-w-xs text-xs font-sans">
        <div class="flex items-center justify-between pb-1.5 border-b border-slate-800">
          <div class="font-mono tabular-nums font-bold text-slate-100">
            Mile ${cp.milepost.toFixed(1)}
          </div>
          <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase" style="background-color: ${riskHex}22; color: ${riskHex}; border: 1px solid ${riskHex}66;">
            ${riskLabel}
          </span>
        </div>
        <div class="mt-2 space-y-1 text-[11px] font-mono tabular-nums text-slate-300">
          <div class="flex justify-between">
            <span class="text-slate-500 font-sans">ETA:</span>
            <span class="text-slate-200">${formatTimestamp(cp.eta_iso)} (${formatHoursElapsed(cp.hours_from_departure)})</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500 font-sans">Wind Speed:</span>
            <span class="${cp.wind_speed_mph >= 35 ? 'text-orange-400 font-bold' : 'text-slate-200'}">${cp.wind_speed_mph.toFixed(1)} mph</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500 font-sans">Rain Rate:</span>
            <span class="${cp.rain_rate_in_hr >= 0.25 ? 'text-amber-400 font-bold' : 'text-slate-200'}">${cp.rain_rate_in_hr.toFixed(2)} in/hr</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500 font-sans">Snow Rate:</span>
            <span class="${cp.snow_rate_in_hr >= 1.0 ? 'text-sky-300 font-bold' : 'text-slate-200'}">${cp.snow_rate_in_hr.toFixed(2)} in/hr</span>
          </div>
          ${cp.temperature_f !== null && cp.temperature_f !== undefined ? `
          <div class="flex justify-between">
            <span class="text-slate-500 font-sans">Temperature:</span>
            <span class="text-slate-200">${cp.temperature_f.toFixed(1)}°F</span>
          </div>` : ''}
        </div>
        ${reasonsHtml}
      </div>
    `;

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 14,
      className: 'enterprise-maplibre-popup',
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
    <div className="relative w-full h-full bg-[#070b11]">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Fit Corridor Viewport Button */}
      <button
        onClick={fitCorridorBounds}
        className="absolute top-4 left-14 z-10 h-8 px-2.5 rounded bg-[#0b0f17]/90 hover:bg-[#151f30] border border-slate-700/80 text-slate-300 text-[11px] font-mono flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer"
        title="Fit map camera to 3-route corridor"
      >
        <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
        <span>Fit Corridor</span>
      </button>
    </div>
  );
};
