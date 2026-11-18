import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, RotateCcw, Activity, Wind, CloudRain, Eye, EyeOff } from 'lucide-react';
import { HeatmapMetricMode, Checkpoint } from '../types/routing';
import { RISK_COLORS, getRiskHex, formatTimestamp } from '../utils/riskColors';

interface ForecastSliderProps {
  forecastHour: number;
  onForecastHourChange: (action: number | ((prev: number) => number)) => void;
  baseDepartureTime?: string;
  showHeatmap: boolean;
  onToggleHeatmap: (show: boolean) => void;
  heatmapMetric: HeatmapMetricMode;
  onMetricChange: (metric: HeatmapMetricMode) => void;
  checkpoints?: Checkpoint[];
  selectedCheckpoint?: Checkpoint | null;
  onSelectCheckpoint?: (cp: Checkpoint | null) => void;
}

export const ForecastSlider: React.FC<ForecastSliderProps> = ({
  forecastHour,
  onForecastHourChange,
  baseDepartureTime,
  showHeatmap,
  onToggleHeatmap,
  heatmapMetric,
  onMetricChange,
  checkpoints = [],
  selectedCheckpoint,
  onSelectCheckpoint,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hoveredCp, setHoveredCp] = useState<Checkpoint | null>(null);
  const timerRef = useRef<number | null>(null);

  // Compute timestamp at selected forecastHour
  const currentTimestamp = useMemo(() => {
    try {
      const base = baseDepartureTime ? new Date(baseDepartureTime) : new Date();
      const current = new Date(base.getTime() + forecastHour * 3600 * 1000);
      return formatTimestamp(current.toISOString());
    } catch {
      return `Hour +${forecastHour}`;
    }
  }, [baseDepartureTime, forecastHour]);

  // Truck position percentage along checkpoints for vertical playhead
  const truckPercentage = useMemo(() => {
    if (!checkpoints || checkpoints.length === 0) return 0;
    const maxHours = checkpoints[checkpoints.length - 1].hours_from_departure || 1;
    const pct = Math.min(100, Math.max(0, (forecastHour / maxHours) * 100));
    return pct;
  }, [checkpoints, forecastHour]);

  // Max wind speed for bar scaling
  const maxWind = useMemo(() => {
    if (!checkpoints || checkpoints.length === 0) return 60;
    return Math.max(50, ...checkpoints.map((c) => c.wind_speed_mph));
  }, [checkpoints]);

  // Handle Play/Pause animation loop
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = window.setInterval(() => {
        onForecastHourChange((prev) => {
          if (prev >= 48) return 0;
          return prev + 1;
        });
      }, 240);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, onForecastHourChange]);

  const togglePlay = () => setIsPlaying((p) => !p);
  const handleReset = () => {
    setIsPlaying(false);
    onForecastHourChange(0);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-4xl bg-[#0b0f17]/95 backdrop-blur-md border border-slate-800/90 rounded-lg shadow-2xl text-slate-100 flex flex-col overflow-hidden">
      {/* Top Strip: Interactive Checkpoint Weather & Risk Profile Chart */}
      {checkpoints.length > 0 && (
        <div className="px-3 pt-2 pb-1.5 border-b border-slate-800/70 bg-[#0e1420]/60 relative">
          <div className="flex items-center justify-between text-[10px] uppercase font-mono text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              Corridor Wind & Risk Profile (Mile 0 → {checkpoints[checkpoints.length - 1]?.milepost.toFixed(0)} mi)
            </span>
            {hoveredCp ? (
              <span className="text-slate-200 font-semibold font-mono tabular-nums">
                MI {hoveredCp.milepost.toFixed(1)} • {hoveredCp.wind_speed_mph.toFixed(0)} mph • {hoveredCp.overall_risk}
              </span>
            ) : (
              <span className="text-slate-500 font-mono">Hover bar for checkpoint telemetry</span>
            )}
          </div>

          {/* Bar Chart Container */}
          <div className="relative h-10 w-full flex items-end gap-[2px] pt-1">
            {checkpoints.map((cp) => {
              const isSelected = selectedCheckpoint?.index === cp.index;
              const isHovered = hoveredCp?.index === cp.index;
              const heightPct = Math.max(16, (cp.wind_speed_mph / maxWind) * 100);
              const color = getRiskHex(cp.overall_risk);

              return (
                <div
                  key={cp.index}
                  onClick={() => onSelectCheckpoint?.(cp)}
                  onMouseEnter={() => setHoveredCp(cp)}
                  onMouseLeave={() => setHoveredCp(null)}
                  className={`flex-1 rounded-t-xs transition-all cursor-pointer relative group ${
                    isSelected ? 'ring-2 ring-white z-10' : ''
                  }`}
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: color,
                    opacity: isHovered || isSelected ? 1 : 0.85,
                  }}
                  title={`Mile ${cp.milepost.toFixed(1)}: ${cp.wind_speed_mph.toFixed(0)} mph wind • ${cp.overall_risk}`}
                />
              );
            })}

            {/* Synchronized Truck Playhead Line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none transition-all duration-200"
              style={{ left: `${truckPercentage}%` }}
            >
              <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-white shadow-md border border-slate-900" />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Strip: 0-48h Forecast Scrubber & Controls */}
      <div className="p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
          {/* Left: Play/Pause/Reset & Hour Badge */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={togglePlay}
              className={`h-7 px-2.5 rounded font-medium flex items-center gap-1.5 transition-colors text-[11px] ${
                isPlaying
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
              }`}
              title={isPlaying ? 'Pause animation' : 'Play 0-48h forecast'}
            >
              {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
              <span>{isPlaying ? 'Pause' : 'Play 0–48h'}</span>
            </button>

            <button
              onClick={handleReset}
              className="h-7 w-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors border border-slate-700"
              title="Reset to Departure (+0h)"
            >
              <RotateCcw className="w-3 h-3" />
            </button>

            <div className="h-7 bg-[#111827] border border-slate-800 px-2.5 rounded flex items-center gap-2 font-mono tabular-nums text-[11px]">
              <span className="font-bold text-sky-400">+{forecastHour}h</span>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-slate-300 hidden sm:inline">{currentTimestamp}</span>
            </div>
          </div>

          {/* Right: Heatmap Toggle & Metric Switcher */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onToggleHeatmap(!showHeatmap)}
              className={`h-7 px-2 rounded flex items-center gap-1 text-[11px] border transition-all ${
                showHeatmap
                  ? 'bg-sky-950/90 border-sky-600/80 text-sky-300 font-medium'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400'
              }`}
              title="Toggle Corridor Heatmap Radar Layer"
            >
              {showHeatmap ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>Heatmap</span>
            </button>

            {showHeatmap && (
              <div className="flex h-7 bg-[#111827] border border-slate-800 rounded p-0.5">
                <button
                  onClick={() => onMetricChange('risk')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-all ${
                    heatmapMetric === 'risk'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Heatmap by Weather Risk Level"
                >
                  <Activity className="w-2.5 h-2.5" />
                  <span>Risk</span>
                </button>
                <button
                  onClick={() => onMetricChange('wind')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-all ${
                    heatmapMetric === 'wind'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Heatmap by Wind Speed (mph)"
                >
                  <Wind className="w-2.5 h-2.5" />
                  <span>Wind</span>
                </button>
                <button
                  onClick={() => onMetricChange('precip')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-all ${
                    heatmapMetric === 'precip'
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Heatmap by Precipitation (Rain/Snow)"
                >
                  <CloudRain className="w-2.5 h-2.5" />
                  <span>Precip</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 0-48 Hour Range Slider */}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[10px] text-slate-500 font-mono tabular-nums w-8 text-right">+0h</span>
          <input
            type="range"
            min={0}
            max={48}
            step={1}
            value={forecastHour}
            onChange={(e) => onForecastHourChange(Number(e.target.value))}
            className="flex-1 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-sky-400 focus:outline-none"
          />
          <span className="text-[10px] text-slate-500 font-mono tabular-nums w-8">+48h</span>
        </div>

        {/* Compact Legend Row */}
        <div className="flex flex-wrap items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] font-mono tabular-nums text-slate-400">
          <span className="hidden sm:inline text-slate-500 uppercase tracking-wider text-[9px]">Thresholds:</span>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: RISK_COLORS.LOW }} />
              <span>Low (&lt;25m)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: RISK_COLORS.MODERATE }} />
              <span>Mod (25-34)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: RISK_COLORS.HIGH }} />
              <span>High (35-44)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: RISK_COLORS.SEVERE }} />
              <span>Sev (45-54)</span>
            </div>
            <div className="flex items-center gap-1 font-semibold text-rose-300">
              <span className="w-2 h-2 rounded-xs bg-rose-600 animate-pulse" />
              <span>NoTravel (≥55)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
