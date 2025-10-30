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
}

async function scrapeLottoResults(): Promise<LottoResult[]> {
  try {
    const response = await axios.get('https://www.lottoamerica.com/numbers/');
    const $ = cheerio.load(response.data);
    const results: LottoResult[] = [];

    // Select each result container
    $('div.result-card').each((i, element) => {
      // Extract date
      const dateText = $(element).find('div.result-date').text().trim();
      
      // Extract numbers
      const mainNumbers: number[] = [];
      $(element).find('div.result-number').each((j, numElement) => {
        if (j < 5) { // First 5 are main numbers
          mainNumbers.push(parseInt($(numElement).text().trim(), 10));
        }
      });
      
      // Extract star ball (6th number)
      const starBall = parseInt($(element).find('div.result-number').eq(5).text().trim(), 10);
      
      // Extract all star bonus (7th number)
      const allStarBonus = parseInt($(element).find('div.result-number').eq(6).text().trim(), 10);
      
      // Extract winners count
      const winnersText = $(element).find('div.result-winners span').text().trim().replace(/,/g, '');
      const winners = parseInt(winnersText, 10);
      
      // Extract jackpot
      const jackpotText = $(element).find('div.result-jackpot').text().trim();
      
      results.push({
        date: dateText,
        numbers: mainNumbers,
        starBall,
        allStarBonus,
        winners,
        jackpot: jackpotText
      });
    });

    return results;
  } catch (error) {
    console.error('Error scraping Lotto America results:', error);
    return [];
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const results = await scrapeLottoResults();
      res.status(200).json(results);
    } catch (error) {
      console.error('API error:', error);
      res.status(500).json({ error: 'Failed to fetch lottery results' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}