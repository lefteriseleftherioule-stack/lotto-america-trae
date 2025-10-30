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

export default function Home({ initialResults, generatedAt }: { initialResults: LottoResult[]; generatedAt: string }) {
  const [results, setResults] = useState<LottoResult[]>(initialResults || []);
  const [loading, setLoading] = useState<boolean>(initialResults?.length ? false : true);
  const [error, setError] = useState<string | null>(null);

  // Optional client refresh only if initial props were empty
  useEffect(() => {
    if (initialResults && initialResults.length > 0) return;
    
    async function fetchResults() {
      try {
        console.log('Fetching lottery results from API (client refresh)...');
        const apiUrl = `${window.location.origin}/api/lotto`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        if (!data || !Array.isArray(data) || data.length === 0) {
          setError('No lottery results available. Please try again later.');
          setLoading(false);
          return;
        }
        setResults(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching results:', err);
        setError('Failed to fetch lottery results. Please try again later.');
        setLoading(false);
      }
    }

    fetchResults();
  }, [initialResults]);

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
      <p style={{ fontSize: '12px', color: '#666' }}>Generated at: {new Date(generatedAt).toLocaleString()}</p>

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

export async function getStaticProps() {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/lotto`);
    const data = await res.json();
    return {
      props: {
        initialResults: Array.isArray(data) ? data : [],
        generatedAt: new Date().toISOString()
      },
      revalidate: 600 // Rebuild page every 10 minutes automatically
    };
  } catch (e) {
    return {
      props: {
        initialResults: [],
        generatedAt: new Date().toISOString()
      },
      revalidate: 600
    };
  }
}
