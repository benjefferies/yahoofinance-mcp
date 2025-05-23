# Yahoo Finance MCP Server

A Model Context Protocol (MCP) server that provides financial market data from Yahoo Finance. Integrate real-time stock quotes, market data, and historical stock information with Claude and other MCP-compatible assistants, without requiring API keys.

## Visualization and Analysis Capabilities

This MCP server enables powerful financial data visualization and analysis through Claude:

![Market Sentiment Analysis Dashboard](assets/sentiment.png)
*Market Sentiment Analysis Dashboard showing real-time index performance, fear/greed indicators, and historical trends*

![Portfolio Performance Tracking](assets/portfolio.png)
*Track your tech portfolio performance with detailed metrics and visualizations*

![Stock Price Technical Analysis](assets/analysis.png)
*Deep dive technical analysis with price trends, moving averages, and performance insights*

## Features

- **Stock Quotes**: Get current stock price, change, range, volume, and other key metrics
- **Market Indices**: Retrieve data for major market indices like S&P 500, Dow Jones, NASDAQ
- **Historical Data**: Fetch and analyze historical stock data with customizable time periods and intervals
- **Rate limiting**: Built-in rate limiting to ensure reliable access to Yahoo Finance
- **Sentiment Analysis**: Visualize market sentiment with fear/greed indicators and trend analysis
- **Portfolio Tracking**: Monitor your investment portfolio performance over time
- **Technical Analysis**: Access moving averages, price trends, and performance metrics
- **Visual Dashboards**: Generate comprehensive financial dashboards for better insights

## Installation

### Using Docker (Recommended)

The most reliable way to run the server is using Docker:

```bash
# Clone the repository
git clone https://github.com/jasontoo/yahoofinance-mcp.git
cd yahoofinance-mcp

# Build the Docker image
docker build -t yahoofinance-mcp .

# Run the container
docker run -i --rm yahoofinance-mcp
```

## Integration with Claude Desktop

1. Download and install [Claude Desktop](https://claude.ai/download)
2. Create or edit the Claude Desktop configuration file:
  - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

3. Add the Yahoo Finance server configuration using your preferred method:

### Docker Option (Recommended)

```json
{
  "mcpServers": {
   "yahoofinance": {
    "command": "docker",
    "args": [
      "run",
      "-i",
      "--rm",
      "yahoofinance-mcp"
    ]
   }
  }
}
```

4. Save the file and restart Claude Desktop

## Available Tools

### yahoo_stock_quote
Gets current stock quote information from Yahoo Finance.

**Parameters:**
- `symbol`: Stock ticker symbol (e.g., AAPL, MSFT, TSLA)

Example output:
```
Symbol: AAPL
Name: Apple Inc.
Price: $196.34
Change: $1.67 (0.86%)
Previous Close: $194.67
Open: $195.01
Day Range: $194.14 - $197.21
52 Week Range: $124.17 - $197.21
Volume: 54,364,985
Avg. Volume: 55,486,332
Market Cap: $3,026,858,790,912
P/E Ratio: 32.44
EPS: $6.05
Dividend Yield: 0.51%
```

### yahoo_market_data
Gets current market data from Yahoo Finance for major indices.

**Parameters:**
- `indices` (optional): List of index symbols to fetch (default: ["^GSPC", "^DJI", "^IXIC"])

Example output:
```
S&P 500
Price: 5,069.76
Change: -75.62 (-1.47%)
Previous Close: 5,145.37
Day Range: 5,062.68 - 5,143.25

Dow Jones Industrial Average
Price: 38,150.30
Change: -532.43 (-1.38%)
Previous Close: 38,682.73
Day Range: 38,113.08 - 38,672.04

NASDAQ Composite
Price: 16,180.21
Change: -240.32 (-1.46%)
Previous Close: 16,420.52
Day Range: 16,111.78 - 16,405.25
```

### yahoo_stock_history
Gets historical stock data from Yahoo Finance.

**Parameters:**
- `symbol`: Stock ticker symbol
- `period` (optional): Time period ("1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max")
- `interval` (optional): Data interval ("1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo")

Example output:
```
Historical data for AAPL (1mo, 1d intervals)
Currency: USD
Trading Period: 8/24/2023 to 9/25/2023

Date       | Open     | High     | Low      | Close    | Volume
-----------|----------|----------|----------|----------|------------
8/25/2023  | $181.21  | $181.82  | $180.3   | $181.72  | 38,324,242
8/30/2023  | $185.3   | $187.85  | $184.94  | $187.65  | 60,295,151
9/5/2023   | $188.28  | $189.98  | $187.61  | $189.7   | 45,768,330
9/11/2023  | $174.79  | $175.1   | $173.73  | $174.75  | 63,746,501
9/15/2023  | $175.83  | $176.1   | $173.82  | $175.01  | 93,033,436
9/21/2023  | $174.26  | $177.08  | $174.22  | $176.97  | 66,097,991
9/25/2023  | $175.03  | $176.97  | $173.35  | $176.08  | 63,523,374

Price Change: $-5.13 (-2.83%)
```

### yahoo_company_financials
Gets financial statement data for a company from Yahoo Finance.

**Parameters:**
- `symbol`: Stock ticker symbol
- `statement` (optional): Financial statement type ("income", "balance", "cash", or "all")
- `period` (optional): Time period ("annual" or "quarterly")

### yahoo_stock_news_sentiment
Gets recent news articles and sentiment analysis for a stock.

**Parameters:**
- `symbol` (optional): Stock ticker symbol (omit for general market news)
- `count` (optional): Number of news items to retrieve (max 10)

## Example Prompts

Once the server is connected to Claude, you can ask questions like:

- "What's the current price of AAPL stock?"
- "How has Tesla stock performed over the past month?"
- "Show me the current values of major market indices."
- "What's the stock price history for MSFT over the last year?"
- "Compare the performance of GOOGL and AMZN over the past 3 months."
- "What's the 52-week range for NVDA?"
- "How has the S&P 500 performed today?"
- "Create a market sentiment dashboard for today's trading."
- "Generate a portfolio performance chart for my tech stocks."
- "Show me a technical analysis of Tesla stock with moving averages."
- "What's the current fear/greed index in the market?"
- "Visualize the correlation between S&P 500 and VIX over the past month."

## Troubleshooting

If you encounter issues:

1. **Claude Desktop Logs**:
  - Check for errors: `tail -n 20 -f ~/Library/Logs/Claude/mcp*.log`
  
2. **Server Connectivity**:
  - Make sure Docker is running if using Docker
  - Ensure you have an active internet connection

3. **Tool Execution Issues**:
  - Verify ticker symbols are correct
  - Check if Yahoo Finance API might be rate-limiting requests
  - Wait a few minutes and try again if you see timeout errors

4. **Config File Issues**:
  - Make sure your `claude_desktop_config.json` is formatted correctly
  - Double-check all paths and commands
  - Restart Claude Desktop after making changes

## License

This project is licensed under the MIT License - see the LICENSE file for details.