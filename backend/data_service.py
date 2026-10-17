"""
Data Service layer for fetching, processing, and caching market data using yfinance.
"""

import time
import math
import logging
from typing import Dict, Any, List, Optional
import pandas as pd
import yfinance as yf
from backend.config import ASSETS, PERIOD_INTERVAL_MAP, CACHE_TTL_SECONDS

logger = logging.getLogger(__name__)

class MarketDataService:
    def __init__(self):
        # In-memory caches: key -> {"timestamp": float, "data": Any}
        self._cache: Dict[str, Dict[str, Any]] = {}

    def _get_from_cache(self, key: str, max_age: float = CACHE_TTL_SECONDS) -> Optional[Any]:
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["timestamp"] < max_age:
                return entry["data"]
        return None

    def _set_cache(self, key: str, data: Any):
        self._cache[key] = {
            "timestamp": time.time(),
            "data": data
        }

    def clear_cache(self):
        self._cache.clear()

    @staticmethod
    def _clean_number(val: Any, precision: int = 2) -> Optional[float]:
        """Sanitize floats, handling NaN/inf/None gracefully."""
        if val is None or pd.isna(val) or math.isinf(val):
            return None
        return round(float(val), precision)

    def get_overview(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Fetch summary cards data for all monitored assets, including sparkline points.
        """
        cache_key = "overview_summary"
        if not force_refresh:
            cached = self._get_from_cache(cache_key)
    @staticmethod
    def _fetch_coinbase_btc() -> Optional[Dict[str, Any]]:
        try:
            import requests
            r = requests.get("https://api.exchange.coinbase.com/products/BTC-USD/stats", timeout=3, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200:
                d = r.json()
                last = float(d.get("last", 0))
                open_p = float(d.get("open", 0))
                if last and open_p:
                    chg = last - open_p
                    return {
                        "last_price": last,
                        "prev_close": open_p,
                        "change": chg,
                        "change_pct": (chg / open_p) * 100,
                        "day_high": float(d.get("high", 0)),
                        "day_low": float(d.get("low", 0)),
                        "source": "Coinbase Exchange (官方合规源)",
                        "source_badge": "Coinbase"
                    }
        except Exception:
            pass
        return None

    @staticmethod
    def _fetch_official_usdcny() -> Optional[Dict[str, Any]]:
        try:
            import requests
            r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=3, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200:
                d = r.json()
                rate = d.get("rates", {}).get("CNY")
                if rate:
                    return {
                        "last_price": float(rate),
                        "source": "ECB / 欧洲央行外汇基准 (官方源)",
                        "source_badge": "ECB官方"
                    }
        except Exception:
            pass
        return None

    @staticmethod
    def _fetch_fred_10y() -> Optional[Dict[str, Any]]:
        try:
            import requests
            r = requests.get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10", timeout=3, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200:
                lines = r.text.strip().split("\n")
                valid = []
                for l in lines[1:]:
                    parts = l.strip().split(",")
                    if len(parts) >= 2:
                        try:
                            valid.append(float(parts[1]))
                        except ValueError:
                            pass
                if len(valid) >= 2:
                    last = valid[-1]
                    prev = valid[-2]
                    chg = last - prev
                    return {
                        "last_price": last,
                        "prev_close": prev,
                        "change": chg,
                        "change_pct": (chg / prev) * 100 if prev else 0,
                        "source": "美联储 FRED 圣路易斯联储 (官方源)",
                        "source_badge": "美联储FRED"
                    }
        except Exception:
            pass
        return None

    def get_overview(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Fetch summary cards data for all monitored assets, including sparkline points.
        Uses high-quota official sources as primary and Yahoo Finance as resilient fallback.
        """
        cache_key = "overview_summary"
        if not force_refresh:
            cached = self._get_from_cache(cache_key)
            if cached:
                return cached

        results = []
        for ticker, meta in ASSETS.items():
            precision = meta.get("precision", 2)
            primary_data = None

            # 1. Try high-quota official primary sources
            if ticker == "BTC-USD":
                primary_data = self._fetch_coinbase_btc()
            elif ticker == "USDCNY=X":
                primary_data = self._fetch_official_usdcny()
            elif ticker == "^TNX":
                primary_data = self._fetch_fred_10y()

            try:
                # 2. Fetch history & fallback from Yahoo
                tk = yf.Ticker(ticker)
                
                # Fetch recent history (5d with 15m intervals for intraday & sparkline)
                hist_recent = tk.history(period="5d", interval="15m")
                if hist_recent.empty:
                    # Fallback to 1mo daily if intraday empty
                    hist_recent = tk.history(period="1mo", interval="1d")

                # Try reading fast_info
                fi = getattr(tk, "fast_info", None)
                last_price = getattr(fi, "last_price", None) if fi else None
                prev_close = getattr(fi, "previous_close", None) if fi else None
                year_high = getattr(fi, "year_high", None) if fi else None
                year_low = getattr(fi, "year_low", None) if fi else None
                day_high = getattr(fi, "day_high", None) if fi else None
                day_low = getattr(fi, "day_low", None) if fi else None

                # Fallback to history dataframe if fast_info missing
                if (last_price is None or pd.isna(last_price)) and not hist_recent.empty:
                    last_price = hist_recent["Close"].iloc[-1]
                if (day_high is None or pd.isna(day_high)) and not hist_recent.empty:
                    day_high = hist_recent["High"].iloc[-1]
                if (day_low is None or pd.isna(day_low)) and not hist_recent.empty:
                    day_low = hist_recent["Low"].iloc[-1]
                if (prev_close is None or pd.isna(prev_close)) and len(hist_recent) >= 2:
                    prev_close = hist_recent["Close"].iloc[-2]

                # If primary data was successfully fetched, override quote fields
                if primary_data:
                    last_price = primary_data.get("last_price", last_price)
                    prev_close = primary_data.get("prev_close", prev_close)
                    if "day_high" in primary_data:
                        day_high = primary_data["day_high"]
                    if "day_low" in primary_data:
                        day_low = primary_data["day_low"]

                # Compute change and change percentage
                change = primary_data.get("change") if primary_data else None
                change_pct = primary_data.get("change_pct") if primary_data else None
                if change is None and last_price is not None and prev_close is not None and prev_close != 0:
                    change = last_price - prev_close
                    change_pct = (change / prev_close) * 100

                # Generate mini sparkline values (up to last 30 data points)
                sparkline = []
                if not hist_recent.empty:
                    recent_closes = hist_recent["Close"].dropna().tail(30).tolist()
                    sparkline = [round(float(c), precision) for c in recent_closes]

                last_updated = ""
                if not hist_recent.empty:
                    last_dt = hist_recent.index[-1]
                    last_updated = last_dt.strftime("%Y-%m-%d %H:%M")

                source = primary_data.get("source") if primary_data else "雅虎财经多节点镜像 (备用源)"
                source_badge = primary_data.get("source_badge") if primary_data else "雅虎备用"

                results.append({
                    "ticker": ticker,
                    "name": meta["name"],
                    "en_name": meta["en_name"],
                    "category": meta["category"],
                    "category_en": meta["category_en"],
                    "unit": meta["unit"],
                    "is_yield": meta["is_yield"],
                    "color": meta["color"],
                    "description": meta["description"],
                    "last_price": self._clean_number(last_price, precision),
                    "prev_close": self._clean_number(prev_close, precision),
                    "change": self._clean_number(change, precision),
                    "change_pct": self._clean_number(change_pct, 2),
                    "day_high": self._clean_number(day_high, precision),
                    "day_low": self._clean_number(day_low, precision),
                    "year_high": self._clean_number(year_high, precision),
                    "year_low": self._clean_number(year_low, precision),
                    "sparkline": sparkline,
                    "last_updated": last_updated,
                    "status": "up" if (change or 0) > 0 else ("down" if (change or 0) < 0 else "neutral"),
                    "source": source,
                    "source_badge": source_badge
                })
            except Exception as e:
                logger.error(f"Error fetching overview for {ticker}: {e}")
                if primary_data:
                    results.append({
                        "ticker": ticker,
                        "name": meta["name"],
                        "en_name": meta["en_name"],
                        "category": meta["category"],
                        "unit": meta["unit"],
                        "is_yield": meta["is_yield"],
                        "color": meta["color"],
                        "description": meta["description"],
                        "last_price": self._clean_number(primary_data.get("last_price"), precision),
                        "prev_close": self._clean_number(primary_data.get("prev_close"), precision),
                        "change": self._clean_number(primary_data.get("change"), precision),
                        "change_pct": self._clean_number(primary_data.get("change_pct"), 2),
                        "sparkline": [self._clean_number(primary_data.get("last_price"), precision)],
                        "source": primary_data.get("source"),
                        "source_badge": primary_data.get("source_badge"),
                        "status": "up" if (primary_data.get("change") or 0) > 0 else "down"
                    })
                else:
                    results.append({
                        "ticker": ticker,
                        "name": meta["name"],
                        "en_name": meta["en_name"],
                        "category": meta["category"],
                        "unit": meta["unit"],
                        "is_yield": meta["is_yield"],
                        "color": meta["color"],
                        "description": meta["description"],
                        "last_price": None,
                        "change": None,
                        "change_pct": None,
                        "sparkline": [],
                        "error": str(e),
                        "source": "重试中",
                        "source_badge": "重试"
                    })


        output = {
            "timestamp": time.time(),
            "formatted_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "assets": results
        }
        self._set_cache(cache_key, output)
        return output

    def get_asset_history(self, ticker: str, period: str = "1M", force_refresh: bool = False) -> Dict[str, Any]:
        """
        Fetch detailed historical OHLCV, moving averages, and metadata for a specific asset.
        Supported periods: 1D, 5D, 1M, 6M, 1Y.
        """
        if ticker not in ASSETS:
            raise ValueError(f"Ticker {ticker} not found in monitored assets.")

        period_key = period.upper()
        if period_key not in PERIOD_INTERVAL_MAP:
            period_key = "1M"

        cache_key = f"history_{ticker}_{period_key}"
        if not force_refresh:
            cached = self._get_from_cache(cache_key)
            if cached:
                return cached

        meta = ASSETS[ticker]
        precision = meta.get("precision", 2)
        cfg = PERIOD_INTERVAL_MAP[period_key]

        tk = yf.Ticker(ticker)
        df = tk.history(period=cfg["period"], interval=cfg["interval"])

        if df.empty and period_key == "1D":
            # If 1D is empty (e.g. market closed, weekend), try 5D with 15m
            df = tk.history(period="5d", interval="15m")
            if not df.empty:
                # Take the latest available single trading day
                latest_date = df.index[-1].date()
                df = df[df.index.date == latest_date]

        if df.empty:
            return {
                "ticker": ticker,
                "name": meta["name"],
                "period": period_key,
                "timestamps": [],
                "candlestick": [],
                "closes": [],
                "volumes": [],
                "ma5": [],
                "ma20": []
            }

        # Calculate Moving Averages for daily intervals
        is_daily = cfg["interval"] == "1d"
        ma5_series = df["Close"].rolling(window=5).mean() if is_daily else pd.Series(index=df.index, dtype=float)
        ma20_series = df["Close"].rolling(window=20).mean() if is_daily else pd.Series(index=df.index, dtype=float)

        timestamps = []
        candlestick = []  # ECharts format: [Open, Close, Lowest, Highest]
        closes = []
        volumes = []
        ma5_list = []
        ma20_list = []

        for idx, row in df.iterrows():
            # Format timestamp
            if cfg["interval"] == "1d":
                ts_str = idx.strftime("%Y-%m-%d")
            else:
                ts_str = idx.strftime("%m-%d %H:%M")

            o = self._clean_number(row.get("Open"), precision)
            c = self._clean_number(row.get("Close"), precision)
            l = self._clean_number(row.get("Low"), precision)
            h = self._clean_number(row.get("High"), precision)
            vol = int(row.get("Volume", 0)) if not pd.isna(row.get("Volume")) else 0

            if c is not None:
                timestamps.append(ts_str)
                candlestick.append([o or c, c, l or c, h or c])
                closes.append(c)
                volumes.append(vol)

                m5 = ma5_series.loc[idx] if idx in ma5_series.index else None
                m20 = ma20_series.loc[idx] if idx in ma20_series.index else None

                ma5_list.append(self._clean_number(m5, precision) if not pd.isna(m5) else None)
                ma20_list.append(self._clean_number(m20, precision) if not pd.isna(m20) else None)

        response = {
            "ticker": ticker,
            "name": meta["name"],
            "en_name": meta["en_name"],
            "category": meta["category"],
            "unit": meta["unit"],
            "is_yield": meta["is_yield"],
            "color": meta["color"],
            "period": period_key,
            "interval": cfg["interval"],
            "label": cfg["label"],
            "timestamps": timestamps,
            "candlestick": candlestick,
            "closes": closes,
            "volumes": volumes,
            "ma5": ma5_list,
            "ma20": ma20_list,
            "count": len(timestamps)
        }

        self._set_cache(cache_key, response)
        return response

    def get_macro_comparison(self, period: str = "1M", force_refresh: bool = False) -> Dict[str, Any]:
        """
        Cross-Asset Macro Comparison:
        Fetches historical data for all 4 assets, normalizes to percentage return (%)
        starting from the beginning of the period: return = (P_t / P_0 - 1) * 100%.
        """
        period_key = period.upper()
        if period_key not in PERIOD_INTERVAL_MAP:
            period_key = "1M"

        cache_key = f"macro_comparison_{period_key}"
        if not force_refresh:
            cached = self._get_from_cache(cache_key)
            if cached:
                return cached

        cfg = PERIOD_INTERVAL_MAP[period_key]
        series_dict = {}
        all_timestamps_set = set()
        timestamp_to_val = {t: {} for t in ASSETS.keys()}

        for ticker, meta in ASSETS.items():
            try:
                tk = yf.Ticker(ticker)
                df = tk.history(period=cfg["period"], interval=cfg["interval"])
                if df.empty and period_key == "1D":
                    df = tk.history(period="5d", interval="15m")
                    if not df.empty:
                        df = df[df.index.date == df.index[-1].date()]

                if not df.empty:
                    df = df.dropna(subset=["Close"])
                    if not df.empty:
                        base_val = df["Close"].iloc[0]
                        for idx, row in df.iterrows():
                            ts_str = idx.strftime("%Y-%m-%d") if cfg["interval"] == "1d" else idx.strftime("%m-%d %H:%M")
                            cur_val = row["Close"]
                            pct_ret = ((cur_val / base_val) - 1.0) * 100.0 if base_val else 0.0
                            all_timestamps_set.add(ts_str)
                            timestamp_to_val[ticker][ts_str] = round(pct_ret, 2)
            except Exception as e:
                logger.error(f"Error fetching comparison for {ticker}: {e}")

        sorted_timestamps = sorted(list(all_timestamps_set))

        # Fill forward missing values for smooth curves across different market holidays
        asset_curves = {}
        for ticker, meta in ASSETS.items():
            curve = []
            last_known = 0.0
            t_data = timestamp_to_val.get(ticker, {})
            for ts in sorted_timestamps:
                if ts in t_data:
                    last_known = t_data[ts]
                    curve.append(last_known)
                else:
                    curve.append(last_known)

            asset_curves[ticker] = {
                "name": meta["name"],
                "short_name": meta["name"].split(" ")[0],
                "color": meta["color"],
                "data": curve
            }

        response = {
            "period": period_key,
            "label": cfg["label"],
            "timestamps": sorted_timestamps,
            "series": asset_curves
        }

        self._set_cache(cache_key, response)
        return response


# Singleton instance
market_data_service = MarketDataService()
