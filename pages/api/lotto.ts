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
  debugInfo?: string;
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

let lastDiagnostics: ScrapeDiagnostics | null = null;

function parseIowaLottoAmericaHtml(
  html: string,
  addStep: (label: string, ok: boolean, details?: string) => void
): LottoResult | null {
  const text = String(html).replace(/\s+/g, ' ');
  addStep('html_length', true, String(text.length));
  addStep('html_sample', true, text.slice(0, 300));

  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  let date = 'Latest Lotto America draw';
  if (dateMatch && dateMatch[1]) {
    const [mm, dd, yyyy] = dateMatch[1].split('/');
    const year = parseInt(yyyy, 10);
    const month = parseInt(mm, 10);
    const day = parseInt(dd, 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) {
        date = d.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    }
  }
  addStep('date_parsed', !!dateMatch, dateMatch ? dateMatch[1] : 'no mm/dd/yyyy found');

  const numbersMatch = text.match(
    /(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/
  );
  if (!numbersMatch) {
    addStep('numbers_parsed', false, 'no 6-number pattern found');
    return null;
  }

  const allNums = numbersMatch
    .slice(1)
    .map((v) => parseInt(v, 10))
    .filter((n) => !isNaN(n));
  if (allNums.length !== 6) {
    addStep('numbers_parsed', false, 'parsed numbers length != 6');
    return null;
  }

  const mainNumbers = allNums.slice(0, 5);
  const starBall = allNums[5];
  const mainOk = mainNumbers.every((n) => n >= 1 && n <= 52);
  const starOk = starBall >= 1 && starBall <= 10;
  if (!mainOk || !starOk) {
    addStep('numbers_parsed', false, `invalid ranges: main ${mainNumbers.join(',')} star ${starBall}`);
    return null;
  }
  addStep('numbers_parsed', true, `${mainNumbers.join(' ')} | ${starBall}`);

  let allStarBonus = 1;
  const bonusMatch = text.match(/All\s*Star\s*Bonus[^0-9]*([0-9]+)/i);
  if (bonusMatch && bonusMatch[1]) {
    const m = parseInt(bonusMatch[1], 10);
    if (!isNaN(m) && m >= 1) {
      allStarBonus = m;
    }
  }
  addStep('multiplier_parsed', true, String(allStarBonus));

  return {
    date,
    numbers: mainNumbers,
    starBall,
    allStarBonus,
    winners: 0,
    jackpot: 'Not available',
    isLive: true
  };
}

async function scrapeLottoResultsWithDiagnostics(): Promise<{ results: LottoResult[]; diagnostics: ScrapeDiagnostics }> {
  try {
    console.log('Starting to fetch Lotto America results from Iowa Lottery page...');
    const sourceUrl = 'https://ialottery.com/Pages/Games-Online/LottoAmericaWin.aspx';
    const diagnostics: ScrapeDiagnostics = {
      steps: [],
      counts: { cardsFound: 0, completeResults: 0 },
      sourceUrl,
      errors: []
    };

    const addStep = (label: string, ok: boolean, details?: string) => {
      diagnostics.steps.push({ label, ok, details });
    };

    const response = await axios.get(sourceUrl, {
      timeout: 15000
    });
    diagnostics.httpStatus = response.status;
    addStep('http_get', response.status === 200, `HTTP ${response.status}`);
    console.log('Fetched HTML successfully, parsing results...');

    const result = parseIowaLottoAmericaHtml(String(response.data), addStep);
    if (!result) {
      diagnostics.usedFallback = true;
      addStep('fallback_used', true, 'Parsed 0 complete results from Iowa Lottery page');
      lastDiagnostics = diagnostics;
      const enrichedFallback = fallbackResults.map((r, idx) =>
        idx === 0 ? { ...r, debugInfo: JSON.stringify(diagnostics) } : r
      );
      return { results: enrichedFallback, diagnostics };
    }

    diagnostics.counts.cardsFound = 1;
    diagnostics.counts.completeResults = 1;
    addStep('success', true, '1 result parsed');
    lastDiagnostics = diagnostics;
    return { results: [result], diagnostics };
  } catch (error) {
    console.error('Error fetching lottery results from Iowa Lottery page:', error);
    console.log('Falling back to sample data due to error');
    const diagnostics: ScrapeDiagnostics = {
      steps: [{ label: 'http_error', ok: false, details: String(error) }, { label: 'fallback_used', ok: true, details: 'Exception during scrape' }],
      counts: { cardsFound: 0, completeResults: 0 },
      sourceUrl: 'https://ialottery.com/Pages/Games-Online/LottoAmericaWin.aspx',
      usedFallback: true,
      errors: [String(error)]
    };
    lastDiagnostics = diagnostics;
    const enrichedFallback = fallbackResults.map((r, idx) =>
      idx === 0 ? { ...r, debugInfo: JSON.stringify(diagnostics) } : r
    );
    return { results: enrichedFallback, diagnostics };
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
          let diagnostics: ScrapeDiagnostics;
          if (lastDiagnostics) {
            diagnostics = {
              ...lastDiagnostics,
              steps: [
                ...(lastDiagnostics.steps || []),
                { label: 'cache_used', ok: true, details: `age ${ageMs}ms` }
              ]
            };
          } else {
            diagnostics = {
              steps: [
                { label: 'cache_used', ok: true, details: `age ${ageMs}ms` }
              ],
              counts: { cardsFound: cachedResults.length, completeResults: cachedResults.length },
              sourceUrl: 'cache',
              usedFallback: cachedResults[0]?.isLive === false
            };
          }
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
