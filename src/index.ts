#!/usr/bin/env node

import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Define tools
const STOCK_QUOTE_TOOL: Tool = {
  name: "yahoo_stock_quote",
  description:
    "Get current stock quote information from Yahoo Finance. " +
    "Returns detailed information about a stock including current price, " +
    "day range, 52-week range, market cap, volume, P/E ratio, etc. " +
    "Use this for getting the latest stock price and key metrics.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Stock ticker symbol (e.g., AAPL, MSFT, TSLA)",
      },
    },
    required: ["symbol"],
  },
};

const MARKET_DATA_TOOL: Tool = {
  name: "yahoo_market_data",
  description:
    "Get current market data from Yahoo Finance. " +
    "Returns information about major market indices (like S&P 500, NASDAQ, Dow Jones). " +
    "Use this for broad market overview and current market sentiment.",
  inputSchema: {
    type: "object",
    properties: {
      indices: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "List of index symbols to fetch (e.g., ^GSPC for S&P 500, ^DJI for Dow Jones)",
        default: ["^GSPC", "^DJI", "^IXIC"],
      },
    },
    required: [],
  },
};

const STOCK_HISTORY_TOOL: Tool = {
  name: "yahoo_stock_history",
  description:
    "Get historical stock data from Yahoo Finance. " +
    "Returns price and volume data for a specified time period. " +
    "Useful for charting, trend analysis, and evaluating stock performance over time.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Stock ticker symbol (e.g., AAPL, MSFT, TSLA)",
      },
      period: {
        type: "string",
        description:
          "Time period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)",
        default: "1mo",
      },
      interval: {
        type: "string",
        description:
          "Data interval (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo)",
        default: "1d",
      },
    },
    required: ["symbol"],
  },
};

// Server implementation
const server = new Server(
  {
    name: "yahoofinance-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Rate limiting implementation
const RATE_LIMIT = {
  perMinute: 20, // Reduced from 30 to be more conservative
  perDay: 500,
};

let requestCount = {
  minute: 0,
  day: 0,
  lastMinuteReset: Date.now(),
  lastDayReset: Date.now(),
};

function checkRateLimit() {
  const now = Date.now();

  // Reset minute counter if a minute has passed
  if (now - requestCount.lastMinuteReset > 60000) {
    requestCount.minute = 0;
    requestCount.lastMinuteReset = now;
  }

  // Reset day counter if a day has passed
  if (now - requestCount.lastDayReset > 86400000) {
    requestCount.day = 0;
    requestCount.lastDayReset = now;
  }

  if (
    requestCount.minute >= RATE_LIMIT.perMinute ||
    requestCount.day >= RATE_LIMIT.perDay
  ) {
    throw new Error("Rate limit exceeded. Please try again later.");
  }

  requestCount.minute++;
  requestCount.day++;
}

// Common browser-like headers to avoid API blocking
const getHeaders = () => ({
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  Referer: "https://finance.yahoo.com/",
  Cookie:
    "A3=d=AQABBF_zAWgCECu1atOWdvlIccOO1YDGgv4FEgABCAE2A2gwaPZ0rXYB9qMAAAcIXfMBaLS3h2g&S=AQAAApAipNh4FMtlOGKL1YcbSw4; A1=d=AQABBF_zAWgCECu1atOWdvlIccOO1YDGgv4FEgABCAE2A2gwaPZ0rXYB9qMAAAcIXfMBaLS3h2g&S=AQAAApAipNh4FMtlOGKL1YcbSw4; GUC=AQABCAFoAzZoMEIfWQSt&s=AQAAAOHeVICO&g=aAHzaQ; cmp=t=1745074110&j=1&u=1---&v=76; axids=gam=y-H7o_PelE2uJ.CdgJxLeup55IRhB3lpnK~A&dv360=eS1feVJwQ2dORTJ1Rk1YZVIubHE3TFJOcmF5cmZQTVJEOH5B&ydsp=y-_DKuMGtE2uJ_kxTjZrvO7A9q26vpoM8L~A&tbla=y-ZVPr5.JE2uLubnZl7kR5Egn34XgziVaA~A; tbla_id=b8e9c6ad-ccaf-46d3-8bce-c09330232427-tuctefb78e2; PRF=t%3DVOD.L%252BAAPL%252BLLY; A1S=d=AQABBF_zAWgCECu1atOWdvlIccOO1YDGgv4FEgABCAE2A2gwaPZ0rXYB9qMAAAcIXfMBaLS3h2g&S=AQAAApAipNh4FMtlOGKL1YcbSw4",
});

// Retry logic for API requests
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let retries = 0;
  let lastError: Error | null = null;

  while (retries < maxRetries) {
    try {
      const response = await fetch(url, options);

      // If we get a rate limiting response, wait and retry
      if (response.status === 429) {
        const waitTime = Math.pow(2, retries) * 1000; // Exponential backoff
        console.error(`Rate limited, retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        retries++;
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const waitTime = Math.pow(2, retries) * 1000; // Exponential backoff
      console.error(
        `Fetch error, retrying in ${waitTime}ms... (${lastError.message})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      retries++;
    }
  }

  throw lastError || new Error("Maximum retries exceeded");
}

// Type guards for arguments
function isStockQuoteArgs(args: unknown): args is { symbol: string } {
  return (
    typeof args === "object" &&
    args !== null &&
    "symbol" in args &&
    typeof (args as { symbol: string }).symbol === "string"
  );
}

function isMarketDataArgs(args: unknown): args is { indices?: string[] } {
  return (
    typeof args === "object" &&
    args !== null &&
    (!("indices" in args) || Array.isArray((args as { indices: any }).indices))
  );
}

function isStockHistoryArgs(args: unknown): args is {
  symbol: string;
  period?: string;
  interval?: string;
} {
  return (
    typeof args === "object" &&
    args !== null &&
    "symbol" in args &&
    typeof (args as { symbol: string }).symbol === "string"
  );
}

// Yahoo Finance API interface functions
async function fetchStockQuote(symbol: string) {
  checkRateLimit();

  try {
    const options = {
      method: "GET",
      headers: getHeaders(),
    };

    // Use the working v8 finance/chart API format
    // Get current timestamp for period2 and subtract a small amount for period1
    const now = Math.floor(Date.now() / 1000);
    const oneMinuteAgo = now - 60;

    const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?period1=${oneMinuteAgo}&period2=${now}&interval=1d&events=history`;
    console.error(`Fetching from URL: ${chartUrl}`);

    const chartResponse = await fetchWithRetry(chartUrl, options);

    if (chartResponse.ok) {
      const data = await chartResponse.json();
      const result = data.chart?.result?.[0];

      if (result) {
        // Try to extract full quote information if available
        if (result.meta) {
          const quoteData = {
            symbol: result.meta.symbol,
            shortName: result.meta.shortName || result.meta.longName || symbol,
            regularMarketPrice: result.meta.regularMarketPrice,
            regularMarketChange:
              result.meta.regularMarketPrice - result.meta.chartPreviousClose,
            regularMarketChangePercent:
              (result.meta.regularMarketPrice -
                result.meta.chartPreviousClose) /
              result.meta.chartPreviousClose,
            regularMarketPreviousClose: result.meta.chartPreviousClose,
            regularMarketOpen: result.indicators?.quote?.[0]?.open?.[0],
            regularMarketDayLow:
              result.meta.regularMarketDayLow ||
              result.indicators?.quote?.[0]?.low?.[0],
            regularMarketDayHigh:
              result.meta.regularMarketDayHigh ||
              result.indicators?.quote?.[0]?.high?.[0],
            fiftyTwoWeekLow: result.meta.fiftyTwoWeekLow,
            fiftyTwoWeekHigh: result.meta.fiftyTwoWeekHigh,
            regularMarketVolume:
              result.meta.regularMarketVolume ||
              result.indicators?.quote?.[0]?.volume?.[0],
            averageDailyVolume3Month: null, // Not available in chart API
            marketCap: null, // Not available in chart API
            trailingPE: null, // Not available in chart API
            epsTrailingTwelveMonths: null, // Not available in chart API
            dividendYield: null, // Not available in chart API
          };

          return formatStockQuote(quoteData);
        } else {
          return formatBasicQuote(result, symbol);
        }
      }
    }

    return `Unable to retrieve data for symbol: ${symbol}. The ticker symbol may be invalid or Yahoo Finance data may be temporarily unavailable.`;
  } catch (error) {
    throw new Error(
      `Failed to fetch stock quote: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Format a basic quote from chart data when main API fails
function formatBasicQuote(chartData: any, symbol: string): string {
  try {
    const meta = chartData.meta || {};
    const indicators = chartData.indicators || {};
    const quote = indicators.quote?.[0] || {};

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose;
    const change = meta.regularMarketPrice - meta.previousClose;
    const changePercent = (change / meta.previousClose) * 100;

    return `
Symbol: ${symbol}
Name: ${
      meta.instrumentInfo?.shortName || meta.instrumentInfo?.longName || symbol
    }
Price: $${currentPrice?.toLocaleString() || "N/A"}
Change: $${change?.toFixed(2) || "N/A"} (${changePercent?.toFixed(2) || "N/A"}%)
Previous Close: $${previousClose?.toLocaleString() || "N/A"}

Note: Full quote data is unavailable. Showing limited information from chart data.
`.trim();
  } catch (error) {
    return `Basic data for ${symbol} could not be retrieved. The Yahoo Finance API may be temporarily unavailable.`;
  }
}

function formatStockQuote(quote: any): string {
  // Format the response in a readable way
  const formatNumber = (num: number | null | undefined) =>
    num !== undefined && num !== null ? num.toLocaleString() : "N/A";

  const formatPercent = (num: number | null | undefined) =>
    num !== undefined && num !== null ? `${(num * 100).toFixed(2)}%` : "N/A";

  return `
Symbol: ${quote.symbol}
Name: ${quote.shortName || quote.longName || "N/A"}
Price: $${formatNumber(quote.regularMarketPrice)}
Change: $${formatNumber(quote.regularMarketChange)} (${formatPercent(
    quote.regularMarketChangePercent
  )})
Previous Close: $${formatNumber(quote.regularMarketPreviousClose)}
Open: $${formatNumber(quote.regularMarketOpen)}
Day Range: $${formatNumber(quote.regularMarketDayLow)} - $${formatNumber(
    quote.regularMarketDayHigh
  )}
52 Week Range: $${formatNumber(quote.fiftyTwoWeekLow)} - $${formatNumber(
    quote.fiftyTwoWeekHigh
  )}
Volume: ${formatNumber(quote.regularMarketVolume)}
Avg. Volume: ${formatNumber(quote.averageDailyVolume3Month)}
Market Cap: $${formatNumber(quote.marketCap)}
P/E Ratio: ${formatNumber(quote.trailingPE)}
EPS: $${formatNumber(quote.epsTrailingTwelveMonths)}
Dividend Yield: ${formatPercent(quote.dividendYield)}
`.trim();
}

async function fetchMarketData(indices: string[] = ["^GSPC", "^DJI", "^IXIC"]) {
  checkRateLimit();

  try {
    const options = {
      method: "GET",
      headers: getHeaders(),
    };

    // Use the working v8 finance/chart API for each index
    const indexResults = [];
    const now = Math.floor(Date.now() / 1000);
    const oneMinuteAgo = now - 60;

    for (const indexSymbol of indices) {
      try {
        const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          indexSymbol
        )}?period1=${oneMinuteAgo}&period2=${now}&interval=1d&events=history`;
        console.error(`Fetching from URL: ${chartUrl}`);

        const chartResponse = await fetchWithRetry(chartUrl, options);

        if (chartResponse.ok) {
          const data = await chartResponse.json();
          const result = data.chart?.result?.[0];

          if (result) {
            indexResults.push({
              symbol: indexSymbol,
              shortName:
                result.meta.shortName || result.meta.longName || indexSymbol,
              regularMarketPrice: result.meta.regularMarketPrice,
              regularMarketChange:
                result.meta.regularMarketPrice - result.meta.chartPreviousClose,
              regularMarketChangePercent:
                (result.meta.regularMarketPrice -
                  result.meta.chartPreviousClose) /
                result.meta.chartPreviousClose,
              regularMarketPreviousClose: result.meta.chartPreviousClose,
              regularMarketDayHigh: result.meta.regularMarketDayHigh,
              regularMarketDayLow: result.meta.regularMarketDayLow,
            });
          }
        }
      } catch (error) {
        console.error(`Failed to fetch data for index: ${indexSymbol}`, error);
      }
    }

    if (indexResults.length > 0) {
      return formatMarketData(indexResults);
    }

    return "Unable to retrieve market data. Yahoo Finance data may be temporarily unavailable.";
  } catch (error) {
    throw new Error(
      `Failed to fetch market data: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function formatMarketData(indices: any[]): string {
  return indices
    .map((index) => {
      const changePercent = index.regularMarketChangePercent
        ? (index.regularMarketChangePercent * 100).toFixed(2) + "%"
        : "N/A";

      return `
${index.shortName || index.longName || index.symbol}
Price: ${index.regularMarketPrice?.toLocaleString() || "N/A"}
Change: ${
        index.regularMarketChange?.toLocaleString() || "N/A"
      } (${changePercent})
Previous Close: ${index.regularMarketPreviousClose?.toLocaleString() || "N/A"}
Day Range: ${index.regularMarketDayLow?.toLocaleString() || "N/A"} - ${
        index.regularMarketDayHigh?.toLocaleString() || "N/A"
      }
`.trim();
    })
    .join("\n\n");
}

async function fetchStockHistory(
  symbol: string,
  period: string = "1mo",
  interval: string = "1d"
) {
  checkRateLimit();

  try {
    // Convert period and interval to Yahoo Finance API parameters
    const validPeriods = [
      "1d",
      "5d",
      "1mo",
      "3mo",
      "6mo",
      "1y",
      "2y",
      "5y",
      "10y",
      "ytd",
      "max",
    ];
    const validIntervals = [
      "1m",
      "2m",
      "5m",
      "15m",
      "30m",
      "60m",
      "90m",
      "1h",
      "1d",
      "5d",
      "1wk",
      "1mo",
      "3mo",
    ];

    if (!validPeriods.includes(period)) {
      throw new Error(
        `Invalid period: ${period}. Valid periods are: ${validPeriods.join(
          ", "
        )}`
      );
    }

    if (!validIntervals.includes(interval)) {
      throw new Error(
        `Invalid interval: ${interval}. Valid intervals are: ${validIntervals.join(
          ", "
        )}`
      );
    }

    // Convert relative time period to absolute timestamps
    let period1, period2;
    period2 = Math.floor(Date.now() / 1000); // Current time

    // Calculate period1 based on the requested period
    switch (period) {
      case "1d":
        period1 = period2 - 86400; // 1 day in seconds
        break;
      case "5d":
        period1 = period2 - 5 * 86400; // 5 days in seconds
        break;
      case "1mo":
        period1 = period2 - 30 * 86400; // 30 days in seconds
        break;
      case "3mo":
        period1 = period2 - 90 * 86400; // 90 days in seconds
        break;
      case "6mo":
        period1 = period2 - 180 * 86400; // 180 days in seconds
        break;
      case "1y":
        period1 = period2 - 365 * 86400; // 365 days in seconds
        break;
      case "2y":
        period1 = period2 - 2 * 365 * 86400; // 2 years in seconds
        break;
      case "5y":
        period1 = period2 - 5 * 365 * 86400; // 5 years in seconds
        break;
      case "10y":
        period1 = period2 - 10 * 365 * 86400; // 10 years in seconds
        break;
      case "ytd":
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1); // January 1st of current year
        period1 = Math.floor(startOfYear.getTime() / 1000);
        break;
      case "max":
        period1 = 0; // Beginning of time (for stock data)
        break;
      default:
        period1 = period2 - 30 * 86400; // Default to 1 month
    }

    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?period1=${period1}&period2=${period2}&interval=${interval}&events=history`;
    console.error(`Fetching from URL: ${url}`);

    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      return `No historical data found for symbol: ${symbol}`;
    }

    return formatStockHistory(result, symbol, period, interval);
  } catch (error) {
    throw new Error(
      `Failed to fetch stock history: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function formatStockHistory(
  historyData: any,
  symbol: string,
  period: string,
  interval: string
): string {
  try {
    const meta = historyData.meta || {};
    const timestamps = historyData.timestamp || [];
    const quotes = historyData.indicators?.quote?.[0] || {};
    const adjclose = historyData.indicators?.adjclose?.[0]?.adjclose || [];

    // Get the currency from meta
    const currency = meta.currency || "USD";

    // Format header information
    let result = `Historical data for ${symbol} (${period}, ${interval} intervals)\n`;
    result += `Currency: ${currency}\n`;

    if (meta.firstTradeDate && meta.regularMarketTime) {
      result += `Trading Period: ${new Date(
        meta.firstTradeDate * 1000
      ).toLocaleDateString()} to ${new Date(
        meta.regularMarketTime * 1000
      ).toLocaleDateString()}\n\n`;
    } else {
      result += "\n";
    }

    // Only show a reasonable number of data points to avoid overwhelming the response
    const maxPoints = 10;
    const step = Math.max(1, Math.floor(timestamps.length / maxPoints));

    // Table header
    result +=
      "Date       | Open     | High     | Low      | Close    | Volume\n";
    result +=
      "-----------|----------|----------|----------|----------|------------\n";

    // Add data rows
    for (let i = 0; i < timestamps.length; i += step) {
      const date = new Date(timestamps[i] * 1000).toLocaleDateString();
      const open = quotes.open?.[i]?.toFixed(2) || "N/A";
      const high = quotes.high?.[i]?.toFixed(2) || "N/A";
      const low = quotes.low?.[i]?.toFixed(2) || "N/A";
      const close = quotes.close?.[i]?.toFixed(2) || "N/A";
      const volume = quotes.volume?.[i]?.toLocaleString() || "N/A";

      result += `${date.padEnd(11)} | $${open.padEnd(8)} | $${high.padEnd(
        8
      )} | $${low.padEnd(8)} | $${close.padEnd(8)} | ${volume}\n`;
    }

    // Summary information
    if (timestamps.length > 0) {
      const firstIndex = 0;
      const lastIndex = timestamps.length - 1;

      const firstClose = quotes.close?.[firstIndex];
      const lastClose = quotes.close?.[lastIndex];

      if (firstClose !== undefined && lastClose !== undefined) {
        const change = lastClose - firstClose;
        const percentChange = (change / firstClose) * 100;

        result += `\nPrice Change: $${change.toFixed(
          2
        )} (${percentChange.toFixed(2)}%)`;
      }
    }

    return result;
  } catch (error) {
    return `Error formatting stock history: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [STOCK_QUOTE_TOOL, MARKET_DATA_TOOL, STOCK_HISTORY_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "yahoo_stock_quote": {
        if (!isStockQuoteArgs(args)) {
          throw new Error("Invalid arguments for yahoo_stock_quote");
        }
        const { symbol } = args;
        const results = await fetchStockQuote(symbol);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case "yahoo_market_data": {
        if (!isMarketDataArgs(args)) {
          throw new Error("Invalid arguments for yahoo_market_data");
        }
        const { indices = ["^GSPC", "^DJI", "^IXIC"] } = args;
        const results = await fetchMarketData(indices);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case "yahoo_stock_history": {
        if (!isStockHistoryArgs(args)) {
          throw new Error("Invalid arguments for yahoo_stock_history");
        }
        const { symbol, period = "1mo", interval = "1d" } = args;
        const results = await fetchStockHistory(symbol, period, interval);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Yahoo Finance MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
