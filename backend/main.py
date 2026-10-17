"""
FastAPI Backend Entrypoint for Macro & Asset Monitoring Dashboard.
Serves REST API and static frontend assets.
"""

import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response

from backend.config import ASSETS, PERIOD_INTERVAL_MAP
from backend.data_service import market_data_service

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="Macro & Asset Monitoring Dashboard API",
    description="Local Financial & Macroeconomic Asset Monitoring Backend",
    version="1.0.0"
)

@app.get("/favicon.ico", include_in_schema=False)
async def get_favicon():
    svg_icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📈</text></svg>'
    return Response(content=svg_icon, media_type="image/svg+xml")


# Enable CORS for local cross-origin development if needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/overview")
async def get_overview(force: bool = Query(False, description="Force bypass cache")):
    """
    Get current summary cards for all monitored assets (Price, Change, High, Low, Sparkline).
    """
    try:
        data = market_data_service.get_overview(force_refresh=force)
        return JSONResponse(content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/asset/{ticker:path}")
async def get_asset_history(
    ticker: str,
    period: str = Query("1M", description="Time period: 1D, 5D, 1M, 6M, 1Y"),
    force: bool = Query(False, description="Force bypass cache")
):
    """
    Get historical price series, candlestick data, volume and moving averages for a specific asset.
    """
    if ticker not in ASSETS:
        raise HTTPException(status_code=404, detail=f"Asset ticker '{ticker}' is not recognized.")
    
    try:
        data = market_data_service.get_asset_history(ticker, period=period, force_refresh=force)
        return JSONResponse(content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/macro-comparison")
async def get_macro_comparison(
    period: str = Query("1M", description="Comparison time period: 1D, 5D, 1M, 6M, 1Y"),
    force: bool = Query(False, description="Force bypass cache")
):
    """
    Get normalized percentage return curves for all 4 assets on a unified timeline.
    """
    try:
        data = market_data_service.get_macro_comparison(period=period, force_refresh=force)
        return JSONResponse(content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/refresh")
async def refresh_all():
    """
    Clear cache and fetch latest overview data.
    """
    market_data_service.clear_cache()
    data = market_data_service.get_overview(force_refresh=True)
    return JSONResponse(content={"status": "refreshed", "data": data})


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "macro-asset-monitor",
        "monitored_tickers": list(ASSETS.keys())
    }


# Mount static folder
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def serve_index():
    """Serve the single page dashboard frontend."""
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        return JSONResponse(
            status_code=404,
            content={"message": "Frontend index.html not found in static folder."}
        )
    return FileResponse(index_file)
