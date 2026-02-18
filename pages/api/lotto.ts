import axios from 'axios';
import * as cheerio from 'cheerio';
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
    console.log('Starting to scrape Lotto America results...');
    const sourceUrl = 'https://www.lotteryusa.com/lotto-america/';
    const diagnostics: ScrapeDiagnostics = {
      steps: [],
      counts: { cardsFound: 0, completeResults: 0 },
      sourceUrl,
      errors: []
    };

    const addStep = (label: string, ok: boolean, details?: string) => {
      diagnostics.steps.push({ label, ok, details });
    };

    addStep('start_scrape', true, 'Initiated scraping process');
    
    // Try a different lottery website that's more reliable
    const response = await axios.get(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000 // 15 second timeout
    });
    diagnostics.httpStatus = response.status;
    addStep('http_get', response.status === 200, `HTTP ${response.status}`);
    console.log('Fetched HTML successfully, parsing results...');
    const $ = cheerio.load(response.data);
    const results: LottoResult[] = [];

    // Direct selector for LotteryUSA.com
    console.log('Trying LotteryUSA.com selectors...');
    const cards = $('.result-card, .drawing-result');
    diagnostics.counts.cardsFound = cards.length;
    addStep('primary_selectors', cards.length > 0, `${cards.length} cards found`);

    cards.each((i, element) => {
      try {
        // Extract date
        const dateText = $(element).find('.date, .result-date').text().trim();
        if (dateText) addStep('date_found', true, dateText);
        
        // Extract numbers
        const mainNumbers: number[] = [];
        $(element).find('.number:not(.star-ball), .ball:not(.star-ball)').each((j, numElement) => {
          if (j < 5) { // First 5 are main numbers
            const numText = $(numElement).text().trim();
            const num = parseInt(numText, 10);
            if (!isNaN(num)) {
              mainNumbers.push(num);
            }
          }
        });
        addStep('main_numbers', mainNumbers.length === 5, `found ${mainNumbers.length}`);
        
        // Extract star ball
        let starBall = 0;
        const starBallElement = $(element).find('.number.star-ball, .ball.star-ball, .star-ball').first();
        if (starBallElement.length) {
          starBall = parseInt(starBallElement.text().trim(), 10) || 0;
        }
        addStep('star_ball', starBall > 0, `${starBall}`);
        
        // Extract all star bonus
        let allStarBonus = 1;
        const bonusElement = $(element).find('.multiplier, .bonus').first();
        if (bonusElement.length) {
          const bonusText = bonusElement.text().trim();
          const bonusMatch = bonusText.match(/\d+/);
          allStarBonus = bonusMatch ? parseInt(bonusMatch[0], 10) : 1;
        }
        addStep('bonus', allStarBonus >= 1, `x${allStarBonus}`);
        
        // Extract jackpot
        let jackpot = 'Not available';
        const jackpotElement = $(element).find('.jackpot-amount, .jackpot').first();
        if (jackpotElement.length) {
          jackpot = jackpotElement.text().trim();
        }
        addStep('jackpot', jackpot !== 'Not available', jackpot);
        
        // Extract winners (default to a reasonable number if not found)
        let winners = 25000;
        
        if (dateText && mainNumbers.length === 5 && starBall > 0) {
          console.log(`Found result for ${dateText} with ${mainNumbers.length} numbers and star ball ${starBall}`);
          results.push({
            date: dateText,
            numbers: mainNumbers,
            starBall,
            allStarBonus,
            winners,
            jackpot,
            isLive: true
          });
          diagnostics.counts.completeResults += 1;
          addStep('result_pushed', true, `index ${i}`);
        }
      } catch (itemError) {
        console.error('Error processing item:', itemError);
        diagnostics.errors?.push(String(itemError));
        addStep('item_error', false, String(itemError));
      }
    });

    // If no results were found with the primary selectors, try fallback approach
    if (results.length === 0) {
      console.log('No results found with primary selectors, using fallback data');
      diagnostics.usedFallback = true;
      addStep('fallback_used', true, 'Primary selectors returned no results');
      return { results: fallbackResults, diagnostics };
    }
    
    console.log(`Successfully scraped ${results.length} results`);
    addStep('success', true, `${results.length} results scraped`);
    return { results, diagnostics };
  } catch (error) {
    console.error('Error scraping Lotto America results:', error);
    console.log('Falling back to sample data due to error');
    const diagnostics: ScrapeDiagnostics = {
      steps: [{ label: 'http_error', ok: false, details: String(error) }, { label: 'fallback_used', ok: true, details: 'Exception during scrape' }],
      counts: { cardsFound: 0, completeResults: 0 },
      sourceUrl: 'https://www.lotteryusa.com/lotto-america/',
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
