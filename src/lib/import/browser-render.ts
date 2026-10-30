/**
 * Headless-browser rendering for share pages that only exist after JavaScript
 * runs (Gemini, and other single-page apps). A plain HTTP fetch returns an
 * empty shell for these, so we load the page in a real browser and read the DOM.
 *
 * Browser source:
 *   - Production / serverless: @sparticuz/chromium (a Lambda-sized Chromium).
 *   - Local dev: CHROME_PATH, or an installed Chrome / Edge / Chromium.
 */
import { existsSync } from "node:fs"
import type { Browser, Page } from "puppeteer-core"

export class BrowserUnavailableError extends Error {}

const LOCAL_BROWSERS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((p): p is string => !!p)

async function launch(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

  if (serverless) {
    const chromium = (await import("@sparticuz/chromium")).default
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    })
  }

  const executablePath = LOCAL_BROWSERS.find((p) => existsSync(p))
  if (!executablePath) {
    throw new BrowserUnavailableError(
      "No Chrome/Edge found for rendering. Install Chrome or set CHROME_PATH to a browser executable."
    )
  }
  return puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu"] })
}

/**
 * Opens `url` in a headless browser, waits for `readySelector`, then runs `fn`
 * inside the page and returns its (JSON-serialisable) result.
 * `script` is a plain JS expression string (not a function) so bundlers can't inject
 * helpers like `__name` into code that has to run in the page.
 * `isAllowedFinalUrl` is checked after redirects so we never read an unexpected site.
 */
export async function renderAndRun<T>(
  url: string,
  options: {
    readySelector: string
    isAllowedFinalUrl: (finalUrl: URL) => boolean
    timeoutMs?: number
  },
  script: string
): Promise<T> {
  const timeout = options.timeoutMs ?? 25_000
  const browser = await launch()
  try {
    const page: Page = await browser.newPage()
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
    // Text is all we need — skip heavy assets so pages render fast.
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const type = req.resourceType()
      if (type === "image" || type === "media" || type === "font") void req.abort()
      else void req.continue()
    })

    await page.goto(url, { waitUntil: "domcontentloaded", timeout })
    if (!options.isAllowedFinalUrl(new URL(page.url()))) {
      throw new Error("Redirected to an unsupported site")
    }
    await page.waitForSelector(options.readySelector, { timeout })
    // Let streamed/lazy turns finish rendering.
    await new Promise((r) => setTimeout(r, 1200))
    return (await page.evaluate(script)) as T
  } finally {
    await browser.close().catch(() => {})
  }
}
