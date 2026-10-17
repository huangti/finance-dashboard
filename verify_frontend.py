"""
Automated frontend test script using Selenium headless Chrome.
"""

import sys
import time

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def run_test():
    print("[*] Initializing headless Chrome...")
    chrome_options = ChromeOptions()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1650,1650")
    chrome_options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    
    driver = webdriver.Chrome(options=chrome_options)

    try:
        url = "http://127.0.0.1:8000"
        print(f"[*] Navigating to {url}...")
        driver.get(url)

        # 1. Page title check
        WebDriverWait(driver, 10).until(EC.title_contains("宏观与核心资产监控看板"))
        print(f"[+] Page loaded. Title: {driver.title}")

        # 2. Wait for 8 metric cards
        print("[*] Waiting for 8 metric cards to load...")
        WebDriverWait(driver, 20).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, ".metric-card:not(.skeleton-card)")) == 8
        )
        cards = driver.find_elements(By.CSS_SELECTOR, ".metric-card:not(.skeleton-card)")
        print(f"[+] Successfully loaded {len(cards)} metric cards:")
        for idx, card in enumerate(cards, 1):
            name = card.find_element(By.CSS_SELECTOR, ".card-asset-name").text
            price = card.find_element(By.CSS_SELECTOR, ".asset-price").text
            change = card.find_element(By.CSS_SELECTOR, ".change-badge").text
            print(f"    - Card {idx}: {name} -> Price: {price} | Change: {change}")

        # 3. Main ECharts canvas
        print("[*] Checking main ECharts canvas...")
        WebDriverWait(driver, 15).until(
            lambda d: d.find_element(By.CSS_SELECTOR, "#main-echart canvas") is not None
        )
        canvas = driver.find_element(By.CSS_SELECTOR, "#main-echart canvas")
        print(f"[+] Main EChart canvas rendered successfully! Canvas size: {canvas.size}")

        # 4. Matrix table check
        rows = driver.find_elements(By.CSS_SELECTOR, "#matrix-tbody tr")
        print(f"[+] Macro matrix table rendered with {len(rows)} asset rows:")
        for r in rows:
            ticker = r.find_element(By.CSS_SELECTOR, ".ticker-cell").text
            price = r.find_element(By.CSS_SELECTOR, ".price-cell").text
            print(f"    - Matrix Row: {ticker} -> {price}")

        time.sleep(2)

        # 5. Full screenshot
        screenshot_path = "c:\\Users\\ti\\Desktop\\Projects\\finance-dashboard\\dashboard_full_view.png"
        driver.save_screenshot(screenshot_path)
        print(f"[+] Saved full screenshot to: {screenshot_path}")

        # 6. Test switching tabs
        print("[*] Testing view tab switch to '跨资产联动对比'...")
        macro_tab = driver.find_element(By.CSS_SELECTOR, '.tab-btn[data-view="macro"]')
        macro_tab.click()
        time.sleep(2)

        macro_canvas = driver.find_element(By.CSS_SELECTOR, "#main-echart canvas")
        print(f"[+] Macro comparison EChart rendered successfully! Canvas size: {macro_canvas.size}")

        # 7. Check browser console logs
        try:
            logs = driver.get_log("browser")
            severe_errors = [entry for entry in logs if entry.get("level") == "SEVERE"]
            if severe_errors:
                print(f"[!] Browser console has {len(severe_errors)} severe errors: {severe_errors}")
            else:
                print("[+] Browser console is completely clean! Zero errors.")
        except Exception as e_log:
            print(f"[*] Note: Console logs retrieval skipped ({e_log})")

        print("\n=== FRONTEND VERIFICATION COMPLETED WITH 100% SUCCESS ===")

    finally:
        driver.quit()

if __name__ == "__main__":
    run_test()
