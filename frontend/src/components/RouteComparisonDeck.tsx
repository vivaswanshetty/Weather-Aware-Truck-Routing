import React from 'react';
import {
  ShieldCheck,
  AlertOctagon,
  CheckCircle2,
  ChevronRight,
  Navigation,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { RouteOption } from '../types/routing';
import { getRiskHex, getRiskBadgeClass } from '../utils/riskColors';

interface RouteComparisonDeckProps {
  routes: RouteOption[];
  activeRouteId: string;
  onSelectRoute: (id: string) => void;
  recommendationReason: string | null;
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

export const RouteComparisonDeck: React.FC<RouteComparisonDeckProps> = ({
  routes,
  activeRouteId,
  onSelectRoute,
  recommendationReason,
  isOpen = true,
  onToggleOpen,
}) => {
  if (!routes || routes.length === 0) return null;

  const recommendedRoute = routes.find((r) => r.is_recommended) || routes[0];
  const activeRoute = routes.find((r) => r.route_id === activeRouteId) || recommendedRoute;
  const isAdvised = recommendedRoute?.is_travel_advised ?? true;

  // Minimized Compact Pill View
  if (!isOpen) {
    return (
      <div
        onClick={onToggleOpen}
        className="absolute top-4 right-4 z-20 bg-[#0b0f17]/95 hover:bg-[#131b2b] backdrop-blur-md border border-slate-700/80 hover:border-slate-500 rounded-md shadow-2xl text-slate-100 px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-all select-none"
        title="Expand corridor comparison deck"
      >
        <Navigation className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-[11px] font-mono font-bold text-slate-200">
          3 Routes
        </span>
        <span className="text-slate-600">•</span>
        <span className="text-[11px] text-sky-300 font-medium truncate max-w-[150px]">
          #{routes.findIndex((r) => r.route_id === activeRouteId) + 1} {activeRoute.name.replace(/^Via\s+/i, '')}
        </span>
        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${getRiskBadgeClass(activeRoute.overall_route_risk)}`}>
          {activeRoute.overall_route_risk}
        </span>
        <PanelRightOpen className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200 ml-0.5" />
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-20 w-[368px] max-w-[calc(100vw-32px)] bg-[#0b0f17]/95 backdrop-blur-md border border-slate-800/90 rounded-lg shadow-2xl text-slate-100 flex flex-col overflow-hidden">
      {/* Top Header: Telemetry Title, Recommendation Status & Minimize Button */}
      <div className="p-3 border-b border-slate-800/80 bg-[#0e1420]/80">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">
              Corridor Comparison
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isAdvised ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-600/60 font-mono">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Travel Advised
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500 font-mono animate-pulse">
                <AlertOctagon className="w-3 h-3 text-rose-400" />
                No Travel Zone
              </span>
            )}

            {onToggleOpen && (
              <button
                onClick={onToggleOpen}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                title="Minimize corridor comparison deck"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Recommendation Reason */}
        {recommendationReason && (
          <div className="mt-2 text-[11px] leading-relaxed text-slate-300 bg-[#070b11]/80 rounded p-2 border border-slate-800 flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
            <p className="line-clamp-2">{recommendationReason}</p>
          </div>
        )}
      </div>

      {/* 3 Routes Stacked Cards */}
      <div className="p-2 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">
        {routes.map((route, idx) => {
          const isSelected = route.route_id === activeRouteId;
          const totalMiles = route.total_distance_miles || 1;

          const pNoTravel = (route.no_travel_miles / totalMiles) * 100;
          const pSevere = (route.severe_miles / totalMiles) * 100;
          const pHigh = (route.high_miles / totalMiles) * 100;
          const pModerate = (route.moderate_miles / totalMiles) * 100;
          const pLow = (route.low_miles / totalMiles) * 100;

          return (
            <div
              key={route.route_id}
              onClick={() => onSelectRoute(route.route_id)}
              className={`rounded-md p-2.5 border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#151f30] border-sky-500/90 shadow-md ring-1 ring-sky-500/30'
                  : 'bg-[#0e1420]/70 border-slate-800/80 hover:bg-[#131b2b] hover:border-slate-700'
              }`}
            >
              {/* Row 1: Rank Badge, Corridor Name, Peak Risk Pill */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      route.is_recommended
                        ? 'bg-sky-950 text-sky-300 border border-sky-700'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {route.is_recommended ? '#1 REC' : `#${idx + 1} ALT`}
                  </span>
                  <span className="text-xs font-semibold text-slate-100 truncate tracking-tight">
                    {route.name}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${getRiskBadgeClass(route.overall_route_risk)}`}>
                    {route.overall_route_risk}
                  </span>
                  <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isSelected ? 'rotate-90 text-sky-400' : ''}`} />
                </div>
              </div>

              {/* Row 2: Distance, Duration, and Average Risk Score */}
              <div className="flex items-center justify-between mt-1.5 text-[11px] font-mono tabular-nums text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="text-slate-200 font-medium">{route.total_distance_miles.toFixed(1)} mi</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-300">{route.travel_time_formatted}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-slate-500">Avg:</span>
                  <span className="font-bold text-slate-200">{route.average_risk_score.toFixed(2)}</span>
                  <span className="text-slate-500">/ 5.0</span>
                </div>
              </div>

              {/* Row 3: Proportional Stacked Risk Bar */}
              <div className="mt-2">
                <div className="h-1.5 w-full rounded-sm overflow-hidden flex bg-slate-800/90">
                  {pNoTravel > 0 && (
                    <div style={{ width: `${pNoTravel}%`, backgroundColor: getRiskHex('NO_TRAVEL') }} title={`${route.no_travel_miles} mi No Travel`} />
                  )}
                  {pSevere > 0 && (
                    <div style={{ width: `${pSevere}%`, backgroundColor: getRiskHex('SEVERE') }} title={`${route.severe_miles} mi Severe`} />
                  )}
                  {pHigh > 0 && (
                    <div style={{ width: `${pHigh}%`, backgroundColor: getRiskHex('HIGH') }} title={`${route.high_miles} mi High`} />
                  )}
                  {pModerate > 0 && (
                    <div style={{ width: `${pModerate}%`, backgroundColor: getRiskHex('MODERATE') }} title={`${route.moderate_miles} mi Moderate`} />
                  )}
                  {pLow > 0 && (
                    <div style={{ width: `${pLow}%`, backgroundColor: getRiskHex('LOW') }} title={`${route.low_miles} mi Low`} />
                  )}
                </div>

                {/* Mileage Breakdown Row */}
                <div className="grid grid-cols-5 gap-1 mt-1.5 text-[9px] font-mono tabular-nums text-center">
                  <div className="bg-[#070b11]/60 rounded py-0.5 border border-slate-800/80">
                    <span className="block text-emerald-400 font-semibold">{route.low_miles}m</span>
                    <span className="text-slate-500 text-[8px] uppercase">Low</span>
                  </div>
                  <div className="bg-[#070b11]/60 rounded py-0.5 border border-slate-800/80">
                    <span className="block text-amber-400 font-semibold">{route.moderate_miles}m</span>
                    <span className="text-slate-500 text-[8px] uppercase">Mod</span>
                  </div>
                  <div className="bg-[#070b11]/60 rounded py-0.5 border border-slate-800/80">
                    <span className="block text-orange-400 font-semibold">{route.high_miles}m</span>
                    <span className="text-slate-500 text-[8px] uppercase">High</span>
                  </div>
                  <div className="bg-[#070b11]/60 rounded py-0.5 border border-slate-800/80">
                    <span className="block text-red-400 font-semibold">{route.severe_miles}m</span>
                    <span className="text-slate-500 text-[8px] uppercase">Sev</span>
                  </div>
                  <div className="bg-[#070b11]/60 rounded py-0.5 border border-slate-800/80">
                    <span className={`block font-bold ${route.no_travel_miles > 0 ? 'text-rose-400' : 'text-slate-600'}`}>
                      {route.no_travel_miles}m
                    </span>
                    <span className="text-slate-500 text-[8px] uppercase">NoTrvl</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
