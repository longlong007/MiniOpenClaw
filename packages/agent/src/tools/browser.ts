import type { ToolDefinition } from "../models/types.js";

// ─── Browser tool ──────────────────────────────────────────────────────────────

export const browserToolDefinition: ToolDefinition = {
  name: "browser",
  description:
    "Control a web browser. Navigate pages, take screenshots, click elements, fill forms, and extract content.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["navigate", "screenshot", "click", "fill", "extract", "close"],
        description: "The browser action to perform",
      },
      url: { type: "string", description: "URL to navigate to (for navigate action)" },
      selector: { type: "string", description: "CSS selector for click/fill actions" },
      value: { type: "string", description: "Value to fill into an input" },
    },
    required: ["action"],
  },
};

export interface BrowserToolInput {
  action: "navigate" | "screenshot" | "click" | "fill" | "extract" | "close";
  url?: string;
  selector?: string;
  value?: string;
}

// ─── Browser tool executor ─────────────────────────────────────────────────────

export class BrowserTool {
  private browser: import("playwright").Browser | null = null;
  private page: import("playwright").Page | null = null;

  async execute(input: BrowserToolInput): Promise<string> {
    try {
      switch (input.action) {
        case "navigate":
          return await this.navigate(input.url!);
        case "screenshot":
          return await this.screenshot();
        case "click":
          return await this.click(input.selector!);
        case "fill":
          return await this.fill(input.selector!, input.value ?? "");
        case "extract":
          return await this.extract(input.selector);
        case "close":
          return await this.close();
        default:
          return `Unknown action: ${input.action}`;
      }
    } catch (err) {
      return `Browser error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async ensurePage(): Promise<import("playwright").Page> {
    if (!this.browser) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({ headless: true });
    }
    if (!this.page) {
      this.page = await this.browser.newPage();
    }
    return this.page;
  }

  private async navigate(url: string): Promise<string> {
    const page = await this.ensurePage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const title = await page.title();
    return `Navigated to ${url}. Page title: "${title}"`;
  }

  private async screenshot(): Promise<string> {
    const page = await this.ensurePage();
    const buffer = await page.screenshot({ type: "png", fullPage: false });
    const base64 = buffer.toString("base64");
    return `Screenshot captured (${buffer.length} bytes). Base64: data:image/png;base64,${base64.slice(0, 100)}...`;
  }

  private async click(selector: string): Promise<string> {
    const page = await this.ensurePage();
    await page.click(selector, { timeout: 10000 });
    return `Clicked element: ${selector}`;
  }

  private async fill(selector: string, value: string): Promise<string> {
    const page = await this.ensurePage();
    await page.fill(selector, value);
    return `Filled "${selector}" with value`;
  }

  private async extract(selector?: string): Promise<string> {
    const page = await this.ensurePage();
    if (selector) {
      const text = await page.textContent(selector);
      return text ?? "(empty)";
    }
    // Extract main content (runs in browser context)
    const content = await page.evaluate(() => {
      const main =
        document.querySelector("main") ??
        document.querySelector("article") ??
        document.body;
      return (main as HTMLElement)?.innerText?.slice(0, 5000) ?? "";
    });
    return content;
  }

  private async close(): Promise<string> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    return "Browser closed";
  }
}
