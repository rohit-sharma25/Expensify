import { CONFIG } from './config.js';
import { DBService } from './db-service.js';

export class PriceService {
    static ALPHA_BASE_URL = 'https://www.alphavantage.co/query';
    static FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
    static TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';
    static RAPID_YAHOO_BASE_URL = 'https://yahoo-finance15.p.rapidapi.com/api/v1/markets/stock/quotes';
    static GOLD_API_BASE_URL = 'https://www.goldapi.io/api';
    static POLYGON_BASE_URL = 'https://api.polygon.io/v2/aggs/ticker';
    static POLYGON_V3_BASE_URL = 'https://api.polygon.io/v3/reference';

    static exchangeRate = null;
    static exchangeRateUpdatedAt = null;
    static EXCHANGE_RATE_CACHE_DURATION = 3600000; // 1 hour

    // API Call Caching: Limit expensive APIs to 1-2 calls per day
    static apiCallCache = {};
    // Keep API calls infrequent — respect cached DB timestamp (set to 24h by default)
    static API_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours between API calls

    // Cached commodity prices (realistic market rates as of 2026)
    static lastKnownPrices = {
        'GOLD': { price: 6250, change: 0, changePercent: '0.00%', prevClose: 6250, isLive: false },
        'SILVER': { price: 85, change: 0, changePercent: '0.00%', prevClose: 85, isLive: false },
    };

    /**
     * SYMBOL MAPPING
     * Internal App Symbol -> API Specific Symbols
     */
    static SYMBOL_MAP = {
        'GOLD': { goldapi: 'XAU', finnhub: 'OANDA:XAU_USD', alpha: 'GOLD' },
        'SILVER': { goldapi: 'XAG', finnhub: 'OANDA:XAG_USD', alpha: 'SILVER' },
        'RELIANCE.BSE': { polygon: 'RELIANCE.NS', yahoo: 'RELIANCE.NS', twelvedata: 'RELIANCE', finnhub: 'RELIANCE.NS' },
        'TCS.BSE': { polygon: 'TCS.NS', yahoo: 'TCS.NS', twelvedata: 'TCS', finnhub: 'TCS.NS' },
        'INFY.BSE': { polygon: 'INFY.NS', yahoo: 'INFY.NS', twelvedata: 'INFY', finnhub: 'INFY.NS' },
        'HDFCBANK.BSE': { polygon: 'HDFCBANK.NS', yahoo: 'HDFCBANK.NS', twelvedata: 'HDFCBANK', finnhub: 'HDFCBANK.NS' },
        'AAPL': { polygon: 'AAPL', yahoo: 'AAPL', twelvedata: 'AAPL', finnhub: 'AAPL' },
        'MSFT': { polygon: 'MSFT', yahoo: 'MSFT', twelvedata: 'MSFT', finnhub: 'MSFT' },
        'GOOGL': { polygon: 'GOOGL', yahoo: 'GOOGL', twelvedata: 'GOOGL', finnhub: 'GOOGL' },
        'TSLA': { polygon: 'TSLA', yahoo: 'TSLA', twelvedata: 'TSLA', finnhub: 'TSLA' }
    };

    /**
     * Fetch live INR/USD exchange rate
     */
    static async getExchangeRate() {
        const now = Date.now();
        if (this.exchangeRate && this.exchangeRateUpdatedAt &&
            (now - this.exchangeRateUpdatedAt) < this.EXCHANGE_RATE_CACHE_DURATION) {
            return this.exchangeRate;
        }

        try {
            // Priority: Twelve Data for Exchange Rates
            const tdKey = CONFIG.TWELVEDATA_API_KEY;
            if (tdKey && tdKey !== 'YOUR_TWELVEDATA_API_KEY') {
                const url = `${this.TWELVE_DATA_BASE_URL}/exchange_rate?symbol=USD/INR&apikey=${tdKey}`;
                const response = await fetch(url);
                const data = await response.json();
                if (data.rate) {
                    this.exchangeRate = parseFloat(data.rate);
                    this.exchangeRateUpdatedAt = now;
                    console.log('✅ Exchange rate updated via Twelve Data:', this.exchangeRate);
                    return this.exchangeRate;
                }
            }
        } catch (err) {
            console.warn('Failed to fetch exchange rate via Twelve Data:', err);
        }

        // Fallback to default rate
        this.exchangeRate = 83.5; // Current INR/USD rate
        this.exchangeRateUpdatedAt = now;
        return this.exchangeRate;
    }

    /**
     * Check if we should make a real API call or use cached data
     * Limits expensive APIs to 1-2 calls per day
     */
    static shouldFetchFromAPI(apiName, symbol = '') {
        const now = Date.now();
        const cacheKey = symbol ? `${apiName}_${symbol}` : apiName;
        const lastCall = this.apiCallCache[cacheKey];

        if (!lastCall || (now - lastCall) >= this.API_CACHE_DURATION) {
            this.apiCallCache[cacheKey] = now;
            console.log(`📍 ${cacheKey}: Making API call (last call: ${lastCall ? new Date(lastCall).toLocaleString() : 'never'})`);
            return true;
        }

        const timeSinceLastCall = ((now - lastCall) / (1000 * 60)).toFixed(1); // in minutes
        console.log(`⏱️ ${cacheKey}: Skipping API call (used ${timeSinceLastCall} min ago, wait ${((this.API_CACHE_DURATION - (now - lastCall)) / (1000 * 60)).toFixed(1)}+ min)`);
        return false;
    }

    /**
     * Format gold price for UI (per 10g)
     */
    static formatGoldPrice(pricePerGram) {
        return parseFloat((pricePerGram * 10).toFixed(2));
    }

    /**
     * Format silver price for UI (per 1kg)
     */
    static formatSilverPrice(pricePerGram) {
        return parseFloat((pricePerGram * 1000).toFixed(2));
    }

    /**
     * Sync Market Data
     */
    static async syncMarketData(uid, holdings) {
        if (!uid) return;

        const symbols = new Set(['GOLD', 'SILVER', 'RELIANCE.BSE', 'TCS.BSE']);
        if (holdings) {
            holdings.forEach(h => {
                if (h.type === 'STOCK' || h.type === 'COMMODITY') symbols.add(h.symbol);
            });
        }

        console.log('[Backend] Syncing market data for:', [...symbols]);
        const updates = {};

        // Fetch existing cachedMarketData documents for this user so we can respect DB timestamps
        // This prevents repeated external API calls across reloads and enforces a per-user cache window.
        let existingMap = {};
        try {
            const existingDocs = await DBService.fetchData(uid, 'cachedMarketData');
            existingDocs.forEach(d => { existingMap[d.id] = d; });
        } catch (e) {
            console.warn('[PriceService] Failed to fetch existing cachedMarketData:', e);
        }

        for (const symbol of symbols) {
            try {
                let quoteData;
                const existing = existingMap[symbol];
                const now = Date.now();

                // Commodities (GOLD/SILVER) are expensive; only fetch if cache expired.
                if ((symbol === 'GOLD' || symbol === 'SILVER') && existing && existing.updatedAt) {
                    const lastUpdated = new Date(existing.updatedAt).getTime();
                    if ((now - lastUpdated) < this.API_CACHE_DURATION) {
                        console.log(`[${symbol}] Using DB cachedMarketData (updated ${Math.floor((now - lastUpdated) / 60000)}m ago)`);
                        quoteData = { ...existing, isLive: false };
                    }
                }

                // Stocks/MFs: always attempt fresh quote since Yahoo has no strict limit.
                if (!quoteData) {
                    if (symbol === 'GOLD' || symbol === 'SILVER') {
                        quoteData = await this.fetchCommodityQuote(symbol);
                    } else {
                        quoteData = await this.fetchStockQuote(symbol);
                    }
                }

                updates[symbol] = {
                    ...quoteData,
                    symbol: symbol,
                    updatedAt: new Date().toISOString()
                };

                if (quoteData.isLive) this.cachePriceData(symbol, quoteData);

            } catch (err) {
                console.warn(`[Backend] Error syncing ${symbol}:`, err);
            }
        }

        for (const [sym, data] of Object.entries(updates)) {
            try {
                const existing = existingMap[sym];
                // Avoid writing unchanged cached data repeatedly. Save only when live or price changed.
                if (existing && !data.isLive && existing.price === data.price && PriceService.isPriceDataEqual(existing, data)) {
                    console.log(`↩️ [${sym}] Skipping DB save (unchanged cached price)`);
                    continue;
                }

                console.log(`💾 [${sym}] Saving to Firestore:`, data);
                await DBService.saveData(uid, 'cachedMarketData', sym, data);
                console.log(`✅ [${sym}] Saved to Firestore`);
            } catch (e) {
                console.warn(`Failed saving ${sym} to DB:`, e);
            }
        }

        // Generate portfolio history
        if (holdings && holdings.length > 0) {
            await this.generatePortfolioHistory(uid, holdings, updates);
        }

        return updates;
    }

    /**
     * Fetch Commodity Quote (Gold/Silver)
     * GoldAPI returns INR prices per troy ounce (troy oz)
     * We convert to ₹/gram for internal storage
     * ⚠️ LIMITED TO 1-2 CALLS PER DAY to conserve API quota
     */
    static async fetchCommodityQuote(symbol) {
        console.log(`🔍 [${symbol}] Starting fetchCommodityQuote...`);
        const apiKey = CONFIG.GOLD_API_KEY;
        const metal = this.SYMBOL_MAP[symbol] ? this.SYMBOL_MAP[symbol].goldapi : symbol;
        console.log(`🔍 [${symbol}] Mapped to GoldAPI symbol: ${metal}`);

        if (!apiKey || apiKey === 'YOUR_GOLD_API_KEY') {
            console.warn(`⚠️ GoldAPI key missing for ${symbol}. Using cached price.`);
            return { ...this.lastKnownPrices[symbol], isLive: false };
        }

        // ⏰ Check if we should call the API (max 1-2 times per day per symbol)
        if (!this.shouldFetchFromAPI('GoldAPI', symbol)) {
            console.log(`💾 [${symbol}] Using cached price (within 12-hour window)`);
            return { ...this.lastKnownPrices[symbol], isLive: false };
        }

        try {
            // GoldAPI provides INR price per troy ounce
            const url = `${this.GOLD_API_BASE_URL}/${metal}/INR`;
            console.log(`🌐 [${symbol}] Calling GoldAPI: ${url}`);
            const response = await fetch(url, {
                headers: { 'x-access-token': apiKey, 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error(`GoldAPI status: ${response.status}`);
            const data = await response.json();
            console.log(`✅ [${symbol}] GoldAPI Response:`, data);

            // Convert troy ounce to gram: price_per_troy_oz / 31.1035 = price_per_gram
            const TROY_OZ_TO_GRAM = 31.1035;
            const pricePerGram = data.price / TROY_OZ_TO_GRAM;
            const changePerGram = data.ch / TROY_OZ_TO_GRAM;
            const prevClosePerGram = data.prev_close_price / TROY_OZ_TO_GRAM;

            console.log(`✅ ${symbol}: ${data.price.toFixed(2)}₹/troy oz → ${pricePerGram.toFixed(2)}₹/gram`);

            return {
                price: parseFloat(pricePerGram.toFixed(2)),
                change: parseFloat(changePerGram.toFixed(2)),
                changePercent: data.chp.toFixed(2) + '%',
                prevClose: parseFloat(prevClosePerGram.toFixed(2)),
                high: data.high_price ? (data.high_price / TROY_OZ_TO_GRAM).toFixed(2) : null,
                low: data.low_price ? (data.low_price / TROY_OZ_TO_GRAM).toFixed(2) : null,
                isLive: true,
                source: 'GoldAPI.io'
            };
        } catch (err) {
            console.error(`❌ [${symbol}] GoldAPI error:`, err);
            console.log(`⚠️ [${symbol}] Falling back to alternative source...`);
            return this.fetchQuote(symbol); // Fallback
        }
    }

    /**
     * Fetch Stock Quote with Multi-API Fallback
     * ⚠️ Twelve Data LIMITED TO 1-2 CALLS PER DAY
     */
    static async fetchStockQuote(symbol) {
        // 1. Try Polygon.io (User Requested Priority)
        const polygonData = await this.fetchPolygonQuote(symbol);
        if (polygonData && polygonData.isLive) return polygonData;

        // 2. Try Yahoo Finance (RapidAPI) - Best for India (no daily limit)
        const yahooData = await this.fetchYahooQuote(symbol);
        if (yahooData && yahooData.isLive) return yahooData;

        // 3. Try Twelve Data (LIMITED: only 1-2 calls per day)
        const twelveData = await this.fetchTwelveDataQuote(symbol);
        if (twelveData && twelveData.isLive) return twelveData;

        // 4. Fallback to Finnhub (Original logic)
        return this.fetchQuote(symbol);
    }

    /**
     * Polygon.io Fetch
     * Fetches previous day's close for real-time pricing approximation
     */
    static async fetchPolygonQuote(symbol) {
        const apiKey = CONFIG.POLYGON_API_KEY;
        if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY') return null;

        if (!this.shouldFetchFromAPI('Polygon', symbol)) {
            console.log(`💾 Using cached quote for ${symbol} from Polygon`);
            return null;
        }

        const mapped = this.SYMBOL_MAP[symbol] ? this.SYMBOL_MAP[symbol].polygon : symbol;

        try {
            // Polygon free tier requires 'prev' endpoint for end-of-day data
            const url = `${this.POLYGON_BASE_URL}/${mapped}/prev?adjusted=true&apiKey=${apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            if (!data || data.status !== 'OK' || !data.results || data.results.length === 0) return null;

            const quote = data.results[0];
            const price = quote.c;
            const prevClose = quote.o; // Approximating using open/close of previous day
            const change = price - prevClose;
            const changePercent = prevClose > 0 ? ((change / prevClose) * 100).toFixed(2) + '%' : '0.00%';

            return {
                price: parseFloat(price.toFixed(2)),
                change: parseFloat(change.toFixed(2)),
                changePercent: changePercent,
                prevClose: parseFloat(prevClose.toFixed(2)),
                high: quote.h,
                low: quote.l,
                isLive: true,
                source: 'Polygon.io'
            };
        } catch (err) {
            console.warn('Polygon API failed:', err);
            return null;
        }
    }

    /**
     * Yahoo Finance RapidAPI Fetch
     */
    static async fetchYahooQuote(symbol) {
        const apiKey = CONFIG.RAPIDAPI_KEY;
        if (!apiKey || apiKey === 'YOUR_RAPIDAPI_KEY') return null;

        const mapped = this.SYMBOL_MAP[symbol] ? this.SYMBOL_MAP[symbol].yahoo : symbol;

        try {
            const url = `${this.RAPID_YAHOO_BASE_URL}?ticker=${mapped}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': apiKey,
                    'x-rapidapi-host': 'yahoo-finance15.p.rapidapi.com'
                }
            });

            if (!response.ok) return null;
            const data = await response.json();
            const quote = data.body && data.body[0];

            if (!quote) return null;

            return {
                price: parseFloat(quote.regularMarketPrice.toFixed(2)),
                change: parseFloat(quote.regularMarketChange.toFixed(2)),
                changePercent: quote.regularMarketChangePercent.toFixed(2) + '%',
                prevClose: parseFloat(quote.regularMarketPreviousClose.toFixed(2)),
                high: quote.regularMarketDayHigh,
                low: quote.regularMarketDayLow,
                isLive: true,
                source: 'Yahoo Finance'
            };
        } catch (err) {
            console.warn('Yahoo Finance API failed:', err);
            return null;
        }
    }

    /**
     * Twelve Data Fetch
     * ⚠️ LIMITED TO 1-2 CALLS PER DAY to conserve API quota
     */
    static async fetchTwelveDataQuote(symbol) {
        const apiKey = CONFIG.TWELVEDATA_API_KEY;
        if (!apiKey || apiKey === 'YOUR_TWELVEDATA_API_KEY') return null;

        // ⏰ Check if we should call the API (max 1-2 times per day per symbol)
        if (!this.shouldFetchFromAPI('TwelveData', symbol)) {
            console.log(`💾 Using cached quote for ${symbol} from Twelve Data`);
            return null; // Skip this API call, let fallback handle it
        }

        const mapped = this.SYMBOL_MAP[symbol] ? this.SYMBOL_MAP[symbol].twelvedata : symbol;

        try {
            const url = `${this.TWELVE_DATA_BASE_URL}/quote?symbol=${mapped}&apikey=${apiKey}&country=India`;
            const response = await fetch(url);
            const data = await response.json();

            if (!data || data.status === 'error') return null;

            return {
                price: parseFloat(parseFloat(data.close).toFixed(2)),
                change: parseFloat(parseFloat(data.change).toFixed(2)),
                changePercent: parseFloat(data.percent_change).toFixed(2) + '%',
                prevClose: parseFloat(parseFloat(data.previous_close).toFixed(2)),
                high: data.high,
                low: data.low,
                isLive: true,
                source: 'Twelve Data'
            };
        } catch (err) {
            console.warn('Twelve Data API failed:', err);
            return null;
        }
    }

    /**
     * Fetch Ticker Details from Polygon.io
     * Returns description, market cap, and other company data.
     */
    static async fetchTickerDetails(symbol) {
        const apiKey = CONFIG.POLYGON_API_KEY;
        if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY') return null;

        const mapped = this.SYMBOL_MAP[symbol] ? this.SYMBOL_MAP[symbol].polygon : symbol;

        try {
            const url = `${this.POLYGON_V3_BASE_URL}/tickers/${mapped}?apiKey=${apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            if (!data || data.status !== 'OK' || !data.results) return null;

            return {
                description: data.results.description,
                marketCap: data.results.market_cap,
                homepage: data.results.homepage_url,
                employees: data.results.total_employees,
                logo: data.results.branding ? data.results.branding.logo_url : null,
                source: 'Polygon.io'
            };
        } catch (err) {
            console.warn('Polygon Ticker Details failed:', err);
            return null;
        }
    }

    /**
     * Fetch Ticker News from Polygon.io
     */
    static async fetchTickerNews(symbol, limit = 5) {
        const apiKey = CONFIG.POLYGON_API_KEY;
        if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY') return [];

        const mapped = this.SYMBOL_MAP[symbol] ? this.SYMBOL_MAP[symbol].polygon : symbol;

        try {
            const url = `${this.POLYGON_V3_BASE_URL}/ticker-news?ticker=${mapped}&limit=${limit}&apiKey=${apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            if (!data || data.status !== 'OK' || !data.results) return [];

            return data.results.map(news => ({
                title: news.title,
                author: news.author,
                url: news.article_url,
                published: news.published_utc,
                image: news.image_url,
                summary: news.description
            }));
        } catch (err) {
            console.warn('Polygon Ticker News failed:', err);
            return [];
        }
    }

    /**
     * Original Finnhub Fetch (Tertiary Fallback)
     */
    static async fetchQuote(symbol) {
        const apiKey = CONFIG.FINNHUB_API_KEY;
        const mapped = this.SYMBOL_MAP[symbol] ? this.SYMBOL_MAP[symbol].finnhub : symbol;

        if (!apiKey || apiKey === 'YOUR_FINNHUB_KEY') {
            console.warn('⚠️ Finnhub API key missing. Using mock data.');
            return this.getMockQuote(symbol);
        }

        const url = `${this.FINNHUB_BASE_URL}/quote?symbol=${mapped}&token=${apiKey}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();

            if (data.c === 0 && data.pc === 0) return this.getMockQuote(symbol);

            let price = parseFloat(data.c);
            let prevClose = parseFloat(data.pc);
            let change = parseFloat(data.d);
            const exchangeRate = await this.getExchangeRate();

            if (symbol === 'GOLD' || symbol === 'SILVER') {
                const TROY_OZ_TO_GRAM = 31.1035;
                price = (price * exchangeRate) / TROY_OZ_TO_GRAM;
                prevClose = (prevClose * exchangeRate) / TROY_OZ_TO_GRAM;
                change = (change * exchangeRate) / TROY_OZ_TO_GRAM;
            }

            return {
                price: parseFloat(price.toFixed(2)),
                change: parseFloat(change.toFixed(2)),
                changePercent: parseFloat(data.dp).toFixed(2) + '%',
                prevClose: parseFloat(prevClose.toFixed(2)),
                isLive: true,
                source: 'Finnhub'
            };
        } catch (error) {
            console.error(`❌ Finnhub error for ${symbol}:`, error.message);
            return this.getMockQuote(symbol);
        }
    }

    /**
     * Generate Portfolio History Curve
     */
    static async generatePortfolioHistory(uid, holdings, updates) {
        let portfolioValue = 0;
        let portfolioDayChange = 0;

        holdings.forEach(h => {
            const priceData = updates[h.symbol] || {};
            const currentPrice = priceData.price || h.avgPrice || 0;
            const prevClose = priceData.prevClose || h.avgPrice || 0;

            portfolioValue += currentPrice * h.quantity;
            portfolioDayChange += (currentPrice - prevClose) * h.quantity;
        });

        const historyPoints = [];
        const now = new Date();
        const endTime = now.getTime();
        const startTime = endTime - (12 * 60 * 60 * 1000);

        for (let i = 0; i <= 72; i++) {
            const time = startTime + (i * 10 * 60 * 1000);
            const trend = (portfolioDayChange / 72) * i;
            const volatility = portfolioValue * 0.002;
            const noise = (Math.random() - 0.5) * volatility;

            let pointValue = (portfolioValue - portfolioDayChange) + trend + noise;
            if (i === 72) pointValue = portfolioValue;

            historyPoints.push({ x: time, y: parseFloat(pointValue.toFixed(2)) });
        }

        await DBService.saveData(uid, 'cachedMarketData', 'portfolioHistory', { history: historyPoints });
    }

    /**
     * Update cached price for a symbol 
     */
    static cachePriceData(symbol, priceData) {
        if (priceData && priceData.price) {
            this.lastKnownPrices[symbol] = {
                price: priceData.price,
                change: priceData.change,
                changePercent: priceData.changePercent,
                prevClose: priceData.prevClose,
                source: priceData.source,
                isLive: true
            };
        }
    }

    /**
     * Compare two price data objects for meaningful changes.
     * Only compares fields that affect UI/metrics.
     */
    static isPriceDataEqual(a, b) {
        if (!a || !b) return false;
        const keys = ['price', 'change', 'changePercent', 'prevClose', 'source', 'isLive'];
        for (const k of keys) {
            const va = a[k] === undefined ? null : a[k];
            const vb = b[k] === undefined ? null : b[k];
            if (va !== vb) return false;
        }
        return true;
    }

    /**
     * Fetches historical data from Alpha Vantage for Charts.
     */
    static async fetchHistory(symbol) {
        const apiKey = CONFIG.ALPHA_VANTAGE_API_KEY;
        const mapped = this.SYMBOL_MAP[symbol] ? this.SYMBOL_MAP[symbol].alpha : symbol;
        const type = (symbol === 'GOLD' || symbol === 'SILVER') ? 'COMMODITY' : 'STOCK';

        if (!apiKey || apiKey === 'demo') return this.getMockHistory();

        let url = '';
        if (type === 'COMMODITY') {
            // AV doesn't give nice history for free commodities mostly, but let's try
            // or fallback to a mock for commodities history in this demo if needed.
            // For consistency with stocks in charts, we might treat it like a stock if we use an ETF symbol,
            // but user specified XAUUSD. AV has digital currency or forex for that.
            // Let's stick to STOCK DAILY for stocks.
            return this.getMockHistory(); // AV Commodities are tricky on free tier for history sometimes
        } else {
            url = `${this.ALPHA_BASE_URL}?function=TIME_SERIES_DAILY&symbol=${mapped}&apikey=${apiKey}`;
        }

        try {
            const response = await fetch(url);
            const data = await response.json();
            const series = data['Time Series (Daily)'];

            if (!series) throw new Error("No history data");

            // Format for ApexCharts: [{ x: date, y: [o, h, l, c] }]
            const history = Object.keys(series).slice(0, 30).map(date => {
                const item = series[date];
                return {
                    x: new Date(date).getTime(), // Timestamp for X axis
                    y: [
                        parseFloat(item['1. open']),
                        parseFloat(item['2. high']),
                        parseFloat(item['3. low']),
                        parseFloat(item['4. close'])
                    ]
                };
            }).reverse();

            return history;
        } catch (error) {
            console.error(`AV History error for ${symbol}:`, error);
            return this.getMockHistory();
        }
    }

    static getMockQuote(symbol) {
        // Return cached last-known real prices (realistic market rates - no random volatility)
        if (this.lastKnownPrices[symbol]) {
            return { ...this.lastKnownPrices[symbol], isLive: false };
        }

        // Realistic Indian market prices (per unit)
        const mocks = {
            'RELIANCE.BSE': 2950,
            'TCS.BSE': 4100,
            'INFY.BSE': 4200,
            'HDFCBANK.BSE': 1550
        };
        const base = mocks[symbol] || 1000;

        return {
            price: parseFloat(base.toFixed(2)),
            change: 0,
            changePercent: '0.00%',
            prevClose: base,
            isLive: false, // Mark as mock/cached data
        };
    }

    static getMockHistory() {
        // Generate 30 days of dummy candles
        const data = [];
        let price = 1000;
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (30 - i));
            const open = price;
            const close = price + (Math.random() - 0.5) * 50;
            const high = Math.max(open, close) + Math.random() * 10;
            const low = Math.min(open, close) - Math.random() * 10;
            data.push({
                x: date.getTime(),
                y: [open.toFixed(2), high.toFixed(2), low.toFixed(2), close.toFixed(2)]
            });
            price = close;
        }
        return data;
    }

    /**
     * Get API status string
     */
    static getAPIStatus(isLive) {
        return isLive ? '🟢 Live Data' : '🟡 Cached Data';
    }
}
