import { AnalyzeRequest, AnalyzeResponse, PresetsResponse } from '../types/routing';

const defaultBase = import.meta.env.DEV
  ? 'http://localhost:8000/api'
  : 'https://weather-aware-truck-routing-k0ra.onrender.com/api';

const rawBase = import.meta.env.VITE_API_BASE_URL || defaultBase;
const cleanBase = rawBase.replace(/\/+$/, '');
const API_BASE_URL = cleanBase.endsWith('/api') ? cleanBase : `${cleanBase}/api`;

const FALLBACK_PRESETS: PresetsResponse = {
  presets: [
    {
      id: 'chicago_denver',
      title: 'Chicago, IL → Denver, CO',
      origin: 'Chicago, IL',
      destination: 'Denver, CO',
      default_load_weight_lbs: 42000,
      default_interval_miles: 25,
      description: 'Crosses the Midwest and Great Plains via I-80 / I-70 with high crosswinds and sudden winter squalls.',
      highlights: ['I-80 Nebraska Plains', 'I-76 / I-70 Approaches', 'Frequent Crosswind Blowovers'],
    },
    {
      id: 'slc_cheyenne',
      title: 'Salt Lake City, UT → Cheyenne, WY',
      origin: 'Salt Lake City, UT',
      destination: 'Cheyenne, WY',
      default_load_weight_lbs: 36000,
      default_interval_miles: 25,
      description: 'The notorious Wyoming I-80 corridor (Elk Mountain, Arlington, Sherman Summit) infamous for 55+ mph rollover winds.',
      highlights: ['Elk Mountain Pass', 'High Plains Gap Winds', 'Extreme Rollover Danger'],
    },
    {
      id: 'dallas_atlanta',
      title: 'Dallas, TX → Atlanta, GA',
      origin: 'Dallas, TX',
      destination: 'Atlanta, GA',
      default_load_weight_lbs: 44000,
      default_interval_miles: 25,
      description: 'Heavy commercial freight lane across the Deep South via I-20 with intense rain bands and severe thunderstorms.',
      highlights: ['I-20 Louisiana / Mississippi', 'Severe Rain Hydroplaning', 'High Traffic Density'],
    },
    {
      id: 'seattle_minneapolis',
      title: 'Seattle, WA → Minneapolis, MN',
      origin: 'Seattle, WA',
      destination: 'Minneapolis, MN',
      default_load_weight_lbs: 32000,
      default_interval_miles: 50,
      description: 'Northern transcontinental route traversing Snoqualmie Pass, Montana Rockies, and North Dakota winter freezes.',
      highlights: ['Cascade Mountain Passes', 'Northern Plains Freezes', 'Long-Haul Mountain Driving'],
    },
  ],
  sample_intervals_available: [10, 25, 50],
  weather_modes_available: ['live', 'simulated_storm'],
};

/**
 * Fetch predefined freight corridor presets with fallback for cold starts.
 */
export async function getRoutePresets(): Promise<PresetsResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/routes/presets/`);
    if (!response.ok) {
      return FALLBACK_PRESETS;
    }
    return await response.json();
  } catch {
    return FALLBACK_PRESETS;
  }
}

/**
 * Perform full 3-route weather & risk analysis with automatic cold-start retry.
 */
export async function analyzeRoutes(params: AnalyzeRequest): Promise<AnalyzeResponse> {
  const url = `${API_BASE_URL}/routes/analyze/`;
  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(params),
  };

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch {
    // If first request failed (e.g. Render server cold-starting), retry once after a brief pause
    await new Promise((r) => setTimeout(r, 2500));
    try {
      response = await fetch(url, fetchOptions);
    } catch {
      throw new Error(
        'Backend server is waking up on Render free tier (takes ~45s on first load). Please wait a moment and click "Calculate Dispatch" again.'
      );
    }
  }

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
