import { createMcpHandler } from "@vercel/mcp-adapter";
import yahooFinance from "yahoo-finance2";
import { z } from "zod";

const handler = createMcpHandler(
  (server) => {
    // Stock Quote Tool
    server.tool(
      "yahoo_stock_quote",
      "Get current stock quote information from Yahoo Finance",
      {
        symbol: z
          .string()
          .describe("Stock ticker symbol (e.g., AAPL, MSFT, TSLA)"),
      },
      async ({ symbol }) => {
        try {
          const quote = await yahooFinance.quote(symbol);

          const quoteData = {
            symbol: quote.symbol,
            shortName: quote.shortName || quote.longName || symbol,
            regularMarketPrice: quote.regularMarketPrice,
            regularMarketChange: quote.regularMarketChange,
            regularMarketChangePercent: quote.regularMarketChangePercent,
            regularMarketPreviousClose: quote.regularMarketPreviousClose,
            regularMarketOpen: quote.regularMarketOpen,
            regularMarketDayLow: quote.regularMarketDayLow,
            regularMarketDayHigh: quote.regularMarketDayHigh,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
            regularMarketVolume: quote.regularMarketVolume,
          };

          return {
            content: [
              { type: "text", text: JSON.stringify(quoteData, null, 2) },
            ],
          };
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
          };
        }
      }
    );

    // Market Data Tool
    server.tool(
      "yahoo_market_data",
      "Get current market data from Yahoo Finance",
      {
        indices: z
          .array(z.string())
          .default(["^GSPC", "^DJI", "^IXIC"])
          .describe(
            "List of index symbols to fetch (e.g., ^GSPC for S&P 500, ^DJI for Dow Jones)"
          ),
      },
      async ({ indices }) => {
        try {
          const results = await Promise.all(
            indices.map(async (index) => {
              const quote = await yahooFinance.quote(index);
              return `${quote.shortName || index}: $${
                quote.regularMarketPrice?.toFixed(2) || "N/A"
              } (${quote.regularMarketChangePercent?.toFixed(2)}%)`;
            })
          );

          return {
            content: [{ type: "text", text: results.join("\n") }],
          };
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
          };
        }
      }
    );

    // Stock History Tool
    server.tool(
      "yahoo_stock_history",
      "Get historical stock data from Yahoo Finance",
      {
        symbol: z
          .string()
          .describe("Stock ticker symbol (e.g., AAPL, MSFT, TSLA)"),
        period: z
          .string()
          .default("1mo")
          .describe(
            "Time period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)"
          ),
        interval: z
          .string()
          .default("1d")
          .describe(
            "Data interval (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo)"
          ),
      },
      async ({ symbol, period, interval }) => {
        try {
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

          const getPeriod1Date = (period: string): Date => {
            if (period === "ytd") {
              return new Date(new Date().getFullYear(), 0, 1);
            }
            if (period === "max") {
              return new Date(0);
            }
            const periods: Record<string, number> = {
              "1d": 86400000,
              "5d": 5 * 86400000,
              "1mo": 30 * 86400000,
              "3mo": 90 * 86400000,
              "6mo": 180 * 86400000,
              "1y": 365 * 86400000,
              "2y": 2 * 365 * 86400000,
              "5y": 5 * 365 * 86400000,
              "10y": 10 * 365 * 86400000,
            };
            return new Date(Date.now() - (periods[period] || 30 * 86400000));
          };

          const history = await yahooFinance.historical(symbol, {
            period1: getPeriod1Date(period),
            period2: new Date(),
            interval: interval as any,
          });

          if (!history || history.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No historical data found for symbol: ${symbol}`,
                },
              ],
            };
          }

          let output = `Historical data for ${symbol} (${period}, ${interval} intervals)\n`;
          output += `Currency: USD\n`;

          if (history.length > 0) {
            output += `Trading Period: ${history[0].date.toLocaleDateString()} to ${history[
              history.length - 1
            ].date.toLocaleDateString()}\n\n`;
          }

          output += "Date | Open | High | Low | Close | Volume\n";
          output +=
            "-----------|----------|----------|----------|----------|------------\n";

          const maxPoints = 10;
          const step = Math.max(1, Math.floor(history.length / maxPoints));

          for (let i = 0; i < history.length; i += step) {
            const data = history[i];
            const date = data.date.toLocaleDateString();
            const open = data.open?.toFixed(2) || "N/A";
            const high = data.high?.toFixed(2) || "N/A";
            const low = data.low?.toFixed(2) || "N/A";
            const close = data.close?.toFixed(2) || "N/A";
            const volume = data.volume?.toLocaleString() || "N/A";
            output += `${date.padEnd(11)} | $${open.padEnd(8)} | $${high.padEnd(
              8
            )} | $${low.padEnd(8)} | $${close.padEnd(8)} | ${volume}\n`;
          }

          if (history.length > 0) {
            const firstClose = history[0].close;
            const lastClose = history[history.length - 1].close;

            if (firstClose !== undefined && lastClose !== undefined) {
              const change = lastClose - firstClose;
              const percentChange = (change / firstClose) * 100;
              output += `\nPrice Change: $${change.toFixed(
                2
              )} (${percentChange.toFixed(2)}%)`;
            }
          }

          return {
            content: [{ type: "text", text: output }],
          };
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
          };
        }
      }
    );
  },
  {
    capabilities: {
      tools: {
        yahoo_stock_quote: {
          description:
            "Get current stock quote information from Yahoo Finance. Returns detailed information about a stock including current price, day range, 52-week range, market cap, volume, P/E ratio, etc.",
        },
        yahoo_market_data: {
          description:
            "Get current market data from Yahoo Finance. Returns information about major market indices (like S&P 500, NASDAQ, Dow Jones).",
        },
        yahoo_stock_history: {
          description:
            "Get historical stock data from Yahoo Finance. Returns price and volume data for a specified time period.",
        },
      },
    },
  },
  {
    redisUrl: process.env.REDIS_URL,
    basePath: "",
    verboseLogs: true,
    maxDuration: 60,
  }
);

export { handler as DELETE, handler as GET, handler as POST };
