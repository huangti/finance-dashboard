/**
 * Macro & Asset Monitoring Dashboard
 * Frontend Application Controller with ECharts Integration
 */

// Global Application State
const AppState = {
    overview: null,
    currentTicker: "^GSPC",
    currentPeriod: "1M",
    macroPeriod: "1M",
    chartType: "line",        // 'line' | 'candlestick'
    showMA: true,
    showVolume: true,
    currentView: "single",    // 'single' | 'macro'
    mainChart: null,
    sparklineCharts: {},
    refreshCountdown: 60,
    timerId: null,
    isRefreshing: false
};

// Document Ready Bootstrap
document.addEventListener("DOMContentLoaded", () => {
    initMainChart();
    bindEvents();
    loadOverviewData();
    startCountdown();
});

// Initialize Main ECharts Canvas
function initMainChart() {
    const chartDom = document.getElementById("main-echart");
    if (!chartDom) return;

    AppState.mainChart = echarts.init(chartDom, "dark", { renderer: "canvas" });
    
    // Responsive Resize
    window.addEventListener("resize", () => {
        if (AppState.mainChart) AppState.mainChart.resize();
        Object.values(AppState.sparklineCharts).forEach(ch => ch && ch.resize());
    });
}

// Bind UI User Interactions
function bindEvents() {
    // 1. Manual Refresh Button
    const refreshBtn = document.getElementById("btn-manual-refresh");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            triggerRefresh(true);
        });
    }

    // 2. View Mode Tabs (Single vs Macro)
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");

            const view = e.currentTarget.dataset.view;
            AppState.currentView = view;

            const singleControls = document.getElementById("single-controls");
            const macroControls = document.getElementById("macro-controls");

            if (view === "single") {
                singleControls.classList.remove("hidden");
                macroControls.classList.add("hidden");
                loadSingleAssetChart();
            } else {
                singleControls.classList.add("hidden");
                macroControls.classList.remove("hidden");
                loadMacroComparisonChart();
            }
        });
    });

    // 3. Asset Selector (Single Mode)
    document.querySelectorAll("#asset-selector .btn-chip").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll("#asset-selector .btn-chip").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            AppState.currentTicker = e.currentTarget.dataset.ticker;
            updateActiveCardHighlight();
            loadSingleAssetChart();
        });
    });

    // 4. Period Selector (Single Mode)
    document.querySelectorAll("#period-selector .btn-period").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll("#period-selector .btn-period").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            AppState.currentPeriod = e.currentTarget.dataset.period;
            loadSingleAssetChart();
        });
    });

    // 5. Period Selector (Macro Mode)
    document.querySelectorAll("#macro-period-selector .btn-period").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll("#macro-period-selector .btn-period").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            AppState.macroPeriod = e.currentTarget.dataset.period;
            loadMacroComparisonChart();
        });
    });

    // 6. Chart Type Selector (Line vs Candlestick)
    document.querySelectorAll("#chart-type-selector .btn-outline").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll("#chart-type-selector .btn-outline").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            AppState.chartType = e.currentTarget.dataset.type;
            loadSingleAssetChart();
        });
    });

    // 7. MA and Volume Toggles
    const toggleMA = document.getElementById("toggle-ma");
    if (toggleMA) {
        toggleMA.addEventListener("change", (e) => {
            AppState.showMA = e.target.checked;
            loadSingleAssetChart();
        });
    }

    const toggleVol = document.getElementById("toggle-volume");
    if (toggleVol) {
        toggleVol.addEventListener("change", (e) => {
            AppState.showVolume = e.target.checked;
            loadSingleAssetChart();
        });
    }
}

// Start 60s Auto Refresh Countdown
function startCountdown() {
    if (AppState.timerId) clearInterval(AppState.timerId);
    
    AppState.refreshCountdown = 60;
    const label = document.getElementById("countdown-label");

    AppState.timerId = setInterval(() => {
        AppState.refreshCountdown--;
        if (label) {
            label.textContent = `自动刷新: ${AppState.refreshCountdown}s`;
        }
        if (AppState.refreshCountdown <= 0) {
            AppState.refreshCountdown = 60;
            triggerRefresh(false);
        }
    }, 1000);
}

// Trigger Data Refresh
async function triggerRefresh(isManual = false) {
    if (AppState.isRefreshing) return;
    AppState.isRefreshing = true;

    const icon = document.getElementById("refresh-icon");
    if (icon) icon.classList.add("spinning");

    try {
        if (isManual) {
            await fetch("/api/refresh", { method: "POST" });
        }
        await loadOverviewData(true);
        if (AppState.currentView === "single") {
            await loadSingleAssetChart(true);
        } else {
            await loadMacroComparisonChart(true);
        }
    } catch (err) {
        console.error("Refresh failed:", err);
    } finally {
        AppState.refreshCountdown = 60;
        AppState.isRefreshing = false;
        if (icon) icon.classList.remove("spinning");
    }
}

// Show/Hide Chart Loading Overlay
function setChartLoading(loading) {
    const overlay = document.getElementById("chart-loading");
    if (!overlay) return;
    if (loading) {
        overlay.classList.remove("fade-out");
    } else {
        overlay.classList.add("fade-out");
    }
}

// Load Overview Summary Cards & Matrix
async function loadOverviewData(force = false) {
    try {
        const res = await fetch(`/api/overview?force=${force}`);
        const data = await res.json();
        AppState.overview = data;

        // Update Header Time
        const updateTimeEl = document.getElementById("last-update-time");
        if (updateTimeEl && data.formatted_time) {
            updateTimeEl.textContent = `最后更新: ${data.formatted_time}`;
        }

        // Render Cards & Matrix Table
        renderMetricCards(data.assets);
        renderMatrixTable(data.assets);

        // Load the initial main chart once overview is loaded
        if (!AppState.mainChartLoaded) {
            AppState.mainChartLoaded = true;
            loadSingleAssetChart();
        }
    } catch (err) {
        console.error("Failed to load overview data:", err);
        const updateTimeEl = document.getElementById("last-update-time");
        if (updateTimeEl) updateTimeEl.textContent = "更新异常，请检查后端网络";
    }
}

// Render Metric Cards
function renderMetricCards(assets) {
    const container = document.getElementById("cards-container");
    if (!container || !assets) return;

    container.innerHTML = "";

    assets.forEach(asset => {
        const isUp = (asset.change || 0) > 0;
        const isZero = (asset.change || 0) === 0;
        const statusClass = isZero ? "neutral" : (isUp ? "up" : "down");
        const changeSign = isUp ? "+" : "";
        const arrow = isZero ? "" : (isUp ? "▲ " : "▼ ");
        const isActive = asset.ticker === AppState.currentTicker;

        // Day range percentage calculation
        let rangePct = 50;
        if (asset.day_high && asset.day_low && asset.day_high > asset.day_low && asset.last_price) {
            rangePct = Math.min(100, Math.max(0, ((asset.last_price - asset.day_low) / (asset.day_high - asset.day_low)) * 100));
        }

        const card = document.createElement("div");
        card.className = `metric-card ${isActive ? "active" : ""}`;
        card.id = `card-${asset.ticker.replace(/[^a-zA-Z0-9]/g, "_")}`;
        card.style.setProperty("--card-theme-color", asset.color);
        card.dataset.ticker = asset.ticker;

        const priceDisplay = asset.last_price !== null ? asset.last_price.toLocaleString() : "--";
        const changeDisplay = asset.change !== null ? `${changeSign}${asset.change}` : "--";
        const changePctDisplay = asset.change_pct !== null ? `${changeSign}${asset.change_pct}%` : "--";

        card.innerHTML = `
            <div class="card-top">
                <div class="asset-badge-group">
                    <span class="asset-badge" style="color: ${asset.color}">${asset.category}</span>
                    <span class="card-asset-name">${asset.name}</span>
                </div>
                <div class="card-top-right">
                    <span class="source-tag" title="数据源: ${asset.source || '官方源/雅虎备用'}">${asset.source_badge || '官方源'}</span>
                    <span class="card-ticker">${asset.ticker}</span>
                </div>
            </div>

            <div class="card-mid">
                <div class="price-row">
                    <span class="asset-price" style="color: ${isZero ? '#fff' : (isUp ? 'var(--color-up)' : 'var(--color-down)')}">
                        ${priceDisplay} <span style="font-size: 13px; font-weight: normal; color: var(--text-muted)">${asset.unit}</span>
                    </span>
                    <span class="change-badge ${statusClass}">
                        ${arrow}${changeDisplay} (${changePctDisplay})
                    </span>
                </div>

                <div class="card-range-wrap">
                    <div class="range-labels">
                        <span>日低: ${asset.day_low !== null ? asset.day_low : '--'}</span>
                        <span>日高: ${asset.day_high !== null ? asset.day_high : '--'}</span>
                    </div>
                    <div class="range-track">
                        <div class="range-fill" style="width: ${rangePct}%;"></div>
                    </div>
                </div>
            </div>

            <div class="sparkline-container" id="sparkline-${asset.ticker.replace(/[^a-zA-Z0-9]/g, "_")}"></div>
        `;

        // Card Click Event
        card.addEventListener("click", () => {
            selectAsset(asset.ticker);
        });

        container.appendChild(card);

        // Render Sparkline for this card
        setTimeout(() => {
            renderSparkline(asset);
        }, 50);
    });
}

// Update Active Card Visual Highlight
function updateActiveCardHighlight() {
    document.querySelectorAll(".metric-card").forEach(c => {
        if (c.dataset.ticker === AppState.currentTicker) {
            c.classList.add("active");
        } else {
            c.classList.remove("active");
        }
    });

    // Sync Asset Button Group
    document.querySelectorAll("#asset-selector .btn-chip").forEach(b => {
        if (b.dataset.ticker === AppState.currentTicker) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });
}

// Select Asset and switch views
function selectAsset(ticker) {
    AppState.currentTicker = ticker;
    updateActiveCardHighlight();

    // If currently in macro view, switch to single view
    if (AppState.currentView !== "single") {
        const singleTab = document.querySelector('.tab-btn[data-view="single"]');
        if (singleTab) singleTab.click();
    } else {
        loadSingleAssetChart();
    }
}

// Render Mini Sparkline Inside Metric Card
function renderSparkline(asset) {
    const domId = `sparkline-${asset.ticker.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const dom = document.getElementById(domId);
    if (!dom || !asset.sparkline || asset.sparkline.length === 0) return;

    if (AppState.sparklineCharts[asset.ticker]) {
        AppState.sparklineCharts[asset.ticker].dispose();
    }

    const chart = echarts.init(dom, null, { renderer: "canvas" });
    AppState.sparklineCharts[asset.ticker] = chart;

    const isUp = (asset.change || 0) >= 0;
    const lineColor = isUp ? "#10b981" : "#f43f5e";

    const option = {
        animation: false,
        grid: { left: 0, right: 0, top: 4, bottom: 2 },
        xAxis: { type: "category", show: false, boundaryGap: false },
        yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
        series: [{
            type: "line",
            data: asset.sparkline,
            smooth: true,
            showSymbol: false,
            lineStyle: { color: lineColor, width: 2 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: isUp ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)" },
                    { offset: 1, color: "rgba(0, 0, 0, 0)" }
                ])
            }
        }]
    };

    chart.setOption(option);
}

// Load and Render Single Asset Detail Chart
async function loadSingleAssetChart(silent = false) {
    if (!AppState.mainChart) return;
    if (!silent) setChartLoading(true);

    try {
        const res = await fetch(`/api/asset/${encodeURIComponent(AppState.currentTicker)}?period=${AppState.currentPeriod}`);
        const data = await res.json();

        renderSingleAssetEChart(data);
    } catch (err) {
        console.error("Failed to load asset history:", err);
    } finally {
        if (!silent) setChartLoading(false);
    }
}

// Render Single Asset EChart Option
function renderSingleAssetEChart(data) {
    if (!AppState.mainChart || !data || !data.timestamps) return;

    const timestamps = data.timestamps;
    const isDaily = data.interval === "1d";
    const isYield = data.is_yield;
    const hasVolume = AppState.showVolume && !isYield && data.volumes && data.volumes.some(v => v > 0);

    // Grid layout: dual grid if volume is enabled, else single grid
    const grid = hasVolume ? [
        { left: "48px", right: "24px", top: "40px", height: "58%" },
        { left: "48px", right: "24px", top: "72%", height: "18%" }
    ] : [
        { left: "48px", right: "24px", top: "40px", bottom: "55px" }
    ];

    const xAxis = hasVolume ? [
        {
            type: "category",
            data: timestamps,
            boundaryGap: AppState.chartType === "candlestick",
            axisLine: { lineStyle: { color: "#334155" } },
            axisLabel: { show: false },
            splitLine: { show: false }
        },
        {
            type: "category",
            gridIndex: 1,
            data: timestamps,
            boundaryGap: AppState.chartType === "candlestick",
            axisLine: { lineStyle: { color: "#334155" } },
            axisLabel: { color: "#94a3b8", fontSize: 11 },
            splitLine: { show: false }
        }
    ] : [
        {
            type: "category",
            data: timestamps,
            boundaryGap: AppState.chartType === "candlestick",
            axisLine: { lineStyle: { color: "#334155" } },
            axisLabel: { color: "#94a3b8", fontSize: 11 },
            splitLine: { show: false }
        }
    ];

    const yAxis = hasVolume ? [
        {
            type: "value",
            scale: true,
            axisLine: { show: false },
            splitLine: { lineStyle: { color: "rgba(255, 255, 255, 0.05)" } },
            axisLabel: {
                color: "#94a3b8",
                formatter: (val) => isYield ? `${val.toFixed(2)}%` : val.toLocaleString()
            }
        },
        {
            type: "value",
            gridIndex: 1,
            scale: true,
            axisLine: { show: false },
            splitLine: { show: false },
            axisLabel: {
                color: "#64748b",
                fontSize: 10,
                formatter: (val) => (val >= 1e9 ? `${(val / 1e9).toFixed(1)}B` : (val >= 1e6 ? `${(val / 1e6).toFixed(0)}M` : `${val}`))
            }
        }
    ] : [
        {
            type: "value",
            scale: true,
            axisLine: { show: false },
            splitLine: { lineStyle: { color: "rgba(255, 255, 255, 0.05)" } },
            axisLabel: {
                color: "#94a3b8",
                formatter: (val) => isYield ? `${val.toFixed(2)}%` : val.toLocaleString()
            }
        }
    ];

    const series = [];

    // 1. Price Series: Candlestick or Line
    if (AppState.chartType === "candlestick" && data.candlestick && data.candlestick.length > 0) {
        series.push({
            name: `${data.name} K线`,
            type: "candlestick",
            data: data.candlestick,
            itemStyle: {
                color: "#10b981",          // 阳线
                color0: "#f43f5e",         // 阴线
                borderColor: "#10b981",
                borderColor0: "#f43f5e"
            }
        });
    } else {
        series.push({
            name: `${data.name} 收盘价`,
            type: "line",
            data: data.closes,
            smooth: 0.15,
            showSymbol: false,
            lineStyle: { width: 2, color: data.color || "#38bdf8" },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: data.color ? `${data.color}40` : "rgba(56, 189, 248, 0.3)" },
                    { offset: 1, color: "rgba(0, 0, 0, 0)" }
                ])
            }
        });
    }

    // 2. Moving Averages (for daily timeframes)
    if (AppState.showMA && isDaily) {
        if (data.ma5 && data.ma5.some(v => v !== null)) {
            series.push({
                name: "MA 5",
                type: "line",
                data: data.ma5,
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 1.5, color: "#38bdf8", opacity: 0.85 }
            });
        }
        if (data.ma20 && data.ma20.some(v => v !== null)) {
            series.push({
                name: "MA 20",
                type: "line",
                data: data.ma20,
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 1.5, color: "#f59e0b", opacity: 0.85 }
            });
        }
    }

    // 3. Volume Bar Chart
    if (hasVolume) {
        series.push({
            name: "成交量",
            type: "bar",
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: data.volumes,
            itemStyle: {
                color: (params) => {
                    const idx = params.dataIndex;
                    if (data.candlestick && data.candlestick[idx]) {
                        // K-line: Close >= Open ? Green : Red
                        const isUpBar = data.candlestick[idx][1] >= data.candlestick[idx][0];
                        return isUpBar ? "rgba(16, 185, 129, 0.6)" : "rgba(244, 63, 94, 0.6)";
                    }
                    return "rgba(56, 189, 248, 0.4)";
                }
            }
        });
    }

    // DataZoom configuration
    const dataZoom = [
        {
            type: "inside",
            xAxisIndex: hasVolume ? [0, 1] : [0],
            start: Math.max(0, 100 - (data.count > 100 ? 50 : 100)),
            end: 100
        },
        {
            type: "slider",
            xAxisIndex: hasVolume ? [0, 1] : [0],
            bottom: "8px",
            height: "18px",
            borderColor: "transparent",
            backgroundColor: "rgba(255, 255, 255, 0.02)",
            fillerColor: "rgba(56, 189, 248, 0.2)",
            handleStyle: { color: "#38bdf8" },
            textStyle: { color: "#64748b" }
        }
    ];

    const option = {
        title: {
            text: `${data.name} · ${data.label}`,
            left: "48px",
            top: "8px",
            textStyle: { color: "#f8fafc", fontSize: 15, fontWeight: "600" },
            subtext: `${data.category} | 代码: ${data.ticker} | 单位: ${data.unit}`,
            subtextStyle: { color: "#94a3b8", fontSize: 11 }
        },
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "cross", lineStyle: { color: "#475569" } },
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            borderColor: "rgba(255, 255, 255, 0.15)",
            textStyle: { color: "#f8fafc", fontSize: 12 },
            formatter: (params) => {
                if (!params || params.length === 0) return "";
                const first = params[0];
                let html = `<div style="font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">📅 ${first.name}</div>`;

                params.forEach(p => {
                    if (p.seriesType === "candlestick") {
                        // [Open, Close, Lowest, Highest]
                        const [o, c, l, h] = p.value.slice(1);
                        html += `
                            <div>开盘: <b>${o}</b></div>
                            <div>收盘: <b>${c}</b></div>
                            <div>最低: <b>${l}</b></div>
                            <div>最高: <b>${h}</b></div>
                        `;
                    } else if (p.seriesName === "成交量") {
                        html += `<div>成交量: <b>${p.value ? p.value.toLocaleString() : 0}</b></div>`;
                    } else {
                        html += `<div>${p.marker} ${p.seriesName}: <b>${p.value !== null && p.value !== undefined ? p.value : '--'}</b></div>`;
                    }
                });
                return html;
            }
        },
        legend: {
            top: "8px",
            right: "24px",
            textStyle: { color: "#94a3b8" }
        },
        grid,
        xAxis,
        yAxis,
        series,
        dataZoom
    };

    AppState.mainChart.clear();
    AppState.mainChart.setOption(option, true);
}

// Load and Render Macro Comparison Chart
async function loadMacroComparisonChart(silent = false) {
    if (!AppState.mainChart) return;
    if (!silent) setChartLoading(true);

    try {
        const res = await fetch(`/api/macro-comparison?period=${AppState.macroPeriod}`);
        const data = await res.json();

        renderMacroComparisonEChart(data);
    } catch (err) {
        console.error("Failed to load macro comparison:", err);
    } finally {
        if (!silent) setChartLoading(false);
    }
}

// Render Cross-Asset Normalized Multi-Line EChart
function renderMacroComparisonEChart(data) {
    if (!AppState.mainChart || !data || !data.timestamps) return;

    const timestamps = data.timestamps;
    const series = [];

    Object.entries(data.series).forEach(([ticker, s]) => {
        series.push({
            name: s.name,
            type: "line",
            data: s.data,
            smooth: 0.15,
            showSymbol: false,
            lineStyle: { width: 2.2, color: s.color },
            itemStyle: { color: s.color }
        });
    });

    // 0% Benchmark baseline
    series.push({
        name: "零基准",
        type: "line",
        data: [],
        markLine: {
            symbol: "none",
            silent: true,
            lineStyle: { color: "rgba(255, 255, 255, 0.3)", type: "dashed", width: 1.5 },
            data: [{ yAxis: 0, label: { formatter: "基准 0%", color: "#94a3b8" } }]
        }
    });

    const option = {
        title: {
            text: `跨资产宏观联动走势对比 · ${data.label}`,
            left: "48px",
            top: "8px",
            textStyle: { color: "#f8fafc", fontSize: 15, fontWeight: "600" },
            subtext: "以所选周期起始价格为 100% 归一化计算累计收益率 (含股指/利率/大宗商品/数字货币/外汇汇率)",
            subtextStyle: { color: "#94a3b8", fontSize: 11 }
        },
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "cross", lineStyle: { color: "#475569" } },
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            borderColor: "rgba(255, 255, 255, 0.15)",
            textStyle: { color: "#f8fafc", fontSize: 12 },
            formatter: (params) => {
                if (!params || params.length === 0) return "";
                let html = `<div style="font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">📅 ${params[0].name}</div>`;
                params.forEach(p => {
                    if (p.seriesName === "零基准" || p.value === undefined) return;
                    const val = p.value;
                    const sign = val > 0 ? "+" : "";
                    const color = val > 0 ? "var(--color-up)" : (val < 0 ? "var(--color-down)" : "#fff");
                    html += `
                        <div style="display: flex; justify-content: space-between; gap: 16px; margin: 2px 0;">
                            <span>${p.marker} ${p.seriesName}:</span>
                            <span style="font-family: var(--font-mono); font-weight: bold; color: ${color}">${sign}${val}%</span>
                        </div>
                    `;
                });
                return html;
            }
        },
        legend: {
            type: "scroll",
            top: "8px",
            right: "24px",
            textStyle: { color: "#94a3b8" },
            pageTextStyle: { color: "#94a3b8" }
        },
        grid: {
            left: "48px",
            right: "32px",
            top: "64px",
            bottom: "55px"
        },
        xAxis: {
            type: "category",
            data: timestamps,
            boundaryGap: false,
            axisLine: { lineStyle: { color: "#334155" } },
            axisLabel: { color: "#94a3b8", fontSize: 11 },
            splitLine: { show: false }
        },
        yAxis: {
            type: "value",
            scale: true,
            axisLine: { show: false },
            splitLine: { lineStyle: { color: "rgba(255, 255, 255, 0.05)" } },
            axisLabel: {
                color: "#94a3b8",
                formatter: (val) => `${val > 0 ? '+' : ''}${val}%`
            }
        },
        series,
        dataZoom: [
            {
                type: "inside",
                start: 0,
                end: 100
            },
            {
                type: "slider",
                bottom: "8px",
                height: "18px",
                borderColor: "transparent",
                backgroundColor: "rgba(255, 255, 255, 0.02)",
                fillerColor: "rgba(56, 189, 248, 0.2)",
                handleStyle: { color: "#38bdf8" },
                textStyle: { color: "#64748b" }
            }
        ]
    };

    AppState.mainChart.clear();
    AppState.mainChart.setOption(option, true);
}

// Render Macro Assets Matrix Table
function renderMatrixTable(assets) {
    const tbody = document.getElementById("matrix-tbody");
    if (!tbody || !assets) return;

    tbody.innerHTML = "";

    assets.forEach(asset => {
        const isUp = (asset.change || 0) > 0;
        const isZero = (asset.change || 0) === 0;
        const colorClass = isZero ? "var(--text-muted)" : (isUp ? "var(--color-up)" : "var(--color-down)");
        const sign = isUp ? "+" : "";

        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.addEventListener("click", () => selectAsset(asset.ticker));

        tr.innerHTML = `
            <td class="ticker-cell" style="color: ${asset.color}">${asset.ticker}</td>
            <td class="name-cell">
                ${asset.name}
                <span class="category-sub">
                    ${asset.category_en || asset.category}
                    <span class="source-tag-sm" title="数据源: ${asset.source || '官方源/雅虎备用'}">${asset.source_badge || '官方源'}</span>
                </span>
            </td>
            <td class="price-cell">
                <b>${asset.last_price !== null ? asset.last_price.toLocaleString() : '--'}</b>
                <span style="font-size: 11px; color: var(--text-muted)">${asset.unit}</span>
            </td>
            <td style="color: ${colorClass}; font-family: var(--font-mono); font-weight: 600;">
                ${asset.change !== null ? `${sign}${asset.change}` : '--'} 
                (${asset.change_pct !== null ? `${sign}${asset.change_pct}%` : '--'})
            </td>
            <td class="tabular-nums" style="color: var(--text-secondary)">
                ${asset.day_low !== null ? asset.day_low : '--'} - ${asset.day_high !== null ? asset.day_high : '--'}
            </td>
            <td class="tabular-nums" style="color: var(--text-secondary)">
                ${asset.year_low !== null ? asset.year_low : '--'} - ${asset.year_high !== null ? asset.year_high : '--'}
            </td>
            <td>
                <span class="role-badge" title="${asset.description}">${asset.category} · ${asset.description.slice(0, 24)}...</span>
            </td>
        `;

        tbody.appendChild(tr);
    });
}
