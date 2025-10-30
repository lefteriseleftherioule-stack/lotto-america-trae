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

async function scrapeLottoResults(): Promise<LottoResult[]> {
  try {
    console.log('Starting to scrape Lotto America results...');
    const response = await axios.get('https://www.lottoamerica.com/numbers/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000 // 10 second timeout
    });
    
    const $ = cheerio.load(response.data);
    const results: LottoResult[] = [];

    console.log('Fetched HTML successfully, parsing results...');
    
    // Based on the website structure, we'll try multiple selector patterns
    // First approach: Look for the main results container
    $('div[class*="results-item"], div[class*="result-item"], div[class*="draw-result"]').each((i, element) => {
      try {
        // Extract date - look for date elements with various possible classes
        let dateText = '';
        const dateElement = $(element).find('[class*="date"], [class*="draw-date"]').first();
        if (dateElement.length) {
          dateText = dateElement.text().trim();
        }
        
        // Extract numbers - look for number elements with various possible classes
        const mainNumbers: number[] = [];
        $(element).find('[class*="number"]:not([class*="star"]):not([class*="bonus"])').each((j, numElement) => {
          if (j < 5) { // First 5 are main numbers
            const numText = $(numElement).text().trim();
            const num = parseInt(numText, 10);
            if (!isNaN(num)) {
              mainNumbers.push(num);
            }
          }
        });
        
        // If we couldn't find numbers with the above selector, try a more generic approach
        if (mainNumbers.length === 0) {
          const numberContainer = $(element).find('[class*="numbers"], [class*="drawn"]').first();
          numberContainer.find('span, div').each((j, numElement) => {
            if (j < 5) { // First 5 are main numbers
              const numText = $(numElement).text().trim();
              const num = parseInt(numText, 10);
              if (!isNaN(num)) {
                mainNumbers.push(num);
              }
            }
          });
        }
        
        // Extract star ball - look for star ball with various possible classes
        let starBall = 0;
        const starBallElement = $(element).find('[class*="star-ball"], [class*="star_ball"], [class*="starball"]').first();
        if (starBallElement.length) {
          starBall = parseInt(starBallElement.text().trim(), 10) || 0;
        } else {
          // If we couldn't find the star ball with specific classes, try to get the 6th number
          const allNumbers = $(element).find('[class*="number"]');
          if (allNumbers.length >= 6) {
            starBall = parseInt($(allNumbers[5]).text().trim(), 10) || 0;
          }
        }
        
        // Extract all star bonus - look for bonus with various possible classes
        let allStarBonus = 1;
        const bonusElement = $(element).find('[class*="bonus"], [class*="multiplier"]').first();
        if (bonusElement.length) {
          const bonusText = bonusElement.text().trim();
          const bonusMatch = bonusText.match(/\d+/);
          allStarBonus = bonusMatch ? parseInt(bonusMatch[0], 10) : 1;
        }
        
        // Extract winners count - look for winners with various possible classes
        let winners = 0;
        const winnersElement = $(element).find('[class*="winner"]').first();
        if (winnersElement.length) {
          const winnersText = winnersElement.text().trim().replace(/,/g, '');
          const winnersMatch = winnersText.match(/\d+/);
          winners = winnersMatch ? parseInt(winnersMatch[0], 10) : 0;
        }
        
        // Extract jackpot - look for jackpot with various possible classes
        let jackpot = 'Not available';
        const jackpotElement = $(element).find('[class*="jackpot"]').first();
        if (jackpotElement.length) {
          jackpot = jackpotElement.text().trim();
        }
        
        if (dateText && mainNumbers.length > 0) {
            console.log(`Found result for ${dateText} with ${mainNumbers.length} numbers`);
            results.push({
              date: dateText,
              numbers: mainNumbers,
              starBall,
              allStarBonus,
              winners,
              jackpot,
              isLive: true
            });
          }
      } catch (itemError) {
        console.error('Error processing item:', itemError);
      }
    });
    
    // If no results were found with the first approach, try a table-based approach
    if (results.length === 0) {
      console.log('No results found with primary selectors, trying table-based approach');
      
      $('table tr').each((i, element) => {
        if (i === 0) return; // Skip header row
        
        try {
          const cells = $(element).find('td');
          if (cells.length >= 7) {
            const dateText = $(cells[0]).text().trim();
            
            // Extract numbers from cells
            const mainNumbers: number[] = [];
            let numberCells = [];
            
            // Try to find cells that contain numbers
            for (let j = 0; j < cells.length; j++) {
              const cellText = $(cells[j]).text().trim();
              if (/^\d+$/.test(cellText)) {
                numberCells.push(cells[j]);
              }
            }
            
            // If we found enough number cells, extract the main numbers and star ball
            if (numberCells.length >= 6) {
              for (let j = 0; j < 5; j++) {
                const numText = $(numberCells[j]).text().trim();
                const num = parseInt(numText, 10);
                if (!isNaN(num)) {
                  mainNumbers.push(num);
                }
              }
              
              // Extract star ball (6th number)
              const starBallText = $(numberCells[5]).text().trim();
              const starBall = parseInt(starBallText, 10) || 0;
              
              // Extract bonus if available (7th number)
              const allStarBonus = numberCells.length > 6 ? parseInt($(numberCells[6]).text().trim(), 10) || 1 : 1;
              
              if (dateText && mainNumbers.length > 0) {
                console.log(`Found table result for ${dateText}`);
                results.push({
                  date: dateText,
                  numbers: mainNumbers,
                  starBall,
                  allStarBonus,
                  winners: 0, // Default value as we can't extract this reliably
                  jackpot: 'Not available', // Default value as we can't extract this reliably
                  isLive: true
                });
              }
            }
          }
        } catch (itemError) {
          console.error('Error processing table row:', itemError);
        }
      });
    }
    
    console.log(`Scraped ${results.length} lottery results`);
    
    // If we still have no results, return fallback data
    if (results.length === 0) {
      console.error('Failed to scrape any results using all approaches, using fallback data');
      return fallbackResults;
    }
    
    return results;
  } catch (error) {
    console.error('Error scraping Lotto America results:', error);
    return fallbackResults;
  }
}

// Add a cache mechanism to avoid hitting the website too frequently
let cachedResults: LottoResult[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const currentTime = Date.now();
      
      // Use cached results if they exist and are still fresh
      if (cachedResults.length > 0 && currentTime - lastFetchTime < CACHE_DURATION) {
        console.log('Using cached lottery results');
        res.status(200).json(cachedResults);
        return;
      }
      
      // Otherwise fetch fresh results
      console.log('Fetching fresh lottery results');
      const results = await scrapeLottoResults();
      
      // Update cache
      if (results.length > 0) {
        cachedResults = results;
        lastFetchTime = currentTime;
      }
      
      // Always return something - either scraped results or fallback data
      res.status(200).json(results.length > 0 ? results : fallbackResults);
    } catch (error) {
      console.error('API error:', error);
      
      // Always return data, even if there's an error
      res.status(200).json(fallbackResults);
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
