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
            if (period === "ytd")
              return new Date(new Date().getFullYear(), 0, 1);
            if (period === "max") return new Date(0);
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

    // Search Tool
    server.tool(
      "yahoo_search",
      "Search for stocks, ETFs, mutual funds, and other securities on Yahoo Finance",
      {
        query: z
          .string()
          .describe("Search query (e.g., 'Apple', 'Tesla', 'S&P 500')"),
        quotesCount: z
          .number()
          .default(10)
          .describe("Number of quotes to return"),
        newsCount: z
          .number()
          .default(0)
          .describe("Number of news items to return"),
      },
      async ({ query, quotesCount, newsCount }) => {
        try {
          const searchResult = await yahooFinance.search(query, {
            quotesCount,
            newsCount,
          });

          let output = `Search results for "${query}":\n\n`;

          if (searchResult.quotes && searchResult.quotes.length > 0) {
            output += "Quotes:\n";
            searchResult.quotes.forEach((quote: any, index) => {
              const name =
                quote.shortname || quote.longname || quote.name || quote.symbol;
              const symbol = quote.symbol || quote.ticker;
              output += `${index + 1}. ${name} (${symbol})\n`;
              if (quote.exchDisp) output += `   Exchange: ${quote.exchDisp}\n`;
              if (quote.typeDisp) output += `   Type: ${quote.typeDisp}\n`;
              output += "\n";
            });
          }

          if (searchResult.news && searchResult.news.length > 0) {
            output += "News:\n";
            searchResult.news.forEach((news: any, index) => {
              output += `${index + 1}. ${news.title}\n`;
              output += `   Source: ${news.publisher}\n`;
              output += `   Date: ${new Date(
                Number(news.providerPublishTime) * 1000
              ).toLocaleString()}\n`;
              output += `   Link: ${news.link}\n\n`;
            });
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

    // Options Tool
    server.tool(
      "yahoo_options",
      "Get options data for a stock from Yahoo Finance",
      {
        symbol: z
          .string()
          .describe("Stock ticker symbol (e.g., AAPL, MSFT, TSLA)"),
        expiration: z
          .string()
          .optional()
          .describe(
            "Options expiration date (YYYY-MM-DD). If not provided, returns all available expiration dates."
          ),
      },
      async ({ symbol, expiration }) => {
        try {
          const options = await yahooFinance.options(symbol, {
            date: expiration ? new Date(expiration) : undefined,
          });

          let output = `Options data for ${symbol}:\n\n`;

          if (options.expirationDates) {
            output += "Available expiration dates:\n";
            options.expirationDates.forEach((date: Date) => {
              output += `- ${date.toLocaleDateString()}\n`;
            });
            output += "\n";
          }

          if (options.strikes) {
            output += "Available strike prices:\n";
            options.strikes.forEach((strike: number) => {
              output += `- $${strike}\n`;
            });
            output += "\n";
          }

          if (options.options) {
            output += "Options contracts:\n";
            options.options.forEach((option: any) => {
              const calls = option.calls;
              const puts = option.puts;

              output += `Expiration: ${option.expirationDate.toLocaleDateString()}\n`;

              if (calls && calls.length > 0) {
                output += "Calls:\n";
                calls.forEach((call: any) => {
                  output += `  Strike: $${call.strike}\n`;
                  output += `  Last Price: $${call.lastPrice}\n`;
                  output += `  Bid: $${call.bid}\n`;
                  output += `  Ask: $${call.ask}\n`;
                  output += `  Volume: ${call.volume}\n`;
                  output += `  Open Interest: ${call.openInterest}\n\n`;
                });
              }

              if (puts && puts.length > 0) {
                output += "Puts:\n";
                puts.forEach((put: any) => {
                  output += `  Strike: $${put.strike}\n`;
                  output += `  Last Price: $${put.lastPrice}\n`;
                  output += `  Bid: $${put.bid}\n`;
                  output += `  Ask: $${put.ask}\n`;
                  output += `  Volume: ${put.volume}\n`;
                  output += `  Open Interest: ${put.openInterest}\n\n`;
                });
              }
            });
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

    // Recommendations Tool
    server.tool(
      "yahoo_recommendations",
      "Get stock recommendations and analysis from Yahoo Finance",
      {
        symbol: z
          .string()
          .describe("Stock ticker symbol (e.g., AAPL, MSFT, TSLA)"),
      },
      async ({ symbol }) => {
        try {
          const recommendations = await yahooFinance.recommendationsBySymbol(
            symbol
          );

          let output = `Recommendations for ${symbol}:\n\n`;

          if (
            recommendations.recommendedSymbols &&
            recommendations.recommendedSymbols.length > 0
          ) {
            output += "Recommended Similar Stocks:\n\n";
            recommendations.recommendedSymbols.forEach((rec: any) => {
              output += `Symbol: ${rec.symbol}\n`;
              output += `Score: ${rec.score}\n\n`;
            });
          } else {
            output += "No recommendations available.\n";
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

    // Trending Tool
    server.tool(
      "yahoo_trending",
      "Get trending stocks and market movers from Yahoo Finance",
      {
        count: z
          .number()
          .default(10)
          .describe("Number of trending items to return"),
        region: z
          .enum([
            "US",
            "GB",
            "AU",
            "CA",
            "IN",
            "FR",
            "DE",
            "HK",
            "IT",
            "ES",
            "BR",
            "MX",
            "SG",
            "JP",
          ])
          .default("US")
          .describe("Region to get trending symbols for"),
        lang: z
          .enum([
            "en-US",
            "en-GB",
            "en-AU",
            "en-CA",
            "en-IN",
            "fr-FR",
            "de-DE",
            "zh-HK",
            "it-IT",
            "es-ES",
            "pt-BR",
            "es-MX",
            "en-SG",
            "ja-JP",
          ])
          .default("en-US")
          .describe("Language for the response"),
      },
      async ({ count, region, lang }) => {
        try {
          const trending = await yahooFinance.trendingSymbols(region, {
            count,
            lang,
          });

          let output = `Trending Stocks (${region}):\n\n`;

          if (trending.quotes && trending.quotes.length > 0) {
            trending.quotes.forEach((item: any, index: number) => {
              output += `${index + 1}. ${item.shortname || item.symbol} (${
                item.symbol
              })\n`;
              output += `   Price: $${item.regularMarketPrice}\n`;
              output += `   Change: ${item.regularMarketChangePercent}%\n`;
              if (item.marketCap)
                output += `   Market Cap: $${(item.marketCap / 1e9).toFixed(
                  2
                )}B\n`;
              if (item.volume)
                output += `   Volume: ${item.volume.toLocaleString()}\n`;
              if (item.averageVolume)
                output += `   Avg Volume: ${item.averageVolume.toLocaleString()}\n`;
              output += "\n";
            });
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

    // Autocomplete Tool
    server.tool(
      "yahoo_autoc",
      "Get autocomplete suggestions from Yahoo Finance",
      {
        query: z.string().describe("Search query for autocomplete suggestions"),
      },
      async ({ query }) => {
        try {
          const searchResult = await yahooFinance.search(query, {
            quotesCount: 10,
            newsCount: 0,
          });

          let output = `Suggestions for "${query}":\n\n`;
          if (searchResult.quotes && searchResult.quotes.length > 0) {
            searchResult.quotes.forEach((quote: any, index) => {
              const name =
                quote.shortname || quote.longname || quote.name || quote.symbol;
              const symbol = quote.symbol || quote.ticker;
              output += `${index + 1}. ${name} (${symbol})\n`;
              if (quote.exchDisp) output += `   Exchange: ${quote.exchDisp}\n`;
              if (quote.typeDisp) output += `   Type: ${quote.typeDisp}\n`;
              output += "\n";
            });
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

    // Insights Tool
    server.tool(
      "yahoo_insights",
      "Get market insights and analysis from Yahoo Finance",
      {
        symbol: z
          .string()
          .describe("Stock ticker symbol (e.g., AAPL, MSFT, TSLA)"),
      },
      async ({ symbol }) => {
        try {
          const quote = await yahooFinance.quote(symbol);
          const summary = (quote as any).summaryDetail || {};
          const stats = (quote as any).defaultKeyStatistics || {};

          let output = `Market Insights for ${symbol}:\n\n`;

          // Summary Details
          output += "Summary Details:\n";
          if (summary.marketCap)
            output += `Market Cap: $${(summary.marketCap / 1e9).toFixed(2)}B\n`;
          if (summary.volume)
            output += `Volume: ${summary.volume.toLocaleString()}\n`;
          if (summary.averageVolume)
            output += `Avg Volume: ${summary.averageVolume.toLocaleString()}\n`;
          if (summary.fiftyTwoWeekHigh)
            output += `52-Week High: $${summary.fiftyTwoWeekHigh}\n`;
          if (summary.fiftyTwoWeekLow)
            output += `52-Week Low: $${summary.fiftyTwoWeekLow}\n`;
          output += "\n";

          // Key Statistics
          output += "Key Statistics:\n";
          if (stats.forwardPE) output += `Forward P/E: ${stats.forwardPE}\n`;
          if (stats.trailingPE) output += `Trailing P/E: ${stats.trailingPE}\n`;
          if (stats.priceToBook) output += `Price/Book: ${stats.priceToBook}\n`;
          if (stats.enterpriseToRevenue)
            output += `Enterprise/Revenue: ${stats.enterpriseToRevenue}\n`;
          if (stats.enterpriseToEbitda)
            output += `Enterprise/EBITDA: ${stats.enterpriseToEbitda}\n`;

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

    // Chart Tool
    server.tool(
      "yahoo_chart",
      "Get chart data for a stock from Yahoo Finance",
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
          const getPeriod1Date = (period: string): Date => {
            if (period === "ytd")
              return new Date(new Date().getFullYear(), 0, 1);
            if (period === "max") return new Date(0);
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

          const endDate = new Date();
          const startDate = getPeriod1Date(period);

          const chart = await yahooFinance.chart(symbol, {
            period1: startDate,
            period2: endDate,
            interval: interval as
              | "1mo"
              | "1d"
              | "5d"
              | "3mo"
              | "1m"
              | "2m"
              | "5m"
              | "15m"
              | "30m"
              | "60m"
              | "90m"
              | "1h"
              | "1wk",
          });

          let output = `Chart data for ${symbol} (${period}, ${interval}):\n\n`;

          if (chart.quotes && chart.quotes.length > 0) {
            output += "Price History:\n";
            chart.quotes.forEach((quote: any) => {
              const date = new Date(quote.timestamp * 1000).toLocaleString();
              output += `Date: ${date}\n`;
              output += `Open: $${quote.open}\n`;
              output += `High: $${quote.high}\n`;
              output += `Low: $${quote.low}\n`;
              output += `Close: $${quote.close}\n`;
              output += `Volume: ${quote.volume}\n\n`;
            });
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

    // Screener Tool
    server.tool(
      "yahoo_screener",
      "Screen stocks based on predefined criteria using Yahoo Finance",
      {
        criteria: z
          .enum([
            "day_gainers",
            "day_losers",
            "most_actives",
            "most_shorted_stocks",
            "undervalued_large_caps",
            "aggressive_small_caps",
            "conservative_foreign_funds",
            "growth_technology_stocks",
            "high_yield_bond",
            "portfolio_anchors",
            "solid_large_growth_funds",
            "solid_midcap_growth_funds",
            "top_mutual_funds",
            "undervalued_growth_stocks",
          ])
          .describe("Screening criteria (e.g., 'day_gainers', 'most_actives')"),
        count: z
          .number()
          .default(50)
          .describe("Maximum number of results to return"),
      },
      async ({ criteria, count }) => {
        try {
          const screen = await yahooFinance.screener({
            scrIds: criteria,
            count,
          });

          let output = `Screener results for ${criteria}:\n\n`;

          if (screen.quotes && screen.quotes.length > 0) {
            screen.quotes.forEach((quote: any, index) => {
              const name =
                quote.shortname || quote.longname || quote.name || quote.symbol;
              const symbol = quote.symbol || quote.ticker;
              output += `${index + 1}. ${name} (${symbol})\n`;
              if (quote.regularMarketPrice)
                output += `   Price: $${quote.regularMarketPrice}\n`;
              if (quote.regularMarketChangePercent)
                output += `   Change: ${quote.regularMarketChangePercent}%\n`;
              if (quote.marketCap)
                output += `   Market Cap: $${(quote.marketCap / 1e9).toFixed(
                  2
                )}B\n`;
              output += "\n";
            });
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
            "Get current stock quote information from Yahoo Finance. Returns detailed information about a stock including current price, day range, 52-week range, market cap, volume, P/E ratio, etc. Example: Get quote for AAPL to see current price, market cap, and other key metrics.",
        },
        yahoo_market_data: {
          description:
            "Get current market data from Yahoo Finance. Returns information about major market indices (like S&P 500, NASDAQ, Dow Jones). Example: Get market data for ^GSPC,^DJI to see S&P 500 and Dow Jones performance.",
        },
        yahoo_stock_history: {
          description:
            "Get historical stock data from Yahoo Finance. Returns price and volume data for a specified time period. Example: Get 1 month of daily data for AAPL with period='1mo' and interval='1d'.",
        },
        yahoo_search: {
          description:
            "Search for stocks, ETFs, mutual funds, and other securities on Yahoo Finance. Returns matching quotes and news articles. Example: Search for 'Apple' with quotesCount=5 to get top 5 matching securities.",
        },
        yahoo_options: {
          description:
            "Get options data for a stock from Yahoo Finance. Returns available expiration dates, strike prices, and options contracts. Example: Get options for AAPL with optional expiration='2024-04-19' for specific date.",
        },
        yahoo_recommendations: {
          description:
            "Get stock recommendations and analysis from Yahoo Finance. Returns recommended similar stocks with their scores. Example: Get recommendations for AAPL to find similar stocks to invest in.",
        },
        yahoo_trending: {
          description:
            "Get trending stocks and market movers from Yahoo Finance. Returns trending stocks with price, change, volume, and market cap. Example: Get trending stocks for US market with count=10, region='US', lang='en-US'.",
        },
        yahoo_autoc: {
          description:
            "Get autocomplete suggestions from Yahoo Finance. Returns matching symbols and securities as you type. Example: Get suggestions for 'Appl' to find Apple-related securities.",
        },
        yahoo_insights: {
          description:
            "Get market insights and analysis from Yahoo Finance. Returns market news, analysis, and insights for a stock. Example: Get insights for AAPL to see market analysis and key statistics.",
        },
        yahoo_chart: {
          description:
            "Get chart data for a stock from Yahoo Finance. Returns historical price and volume data in a chart format. Example: Get 1 month of daily chart data for AAPL with period='1mo' and interval='1d'.",
        },
        yahoo_screener: {
          description:
            "Screen stocks based on predefined criteria using Yahoo Finance. Returns stocks matching your screening criteria. Example: Screen for 'day_gainers' to find stocks with highest gains today.",
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
