import axios from 'axios';
import { NextApiRequest, NextApiResponse } from 'next';

interface LottoResult {
  date: string;
  numbers: number[];
  starBall: number;
  allStarBonus: number;
  winners: number;
  jackpot: string;
  isLive?: boolean; // Flag to indicate if this is live scraped data or fallback
}

// Diagnostics types for debug checklist
interface DiagnosticStep {
  label: string;
  ok: boolean;
  details?: string;
}

interface ScrapeDiagnostics {
  steps: DiagnosticStep[];
  counts: {
    cardsFound: number;
    completeResults: number;
  };
  sourceUrl: string;
  httpStatus?: number;
  usedFallback?: boolean;
  errors?: string[];
}

// Fallback data in case scraping fails
const fallbackResults: LottoResult[] = [
  {
    date: "Wednesday, October 29, 2025",
    numbers: [21, 33, 40, 42, 50],
    starBall: 5,
    allStarBonus: 2,
    winners: 35560,
    jackpot: "$5,680,000",
    isLive: false
  },
  {
    date: "Monday, October 27, 2025",
    numbers: [12, 21, 27, 35, 39],
    starBall: 2,
    allStarBonus: 4,
    winners: 29269,
    jackpot: "$5,530,000",
    isLive: false
  },
  {
    date: "Saturday, October 25, 2025",
    numbers: [2, 31, 33, 35, 50],
    starBall: 7,
    allStarBonus: 2,
    winners: 48122,
    jackpot: "$5,400,000",
    isLive: false
  }
];

async function scrapeLottoResultsWithDiagnostics(): Promise<{ results: LottoResult[]; diagnostics: ScrapeDiagnostics }> {
  try {
    console.log('Starting to fetch lottery results from open data API...');
    const sourceUrl =
      process.env.LOTTERY_API_URL ||
      'https://data.ny.gov/resource/d6yy-54nr.json?$order=draw_date%20DESC&$limit=10';
    const diagnostics: ScrapeDiagnostics = {
      steps: [],
      counts: { cardsFound: 0, completeResults: 0 },
      sourceUrl,
      errors: []
    };

    const addStep = (label: string, ok: boolean, details?: string) => {
      diagnostics.steps.push({ label, ok, details });
    };

    addStep('start_fetch', true, 'Initiated API fetch');

    const response = await axios.get(sourceUrl, {
      timeout: 15000
    });
    diagnostics.httpStatus = response.status;
    addStep('http_get', response.status === 200, `HTTP ${response.status}`);
    console.log('Fetched JSON successfully, parsing results...');

    const items: any[] = Array.isArray(response.data) ? response.data : [];
    diagnostics.counts.cardsFound = items.length;
    addStep('records_found', items.length > 0, `${items.length} records found`);

    if (items.length === 0) {
      diagnostics.usedFallback = true;
      addStep('fallback_used', true, 'API returned no records');
      return { results: fallbackResults, diagnostics };
    }

    items.sort((a, b) => {
      const da = a.draw_date ? new Date(a.draw_date).getTime() : 0;
      const db = b.draw_date ? new Date(b.draw_date).getTime() : 0;
      return db - da;
    });

    const results: LottoResult[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};

      const rawDate: string = item.draw_date || '';
      const dateObj = rawDate ? new Date(rawDate) : null;
      const date =
        dateObj && !isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
          : rawDate || 'Unknown date';
      addStep('date_parsed', !!rawDate, rawDate || 'missing');

      const numbersText: string = item.winning_numbers || '';
      const parts = numbersText.split(' ').filter(Boolean);
      const mainNumbers: number[] = [];
      let starBall = 0;

      if (parts.length >= 6) {
        for (let j = 0; j < 5; j++) {
          const n = parseInt(parts[j], 10);
          if (!isNaN(n)) {
            mainNumbers.push(n);
          }
        }
        const star = parseInt(parts[5], 10);
        if (!isNaN(star)) {
          starBall = star;
        }
      }

      addStep('numbers_parsed', mainNumbers.length === 5 && starBall > 0, numbersText);

      const multiplierRaw: string = item.multiplier || '';
      const allStarBonus = multiplierRaw ? parseInt(multiplierRaw, 10) || 1 : 1;
      addStep('multiplier_parsed', allStarBonus >= 1, multiplierRaw || '1');

      const jackpot = 'Not available';
      const winners = 0;

      if (date && mainNumbers.length === 5 && starBall > 0) {
        results.push({
          date,
          numbers: mainNumbers,
          starBall,
          allStarBonus,
          winners,
          jackpot,
          isLive: true
        });
        diagnostics.counts.completeResults += 1;
        addStep('result_pushed', true, `index ${i}`);
      } else {
        addStep('result_skipped', false, `index ${i}`);
      }
    }

    if (results.length === 0) {
      diagnostics.usedFallback = true;
      addStep('fallback_used', true, 'Parsed 0 complete results from API');
      return { results: fallbackResults, diagnostics };
    }

    console.log(`Successfully parsed ${results.length} results from API`);
    addStep('success', true, `${results.length} results parsed`);
    return { results, diagnostics };
  } catch (error) {
    console.error('Error fetching lottery results from API:', error);
    console.log('Falling back to sample data due to error');
    const diagnostics: ScrapeDiagnostics = {
      steps: [{ label: 'http_error', ok: false, details: String(error) }, { label: 'fallback_used', ok: true, details: 'Exception during scrape' }],
      counts: { cardsFound: 0, completeResults: 0 },
      sourceUrl:
        process.env.LOTTERY_API_URL ||
        'https://data.ny.gov/resource/d6yy-54nr.json?$order=draw_date%20DESC&$limit=10',
      usedFallback: true,
      errors: [String(error)]
    };
    return { results: fallbackResults, diagnostics };
  }
}

// Backward-compatible wrapper returning only results
async function scrapeLottoResults(): Promise<LottoResult[]> {
  const { results } = await scrapeLottoResultsWithDiagnostics();
  return results;
}

// Add a cache mechanism to avoid hitting the website too frequently
let cachedResults: LottoResult[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method === 'GET') {
    try {
      console.log('API endpoint called, processing request...');
      
      const currentTime = Date.now();
      const debugMode = String(req.query.debug).toLowerCase() === '1' || String(req.query.debug).toLowerCase() === 'true';
      
      // Use cached results if they exist and are still fresh
      if (cachedResults.length > 0 && currentTime - lastFetchTime < CACHE_DURATION) {
        console.log('Using cached lottery results');
        if (debugMode) {
          const ageMs = currentTime - lastFetchTime;
          const diagnostics: ScrapeDiagnostics = {
            steps: [
              { label: 'cache_used', ok: true, details: `age ${ageMs}ms` }
            ],
            counts: { cardsFound: 0, completeResults: cachedResults.length },
            sourceUrl: 'cache',
            usedFallback: cachedResults[0]?.isLive === false
          };
          res.status(200).json({ results: cachedResults, diagnostics, cache: { used: true, ageMs, lastFetchTime } });
        } else {
          res.status(200).json(cachedResults);
        }
        return;
      }
      
      // Otherwise fetch fresh results
      console.log('Fetching fresh lottery results');
      const { results, diagnostics } = await scrapeLottoResultsWithDiagnostics();
      
      // Update cache
      if (results.length > 0) {
        cachedResults = results;
        lastFetchTime = currentTime;
      }
      
      // Always return something - either scraped results or fallback data
      const responseData = results.length > 0 ? results : fallbackResults;
      console.log(`Returning ${responseData.length} results, isLive: ${responseData[0]?.isLive}`);
      if (debugMode) {
        res.status(200).json({ results: responseData, diagnostics, cache: { used: false, ageMs: 0, lastFetchTime } });
      } else {
        res.status(200).json(responseData);
      }
    } catch (error) {
      console.error('API error:', error);
      
      // Always return data, even if there's an error
      console.log('Error occurred, returning fallback data');
      const diagnostics: ScrapeDiagnostics = {
        steps: [
          { label: 'api_error', ok: false, details: String(error) },
          { label: 'fallback_used', ok: true, details: 'Handler error' }
        ],
        counts: { cardsFound: 0, completeResults: 0 },
        sourceUrl: 'handler',
        usedFallback: true,
        errors: [String(error)]
      };
      const debugMode = String(req.query.debug).toLowerCase() === '1' || String(req.query.debug).toLowerCase() === 'true';
      if (debugMode) {
        res.status(200).json({ results: fallbackResults, diagnostics, cache: { used: false, ageMs: 0, lastFetchTime } });
      } else {
        res.status(200).json(fallbackResults);
      }
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
