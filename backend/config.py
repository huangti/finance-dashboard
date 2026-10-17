"""
Configuration file for Macro & Asset Monitoring Dashboard.
Defines core monitored assets, chart intervals, colors, and cache configurations.
"""

from typing import Dict, Any

CACHE_TTL_SECONDS = 60

# Monitored Core Assets Configuration in strict display order
ASSETS: Dict[str, Dict[str, Any]] = {
    "^GSPC": {
        "ticker": "^GSPC",
        "name": "标普 500 指数",
        "en_name": "S&P 500",
        "category": "美股大盘",
        "category_en": "US Equities",
        "unit": "点",
        "precision": 2,
        "is_yield": False,
        "color": "#38BDF8",  # Sky Blue
        "description": "反映美国500家龙头上市公司的综合表现，全球宏观权益资产核心基准。",
    },
    "^NDX": {
        "ticker": "^NDX",
        "name": "纳斯达克 100 指数",
        "en_name": "Nasdaq 100",
        "category": "科技龙头",
        "category_en": "Tech & Growth",
        "unit": "点",
        "precision": 2,
        "is_yield": False,
        "color": "#A855F7",  # Purple
        "description": "汇聚全球顶尖软硬件、半导体与人工智能龙头企业，全球风险偏好风向标。",
    },
    "^RUT": {
        "ticker": "^RUT",
        "name": "罗素 2000 指数",
        "en_name": "Russell 2000",
        "category": "美股小盘",
        "category_en": "US Small Cap",
        "unit": "点",
        "precision": 2,
        "is_yield": False,
        "color": "#06B6D4",  # Cyan
        "description": "美股中小市值公司代表指数，高度敏锐反映美国国内实体经济景气度与信用环境。",
    },
    "^TNX": {
        "ticker": "^TNX",
        "name": "10年期美债收益率",
        "en_name": "US 10Y Treasury Yield",
        "category": "宏观利率",
        "category_en": "Macro Benchmark",
        "unit": "%",
        "precision": 3,
        "is_yield": True,
        "color": "#F43F5E",  # Rose / Crimson
        "description": "全球资产定价之锚，反映市场对实际利率、通胀走势与美联储货币政策预期。",
    },
    "CL=F": {
        "ticker": "CL=F",
        "name": "WTI 原油期货",
        "en_name": "Crude Oil (WTI)",
        "category": "大宗商品",
        "category_en": "Commodities & Energy",
        "unit": "美元/桶",
        "precision": 2,
        "is_yield": False,
        "color": "#F97316",  # Warm Orange
        "description": "全球工业之母与核心大宗商品，反映全球制造业与出行需求、地缘博弈与输入性通胀。",
    },
    "GC=F": {
        "ticker": "GC=F",
        "name": "COMEX 黄金期货",
        "en_name": "Gold Futures",
        "category": "避险/商品",
        "category_en": "Commodities & Safe Haven",
        "unit": "美元/盎司",
        "precision": 2,
        "is_yield": False,
        "color": "#EAB308",  # Amber Gold
        "description": "避险资产与抗通胀硬通货，反映全球地缘政治风险、流动性及法币信用评估。",
    },
    "BTC-USD": {
        "ticker": "BTC-USD",
        "name": "比特币",
        "en_name": "Bitcoin (BTC/USD)",
        "category": "数字资产",
        "category_en": "Digital Assets",
        "unit": "美元",
        "precision": 2,
        "is_yield": False,
        "color": "#10B981",  # Emerald Green
        "description": "新兴数字黄金与高贝塔流动性风向标，反映全球超额流动性、风险偏好与去中心化资产配置需求。",
    },
    "USDCNY=X": {
        "ticker": "USDCNY=X",
        "name": "美元兑人民币",
        "en_name": "USD / CNY",
        "category": "外汇汇率",
        "category_en": "FX & Currencies",
        "unit": "汇率",
        "precision": 4,
        "is_yield": False,
        "color": "#EC4899",  # Hot Pink
        "description": "衡量中美经济周期分化、进出口贸易景气度与中美利差的核心汇率定价指标。",
    },
}

# Period to interval mapping
PERIOD_INTERVAL_MAP = {
    "1D": {"period": "1d", "interval": "5m", "label": "分时 1日"},
    "5D": {"period": "5d", "interval": "15m", "label": "分时 5日"},
    "1M": {"period": "1mo", "interval": "1d", "label": "日线 1月"},
    "6M": {"period": "6mo", "interval": "1d", "label": "日线 6月"},
    "1Y": {"period": "1y", "interval": "1d", "label": "日线 1年"},
}
