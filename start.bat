@echo off
chcp 65001 >nul
title 全球宏观与核心资产监控看板
cd /d "%~dp0"

echo ======================================================
echo   全球宏观与核心资产监控看板 (Macro Monitor)
echo ======================================================
echo [*] 正在启动本地服务并打开浏览器...
echo [*] 本地访问地址: http://127.0.0.1:8000
echo [*] 接口文档地址: http://127.0.0.1:8000/docs
echo ======================================================

where python >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 并添加到系统环境变量。
    pause
    exit /b 1
)

python run.py
if errorlevel 1 (
    echo.
    echo [提示] 服务已停止或启动异常。
    pause
)
