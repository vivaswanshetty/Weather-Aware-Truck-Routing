import { RiskLevelName } from '../types/routing';

export const RISK_COLORS: Record<RiskLevelName, string> = {
  LOW: '#10b981',       // Emerald
  MODERATE: '#f59e0b',  // Amber
  HIGH: '#f97316',      // Orange
  SEVERE: '#ef4444',    // Red
  NO_TRAVEL: '#e11d48', // Crimson/Magenta high-visibility
};

export const RISK_LABELS: Record<RiskLevelName, string> = {
  LOW: 'Low Risk',
  MODERATE: 'Moderate Risk',
  HIGH: 'High Risk',
  SEVERE: 'Severe Risk',
  NO_TRAVEL: 'No Travel Advised',
};

export function normalizeRisk(risk: RiskLevelName | number | string): RiskLevelName {
  if (typeof risk === 'number') {
    switch (risk) {
      case 5: return 'NO_TRAVEL';
      case 4: return 'SEVERE';
      case 3: return 'HIGH';
      case 2: return 'MODERATE';
      default: return 'LOW';
    }
  }
  const str = String(risk).toUpperCase();
  if (str in RISK_COLORS) {
    return str as RiskLevelName;
  }
  return 'LOW';
}

export function getRiskHex(risk: RiskLevelName | number | string): string {
  const norm = normalizeRisk(risk);
  return RISK_COLORS[norm] || '#10b981';
}

export function getRiskLabel(risk: RiskLevelName | number | string): string {
  const norm = normalizeRisk(risk);
  return RISK_LABELS[norm] || 'Low Risk';
}

export function getRiskBadgeClass(risk: RiskLevelName | number | string): string {
  const norm = normalizeRisk(risk);
  switch (norm) {
    case 'NO_TRAVEL':
      return 'bg-rose-950/80 text-rose-300 border border-rose-500/80 font-bold animate-pulse shadow-sm shadow-rose-900/50';
    case 'SEVERE':
      return 'bg-red-950/80 text-red-300 border border-red-500/80 font-semibold';
    case 'HIGH':
      return 'bg-orange-950/80 text-orange-300 border border-orange-500/70 font-medium';
    case 'MODERATE':
      return 'bg-amber-950/80 text-amber-300 border border-amber-500/70 font-medium';
    case 'LOW':
    default:
      return 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 font-medium';
  }
}

export function formatHoursElapsed(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `+${m}m`;
  return `+${h}h ${m > 0 ? `${m}m` : ''}`.trim();
}

export function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}
