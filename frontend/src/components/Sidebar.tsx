import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Truck,
  ArrowRightLeft,
  Navigation,
  Calendar,
  Weight,
  Layers,
  CloudLightning,
  AlertTriangle,
  Info,
  Loader2,
  Filter,
  X,
} from 'lucide-react';
import {
  RouteOption,
  Checkpoint,
  CorridorPreset,
  AnalyzeRequest,
} from '../types/routing';
import {
  getRiskBadgeClass,
  formatHoursElapsed,
} from '../utils/riskColors';

interface SidebarProps {
  origin: string;
  setOrigin: (val: string) => void;
  destination: string;
  setDestination: (val: string) => void;
  departureTime: string;
  setDepartureTime: (val: string) => void;
  loadWeight: number;
  setLoadWeight: (val: number) => void;
  sampleInterval: 10 | 25 | 50;
  setSampleInterval: (val: 10 | 25 | 50) => void;
  weatherMode: 'live' | 'simulated_storm';
  setWeatherMode: (val: 'live' | 'simulated_storm') => void;
  presets: CorridorPreset[];
  onSelectPreset: (preset: CorridorPreset) => void;
  onAnalyze: (customParams?: Partial<AnalyzeRequest>) => void;
  isLoading: boolean;
  error: string | null;
  routes: RouteOption[];
  activeRouteId: string;
  selectedCheckpoint: Checkpoint | null;
  onSelectCheckpoint: (cp: Checkpoint | null) => void;
  onOpenRulesModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  origin,
  setOrigin,
  destination,
  setDestination,
  departureTime,
  setDepartureTime,
  loadWeight,
  setLoadWeight,
  sampleInterval,
  setSampleInterval,
  weatherMode,
  setWeatherMode,
  presets,
  onSelectPreset,
  onAnalyze,
  isLoading,
  error,
  routes,
  activeRouteId,
  selectedCheckpoint,
  onSelectCheckpoint,
  onOpenRulesModal,
}) => {
  const [filterElevatedOnly, setFilterElevatedOnly] = useState<boolean>(false);
  const tableBodyRef = useRef<HTMLDivElement>(null);

  const activeRoute = routes.find((r) => r.route_id === activeRouteId) || routes[0];

  // Reset checkpoint log scroll to 0m (top) whenever active route or routes change
  useEffect(() => {
    if (tableBodyRef.current) {
      tableBodyRef.current.scrollTop = 0;
    }
  }, [activeRouteId, routes]);

  const handleSwapLocations = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const handleWeightPillClick = (weight: number) => {
    setLoadWeight(weight);
    onAnalyze({ load_weight_lbs: weight });
  };

  const handleIntervalChange = (val: 10 | 25 | 50) => {
    setSampleInterval(val);
    onAnalyze({ sample_interval_miles: val });
  };

  const handleWeatherModeSelect = (mode: 'live' | 'simulated_storm') => {
    setWeatherMode(mode);
    onAnalyze({ weather_mode: mode });
  };

  // Active load rule caption
  const activeRuleCaption = useMemo(() => {
    if (loadWeight > 40000) {
      return '>40,000 lb rule: 35–44 mph wind escalates to SEVERE';
    }
    if (loadWeight > 30000) {
      return '>30,000 lb rule: 45–54 mph wind escalates to NO TRAVEL';
    }
    return 'Standard baseline: 45–54 mph SEVERE, ≥55 mph NO TRAVEL';
  }, [loadWeight]);

  // Filtered checkpoints for data table
  const filteredCheckpoints = useMemo(() => {
    if (!activeRoute || !activeRoute.checkpoints) return [];
    if (!filterElevatedOnly) return activeRoute.checkpoints;
    return activeRoute.checkpoints.filter((c) => c.overall_risk !== 'LOW');
  }, [activeRoute, filterElevatedOnly]);

  return (
    <aside className="w-full lg:w-[360px] h-full bg-[#0b0f17] border-r border-slate-800/90 flex flex-col shrink-0 overflow-hidden text-slate-100 z-30 font-sans">
      {/* Top Header */}
      <div className="p-2.5 border-b border-slate-800/90 bg-[#070b11]/90 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-sky-500/10 border border-sky-500/20 p-1.5 rounded text-sky-400">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-xs tracking-tight text-white flex items-center gap-1.5">
              <span>SPOTTER DISPATCH</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-[10px] font-mono text-slate-500 tracking-wider uppercase">
              OSRM + METEO • TELEMETRY
            </p>
          </div>
        </div>

        <button
          onClick={onOpenRulesModal}
          className="text-[11px] font-mono h-6.5 px-2 rounded bg-[#111827] hover:bg-slate-800 text-slate-300 border border-slate-700/80 flex items-center gap-1 transition-colors cursor-pointer"
          title="View Official Wind, Rain, Snow & Weight Rules"
        >
          <Info className="w-3 h-3 text-sky-400" />
          <span>Rules</span>
        </button>
      </div>

      {/* Compact Top Dispatch Controls (shrink-0, 100% visible without scrolling) */}
      <div className="p-2.5 space-y-2 shrink-0 border-b border-slate-800/90 bg-[#0b0f17]">
        {/* Prominent Quick-Switch: Live Weather Feed vs Simulated Storm */}
        <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#070b11] rounded border border-slate-800/90">
          <button
            onClick={() => handleWeatherModeSelect('live')}
            className={`py-1 px-2 text-[10px] font-mono rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              weatherMode === 'live'
                ? 'bg-emerald-950 border border-emerald-500/80 text-emerald-300 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${weatherMode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            <span>Live Open-Meteo</span>
          </button>
          <button
            onClick={() => handleWeatherModeSelect('simulated_storm')}
            className={`py-1 px-2 text-[10px] font-mono rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              weatherMode === 'simulated_storm'
                ? 'bg-amber-950 border border-amber-500/80 text-amber-300 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CloudLightning className="w-3 h-3 text-amber-400" />
            <span>Storm Simulation</span>
          </button>
        </div>

        {/* Corridor Presets Grid */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1 flex items-center justify-between">
            <span>Corridors</span>
            <span className="text-[9px] font-mono text-slate-500">1-Click Load</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {presets.map((preset) => {
              const codes: Record<string, string> = {
                chicago_denver: 'ORD → DEN',
                slc_cheyenne: 'SLC → CYS',
                dallas_atlanta: 'DFW → ATL',
                seattle_minneapolis: 'SEA → MSP',
              };
              const code = codes[preset.id] || preset.title;

              return (
                <button
                  key={preset.id}
                  onClick={() => onSelectPreset(preset)}
                  className="text-left px-2 py-1 rounded bg-[#111827]/90 hover:bg-[#182338] border border-slate-800 hover:border-slate-700 text-xs transition-all group cursor-pointer"
                >
                  <div className="font-mono font-bold text-slate-200 group-hover:text-sky-300 text-[11px]">
                    {code}
                  </div>
                  <div className="text-[9px] text-slate-500 truncate font-mono tabular-nums">
                    {(preset.default_load_weight_lbs / 1000).toFixed(0)}k lb • {preset.default_interval_miles}mi
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Origin & Destination Inputs */}
        <div className="bg-[#0e1420]/70 rounded-md p-2 border border-slate-800/80 space-y-1.5">
          <div className="relative flex items-center">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="e.g. Chicago, IL"
              className="w-full bg-[#070b11] border border-slate-800 rounded pl-6 pr-7 py-1 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 text-xs font-mono"
            />
            {origin && (
              <button
                type="button"
                onClick={() => setOrigin('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300 rounded cursor-pointer"
                title="Clear origin"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] uppercase font-mono text-slate-500 tracking-wider">Waypoints</span>
            <button
              onClick={handleSwapLocations}
              className="h-4.5 px-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-[9px] flex items-center gap-1 transition-colors cursor-pointer"
              title="Swap Origin and Destination"
            >
              <ArrowRightLeft className="w-2.5 h-2.5" />
              <span>Swap</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-rose-500" />
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="e.g. Denver, CO"
              className="w-full bg-[#070b11] border border-slate-800 rounded pl-6 pr-7 py-1 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 text-xs font-mono"
            />
            {destination && (
              <button
                type="button"
                onClick={() => setDestination('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300 rounded cursor-pointer"
                title="Clear destination"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 2-Column: Departure & Sampling Interval */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 flex items-center gap-1 mb-0.5">
              <Calendar className="w-3 h-3 text-sky-400" />
              <span>Departure</span>
            </label>
            <input
              type="datetime-local"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="w-full bg-[#070b11] border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-sky-500 text-[11px] font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 flex items-center gap-1 mb-0.5">
              <Layers className="w-3 h-3 text-sky-400" />
              <span>Interval</span>
            </label>
            <div className="flex bg-[#070b11] rounded border border-slate-800 p-0.5">
              {([10, 25, 50] as const).map((interval) => (
                <button
                  key={interval}
                  onClick={() => handleIntervalChange(interval)}
                  className={`flex-1 py-0.5 text-[10px] font-mono rounded transition-all cursor-pointer ${
                    sampleInterval === interval
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {interval}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Gross Load Weight Controls */}
        <div className="bg-[#0e1420]/70 rounded-md p-2 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 flex items-center gap-1">
              <Weight className="w-3 h-3 text-amber-400" />
              <span>Gross Load</span>
            </span>
            <span className="font-mono font-bold text-amber-300 text-xs tabular-nums">
              {loadWeight.toLocaleString()} lb
            </span>
          </div>

          <input
            type="range"
            min={10000}
            max={80000}
            step={1000}
            value={loadWeight}
            onChange={(e) => setLoadWeight(Number(e.target.value))}
            onMouseUp={() => onAnalyze()}
            onTouchEnd={() => onAnalyze()}
            className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
          />

          <p className="text-[9px] font-mono text-slate-400 leading-tight">
            {activeRuleCaption}
          </p>

          <div className="grid grid-cols-3 gap-1 pt-0.5">
            <button
              onClick={() => handleWeightPillClick(25000)}
              className={`py-0.5 text-[10px] font-mono rounded border transition-all cursor-pointer ${
                loadWeight === 25000
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold'
                  : 'bg-[#070b11] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              25k lb
            </button>
            <button
              onClick={() => handleWeightPillClick(35000)}
              className={`py-0.5 text-[10px] font-mono rounded border transition-all cursor-pointer ${
                loadWeight === 35000
                  ? 'bg-rose-950 border-rose-500 text-rose-300 font-bold'
                  : 'bg-[#070b11] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              35k (&gt;30k)
            </button>
            <button
              onClick={() => handleWeightPillClick(45000)}
              className={`py-0.5 text-[10px] font-mono rounded border transition-all cursor-pointer ${
                loadWeight === 45000
                  ? 'bg-orange-950 border-orange-500 text-orange-300 font-bold'
                  : 'bg-[#070b11] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              45k (&gt;40k)
            </button>
          </div>
        </div>

        {/* Action Row: Full-Width High-Contrast Calculate Dispatch Button */}
        <div>
          <button
            onClick={() => onAnalyze()}
            disabled={isLoading}
            className="w-full h-8 px-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium text-xs rounded shadow flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="font-mono text-[11px]">Calculating Dispatch...</span>
              </>
            ) : (
              <>
                <Navigation className="w-3.5 h-3.5" />
                <span>Calculate Dispatch</span>
              </>
            )}
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-2 rounded bg-rose-950/80 border border-rose-500/80 text-rose-300 text-xs flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-tight">{error}</p>
          </div>
        )}
      </div>

      {/* Checkpoint Telemetry Table (Bottom Half of Sidebar) */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#070b11]/80">
        <div className="p-2.5 border-b border-slate-800/80 bg-[#0e1420]/80 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">
              Checkpoint Telemetry Log
            </span>
            <span className="text-[10px] font-mono text-slate-500 tabular-nums">
              ({filteredCheckpoints.length})
            </span>
          </div>

          <button
            onClick={() => setFilterElevatedOnly(!filterElevatedOnly)}
            className={`text-[10px] font-mono h-5 px-2 rounded border flex items-center gap-1 transition-all cursor-pointer ${
              filterElevatedOnly
                ? 'bg-amber-950 border-amber-500 text-amber-300 font-bold'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Filter checkpoints with elevated weather risk"
          >
            <Filter className="w-2.5 h-2.5" />
            <span>Elevated</span>
          </button>
        </div>

        {/* Table Body with tableBodyRef */}
        <div ref={tableBodyRef} className="flex-1 overflow-y-auto">
          {filteredCheckpoints.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs font-mono">
              No checkpoints matching filter.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
              <thead className="bg-[#0b0f17] text-slate-500 text-[9px] uppercase tracking-wider sticky top-0 border-b border-slate-800">
                <tr>
                  <th className="py-1 px-2.5">Mile</th>
                  <th className="py-1 px-2">ETA</th>
                  <th className="py-1 px-2">Wind</th>
                  <th className="py-1 px-2">Precip</th>
                  <th className="py-1 px-2.5 text-right">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredCheckpoints.map((cp) => {
                  const isSelected = selectedCheckpoint?.index === cp.index;
                  const precipText = cp.snow_rate_in_hr > 0
                    ? `${cp.snow_rate_in_hr.toFixed(1)}"s`
                    : `${cp.rain_rate_in_hr.toFixed(2)}"r`;

                  return (
                    <tr
                      key={cp.index}
                      onClick={() => onSelectCheckpoint(cp)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-950/80 text-white font-semibold'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <td className="py-1 px-2.5 font-bold text-slate-200">
                        {cp.milepost.toFixed(0)}m
                      </td>
                      <td className="py-1 px-2 text-slate-400 text-[10px]">
                        {formatHoursElapsed(cp.hours_from_departure)}
                      </td>
                      <td className={`py-1 px-2 ${cp.wind_speed_mph >= 35 ? 'text-orange-400 font-bold' : 'text-slate-300'}`}>
                        {cp.wind_speed_mph.toFixed(0)}
                      </td>
                      <td className="py-1 px-2 text-slate-400 text-[10px]">
                        {precipText}
                      </td>
                      <td className="py-1 px-2.5 text-right">
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${getRiskBadgeClass(cp.overall_risk)}`}>
                          {cp.overall_risk}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </aside>
  );
};
