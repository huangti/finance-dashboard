"""
Launcher script for Macro & Asset Monitoring Dashboard.
Starts the local FastAPI backend server using Uvicorn.
"""

import sys
import webbrowser
import threading
import time
import uvicorn

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def open_browser_after_start(url: str, delay: float = 1.2):
    def _open():
        time.sleep(delay)
        print(f"\n[*] 正在自动打开看板网页: {url}")
        try:
            webbrowser.open(url)
        except Exception as e:
            print(f"[!] 无法自动打开浏览器: {e}")

    thread = threading.Thread(target=_open, daemon=True)
    thread.start()

def main():
    host = "127.0.0.1"
    port = 8000
    url = f"http://{host}:{port}"

    print("=" * 60)
    print("  [+] 全球宏观与核心资产监控看板 (Macro & Asset Monitor MVP)")
    print("=" * 60)
    print(f"[*] 监控资产: 标普500 | 纳指100 | 罗素2000 | 10Y美债 | WTI原油 | 黄金 | 比特币 | 美元/人民币")
    print(f"[*] 本地运行地址: {url}")
    print(f"[*] API 文档地址: {url}/docs")
    print("=" * 60)

    # Automatically open local browser in desktop environment
    if "--no-browser" not in sys.argv:
        open_browser_after_start(url)

    uvicorn.run("backend.main:app", host=host, port=port, reload=False, log_level="info")

if __name__ == "__main__":
    main()
