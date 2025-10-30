import { useEffect, useState } from 'react';
import Head from 'next/head';

interface LottoResult {
  date: string;
  numbers: number[];
  starBall: number;
  allStarBonus: number;
  winners: number;
  jackpot: string;
  isLive?: boolean;
}

export default function Home() {
  const [results, setResults] = useState<LottoResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResults() {
      try {
        const response = await fetch('/api/lotto');
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        setResults(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch lottery results. Please try again later.');
        setLoading(false);
        console.error('Error fetching results:', err);
      }
    }

    fetchResults();
  }, []);

  return (
    <div className="container">
      <Head>
        <title>Lotto America Results</title>
        <meta name="description" content="Latest Lotto America drawing results" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="stylesheet" href="/style.css" />
      </Head>

      <header>
        <img src="/logo.svg" alt="Lotto America Logo" />
        <h1>Lotto America Results</h1>
      </header>

      {loading && <div className="loading">Loading results...</div>}
      
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <div className="results-container">
          {results.map((result, index) => (
            <div key={index} className="result-card">
              <div className="result-date">{result.date}</div>
              <div className="numbers-container">
                {result.numbers.map((number, i) => (
                  <div key={i} className="number">{number}</div>
                ))}
                <div className="number star-ball">{result.starBall}</div>
              </div>
              <div className="result-details">
                <p><strong>All Star Bonus:</strong> {result.allStarBonus}x</p>
                <p><strong>Winners:</strong> {result.winners.toLocaleString()}</p>
                <p><strong>Jackpot:</strong> {result.jackpot}</p>
                <p className={result.isLive ? "data-source live" : "data-source fallback"}>
                  {result.isLive ? "Live Data" : "Sample Data"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
