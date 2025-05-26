import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

// Rate limiting implementation
const RATE_LIMIT = {
  perMinute: 20,
  perDay: 500
};

let requestCount = {
  minute: 0,
  day: 0,
  lastMinuteReset: Date.now(),
  lastDayReset: Date.now()
};

function checkRateLimit() {
  const now = Date.now();
  if (now - requestCount.lastMinuteReset > 60000) {
    requestCount.minute = 0;
    requestCount.lastMinuteReset = now;
  }
  if (now - requestCount.lastDayReset > 86400000) {
    requestCount.day = 0;
    requestCount.lastDayReset = now;
  }
  if (requestCount.minute >= RATE_LIMIT.perMinute || requestCount.day >= RATE_LIMIT.perDay) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  requestCount.minute++;
  requestCount.day++;
}

// Common browser-like headers to avoid API blocking
const getHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Referer': 'https://finance.yahoo.com/'
});

// Retry logic for API requests
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let retries = 0;
  let lastError: Error | null = null;
  while (retries < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const waitTime = Math.pow(2, retries) * 1000;
        console.error(`Rate limited, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retries++;
        continue;
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const waitTime = Math.pow(2, retries) * 1000;
      console.error(`Fetch error, retrying in ${waitTime}ms... (${lastError.message})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      retries++;
    }
  }
  throw lastError || new Error("Maximum retries exceeded");
}

const handler = createMcpHandler(
  (server) => {
    // Stock Quote Tool
    server.tool(
      "yahoo_stock_quote",
      "Get current stock quote information from Yahoo Finance",
      {
        symbol: z.string().describe("Stock ticker symbol (e.g., AAPL, MSFT, TSLA)")
      },
      async ({ symbol }) => {
        checkRateLimit();
        try {
          const now = Math.floor(Date.now() / 1000);
          const oneMinuteAgo = now - 60;
          const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${oneMinuteAgo}&period2=${now}&interval=1d&events=history`;
          
          const response = await fetchWithRetry(chartUrl, {
            method: 'GET',
            headers: getHeaders()
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          const result = data.chart?.result?.[0];
          
          if (!result) {
            return {
              content: [{ type: "text", text: `No data found for symbol: ${symbol}` }]
            };
          }

          const quoteData = {
            symbol: result.meta.symbol,
            shortName: result.meta.shortName || result.meta.longName || symbol,
            regularMarketPrice: result.meta.regularMarketPrice,
            regularMarketChange: result.meta.regularMarketPrice - result.meta.chartPreviousClose,
            regularMarketChangePercent: (result.meta.regularMarketPrice - result.meta.chartPreviousClose) / result.meta.chartPreviousClose,
            regularMarketPreviousClose: result.meta.chartPreviousClose,
            regularMarketOpen: result.indicators?.quote?.[0]?.open?.[0],
            regularMarketDayLow: result.meta.regularMarketDayLow || result.indicators?.quote?.[0]?.low?.[0],
            regularMarketDayHigh: result.meta.regularMarketDayHigh || result.indicators?.quote?.[0]?.high?.[0],
            fiftyTwoWeekLow: result.meta.fiftyTwoWeekLow,
            fiftyTwoWeekHigh: result.meta.fiftyTwoWeekHigh,
            regularMarketVolume: result.meta.regularMarketVolume
          };

          return {
            content: [{ type: "text", text: JSON.stringify(quoteData, null, 2) }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      }
    );

    // Market Data Tool
    server.tool(
      "yahoo_market_data",
      "Get current market data from Yahoo Finance",
      {
        indices: z.array(z.string()).default(["^GSPC", "^DJI", "^IXIC"])
          .describe("List of index symbols to fetch (e.g., ^GSPC for S&P 500, ^DJI for Dow Jones)")
      },
      async ({ indices }) => {
        checkRateLimit();
        try {
          const results = await Promise.all(
            indices.map(async (index) => {
              const now = Math.floor(Date.now() / 1000);
              const oneMinuteAgo = now - 60;
              const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(index)}?period1=${oneMinuteAgo}&period2=${now}&interval=1d&events=history`;
              
              const response = await fetchWithRetry(url, {
                method: 'GET',
                headers: getHeaders()
              });

              if (!response.ok) {
                throw new Error(`API error for ${index}: ${response.status} ${response.statusText}`);
              }

              const data = await response.json();
              const result = data.chart?.result?.[0];
              
              if (!result) {
                return `No data found for index: ${index}`;
              }

              return `${result.meta.shortName || index}: $${result.meta.regularMarketPrice?.toFixed(2) || 'N/A'} (${((result.meta.regularMarketPrice - result.meta.chartPreviousClose) / result.meta.chartPreviousClose * 100).toFixed(2)}%)`;
            })
          );

          return {
            content: [{ type: "text", text: results.join('\n') }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      }
    );

    // Stock History Tool
    server.tool(
      "yahoo_stock_history",
      "Get historical stock data from Yahoo Finance",
      {
        symbol: z.string().describe("Stock ticker symbol (e.g., AAPL, MSFT, TSLA)"),
        period: z.string().default("1mo")
          .describe("Time period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)"),
        interval: z.string().default("1d")
          .describe("Data interval (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo)")
      },
      async ({ symbol, period, interval }) => {
        checkRateLimit();
        try {
          const validPeriods = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'];
          const validIntervals = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'];

          if (!validPeriods.includes(period)) {
            throw new Error(`Invalid period: ${period}. Valid periods are: ${validPeriods.join(', ')}`);
          }
          if (!validIntervals.includes(interval)) {
            throw new Error(`Invalid interval: ${interval}. Valid intervals are: ${validIntervals.join(', ')}`);
          }

          let period1, period2;
          period2 = Math.floor(Date.now() / 1000);

          switch(period) {
            case '1d': period1 = period2 - 86400; break;
            case '5d': period1 = period2 - 5 * 86400; break;
            case '1mo': period1 = period2 - 30 * 86400; break;
            case '3mo': period1 = period2 - 90 * 86400; break;
            case '6mo': period1 = period2 - 180 * 86400; break;
            case '1y': period1 = period2 - 365 * 86400; break;
            case '2y': period1 = period2 - 2 * 365 * 86400; break;
            case '5y': period1 = period2 - 5 * 365 * 86400; break;
            case '10y': period1 = period2 - 10 * 365 * 86400; break;
            case 'ytd': {
              const now = new Date();
              const startOfYear = new Date(now.getFullYear(), 0, 1);
              period1 = Math.floor(startOfYear.getTime() / 1000);
              break;
            }
            case 'max': period1 = 0; break;
            default: period1 = period2 - 30 * 86400;
          }

          const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${interval}&events=history`;
          
          const response = await fetchWithRetry(url, {
            method: 'GET',
            headers: getHeaders()
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          const result = data.chart?.result?.[0];
          
          if (!result) {
            return {
              content: [{ type: "text", text: `No historical data found for symbol: ${symbol}` }]
            };
          }

          const meta = result.meta || {};
          const timestamps = result.timestamp || [];
          const quotes = result.indicators?.quote?.[0] || {};
          const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];

          let output = `Historical data for ${symbol} (${period}, ${interval} intervals)\n`;
          output += `Currency: ${meta.currency || 'USD'}\n`;
          
          if (meta.firstTradeDate && meta.regularMarketTime) {
            output += `Trading Period: ${new Date(meta.firstTradeDate * 1000).toLocaleDateString()} to ${new Date(meta.regularMarketTime * 1000).toLocaleDateString()}\n\n`;
          }

          output += "Date | Open | High | Low | Close | Volume\n";
          output += "-----------|----------|----------|----------|----------|------------\n";

          const maxPoints = 10;
          const step = Math.max(1, Math.floor(timestamps.length / maxPoints));

          for (let i = 0; i < timestamps.length; i += step) {
            const date = new Date(timestamps[i] * 1000).toLocaleDateString();
            const open = quotes.open?.[i]?.toFixed(2) || 'N/A';
            const high = quotes.high?.[i]?.toFixed(2) || 'N/A';
            const low = quotes.low?.[i]?.toFixed(2) || 'N/A';
            const close = quotes.close?.[i]?.toFixed(2) || 'N/A';
            const volume = quotes.volume?.[i]?.toLocaleString() || 'N/A';
            output += `${date.padEnd(11)} | $${open.padEnd(8)} | $${high.padEnd(8)} | $${low.padEnd(8)} | $${close.padEnd(8)} | ${volume}\n`;
          }

          if (timestamps.length > 0) {
            const firstIndex = 0;
            const lastIndex = timestamps.length - 1;
            const firstClose = quotes.close?.[firstIndex];
            const lastClose = quotes.close?.[lastIndex];
            
            if (firstClose !== undefined && lastClose !== undefined) {
              const change = lastClose - firstClose;
              const percentChange = (change / firstClose) * 100;
              output += `\nPrice Change: $${change.toFixed(2)} (${percentChange.toFixed(2)}%)`;
            }
          }

          return {
            content: [{ type: "text", text: output }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      }
    );
  },
  {
    capabilities: {
      tools: {
        yahoo_stock_quote: {
          description: "Get current stock quote information from Yahoo Finance. Returns detailed information about a stock including current price, day range, 52-week range, market cap, volume, P/E ratio, etc."
        },
        yahoo_market_data: {
          description: "Get current market data from Yahoo Finance. Returns information about major market indices (like S&P 500, NASDAQ, Dow Jones)."
        },
        yahoo_stock_history: {
          description: "Get historical stock data from Yahoo Finance. Returns price and volume data for a specified time period."
        }
      }
    }
  },
  {
    redisUrl: process.env.REDIS_URL,
    basePath: "",
    verboseLogs: true,
    maxDuration: 60
  }
);

export { handler as GET, handler as POST, handler as DELETE };