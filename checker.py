import asyncio
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

BASE_DIR = Path(__file__).resolve().parent
LOCAL_URLS_FILE = BASE_DIR / "urls.txt"
RESULTS_FILE = BASE_DIR / "results.json"

TIMEOUT_MS = 30_000
DEVICE_SELECTOR = "div.device-details-page"
DEVICE_SELECTOR_TIMEOUT_MS = 5_000


def load_urls():
    if not LOCAL_URLS_FILE.exists():
        raise RuntimeError("urls.txt was not found.")

    urls = [
        line.strip()
        for line in LOCAL_URLS_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    urls = list(dict.fromkeys(urls))

    return [{"url": url} for url in urls]


async def check_url(page, item):
    started = time.perf_counter()
    url = item["url"]
    is_device = "eshop/devices" in url

    result = {
        "name": item.get("name", url),
        "url": url,
        "type": "device" if is_device else "static",
        "status": None,
        "final_url": None,
        "title": None,
        "device_details_page_found": None,
        "response_time_ms": None,
        "result": "ERROR",
        "error": None,
    }

    try:
        response = await page.goto(
            url,
            wait_until="domcontentloaded",
            timeout=TIMEOUT_MS,
        )

        result["status"] = response.status if response else None
        result["final_url"] = page.url
        result["title"] = await page.title()

        if not response or response.status != 200:
            result["result"] = "HTTP_ERROR"
            result["error"] = (
                f"Expected HTTP 200, got "
                f"{response.status if response else 'no response'}"
            )
        elif not is_device:
            result["result"] = "OK"
        else:
            try:
                await page.locator(DEVICE_SELECTOR).first.wait_for(
                    state="visible",
                    timeout=DEVICE_SELECTOR_TIMEOUT_MS,
                )
                result["device_details_page_found"] = True
                result["result"] = "OK"
            except PlaywrightTimeoutError:
                result["device_details_page_found"] = False
                result["result"] = "DEVICE_NOT_PUBLISHED"
                result["error"] = (
                    f"{DEVICE_SELECTOR} was not found or visible"
                )

        result["response_time_ms"] = round(
            (time.perf_counter() - started) * 1000
        )

    except PlaywrightTimeoutError:
        result["result"] = "TIMEOUT"
        result["error"] = f"Timed out after {TIMEOUT_MS} ms"
        result["final_url"] = page.url
        result["response_time_ms"] = round(
            (time.perf_counter() - started) * 1000
        )

    except Exception as exc:
        result["result"] = "ERROR"
        result["error"] = str(exc)
        result["final_url"] = page.url
        result["response_time_ms"] = round(
            (time.perf_counter() - started) * 1000
        )

    return result


async def main():
    items = load_urls()
    results = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        page = await browser.new_page()

        for item in items:
            print(f"Checking: {item['url']}")
            result = await check_url(page, item)
            results.append(result)
            print(
                f"  {result['result']} | "
                f"{result['status']} | "
                f"{result['final_url']}"
            )

        await browser.close()

    payload = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "count": len(results),
        "results": results,
    }

    RESULTS_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nSaved {len(results)} results to {RESULTS_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
