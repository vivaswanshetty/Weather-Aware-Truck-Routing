import { AnalyzeRequest, AnalyzeResponse, PresetsResponse } from '../types/routing';

const defaultBase = import.meta.env.DEV
  ? 'http://localhost:8000/api'
  : 'https://spotter-routing-backend.onrender.com/api';

const rawBase = import.meta.env.VITE_API_BASE_URL || defaultBase;
const cleanBase = rawBase.replace(/\/+$/, '');
const API_BASE_URL = cleanBase.endsWith('/api') ? cleanBase : `${cleanBase}/api`;

/**
 * Fetch predefined freight corridor presets.
 */
export async function getRoutePresets(): Promise<PresetsResponse> {
  const response = await fetch(`${API_BASE_URL}/routes/presets/`);
  if (!response.ok) {
    throw new Error(`Failed to load presets (HTTP ${response.status})`);
  }
  return response.json();
}

/**
 * Perform full 3-route weather & risk analysis.
 */
export async function analyzeRoutes(params: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE_URL}/routes/analyze/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let errMessage = `Server returned HTTP ${response.status}`;
    try {
      const errData = await response.json();
      if (errData.error) {
        errMessage = errData.error;
      }
    } catch {
      // Use fallback error message
    }
    throw new Error(errMessage);
  }

  return response.json();
}
