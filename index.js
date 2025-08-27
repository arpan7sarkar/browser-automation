import 'dotenv/config';
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: false,
  chromiumSandbox: true,
  env: {},
  args: ['--disable-extensions', '--disable-file-system'],
});

const page = await browser.newPage();

const takeScreenShot = tool({
  name: 'take_screenshot',
  // Return base64 image
  parameters: z.object({}),
  async execute() {
    const dir = path.resolve(process.cwd(), 'screenshots');
    await fs.mkdir(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `screenshot-${ts}.png`;
    const filePath = path.join(dir, name);
    await page.screenshot({ fullPage: true, path: filePath });
    return `saved:${path.relative(process.cwd(), filePath)}`;
  },
});

const openBrowser = tool({
  name: 'open_browser',
  parameters: z.object({
    url: z.string().describe('URL to open'),
  }),
  async execute(input) {
    await page.goto(input.url);
  },
});

const openURL = tool({
  name: 'open_url',
  parameters: z.object({
    url: z.string().describe('URL to open'),
  }),
  async execute(input) {
    await page.goto(input.url);
  },
});

const clickOnScreen = tool({
  name: 'click_screen',
  parameters: z.object({
    x: z.number(),
    y: z.number(),
  }),
  async execute(input) {
    await page.mouse.click(input.x, input.y);
  },
});

const clickSelector = tool({
  name: 'click_selector',
  parameters: z.object({
    selector: z.string(),
  }),
  async execute(input) {
    await page.waitForSelector(input.selector);
    await page.click(input.selector);
  },
});

const sendKeys = tool({
  name: 'send_keys',
  parameters: z.object({
    selector: z.string(),
    text: z.string(),
  }),
  async execute(input) {
    await page.fill(input.selector, input.text);
  },
});

const waitForSelector = tool({
  name: 'wait_for_selector',
  parameters: z.object({
    selector: z.string(),
  }),
  async execute(input) {
    await page.waitForSelector(input.selector);
  },
});

const findAuthForm = tool({
  name: 'find_auth_form',
  parameters: z.object({}),
  async execute() {
    const result = await page.evaluate(() => {
      const isVisible = (el) => !!(el && el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.offsetParent !== null);

      const findBy = (selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && isVisible(el)) return sel;
        }
        return null;
      };

      const emailCandidates = [
        'input[type="email"]',
        'input[name*="email" i]',
        'input[placeholder*="email" i]',
        'input[autocomplete="email"]',
        'input[autocomplete="username"]',
        'input[type="text"]',
      ];
      const passwordCandidates = [
        'input[type="password"]',
        'input[name*="pass" i]',
        'input[placeholder*="pass" i]',
        'input[autocomplete="current-password"]',
      ];

      // For submit, first try semantic selectors, then scan for button-like elements with matching text
      let submitSelector = findBy(['button[type="submit"]', 'input[type="submit"]']);
      if (!submitSelector) {
        const submitButtonCandidates = ['button', 'input[type="button"]', 'input[type="submit"]'];
        for (const sel of submitButtonCandidates) {
          const buttons = Array.from(document.querySelectorAll(sel));
          for (const button of buttons) {
            if (button && isVisible(button) && button.textContent.toLowerCase().includes('sign up')) {
              submitSelector = button.tagName + '[text="' + button.textContent.toLowerCase().replace(/[^a-z ]/g, '') + '"]';
              break;
            }
          }
        }
      }

      const emailSelector = findBy(emailCandidates);
      const passwordSelector = findBy(passwordCandidates);
      const submitSelector2 = submitSelector;

      return { emailSelector, passwordSelector, submitSelector: submitSelector2 };
    });

    return result;
  },
});

// Reusable signup flow used by the tool and by direct invocation
async function signupFlow({ url, firstname, lastname, email, password, confirm_password }) {
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  // Small settle delay
  await page.waitForTimeout(500);

  const sels = await page.evaluate(() => {
    const isVisible = (el) => !!(el && (el.offsetParent !== null || (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : false)));
    const findBy = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return sel;
      }
      return null;
    };
    const firstname = findBy([
      'input[name*="first" i]',
      'input[placeholder*="John" i]',
      'input[autocomplete="given-name"]',
    ]);
    const lastname = findBy([
      'input[name*="last" i]',
      'input[placeholder*="Doe" i]',
      'input[autocomplete="family-name"]',
    ]);
    const email = findBy([
      'input[type="email"]',
      'input[name*="email" i]',
      'input[placeholder*="email" i]',
      'input[autocomplete="email"]',
      'input[autocomplete="username"]',
    ]);
    const password = findBy([
      'input[type="password"]',
      'input[name*="pass" i]',
      'input[placeholder*="pass" i]',
      'input[autocomplete="new-password"]',
      'input[autocomplete="current-password"]',
    ]);
    const confirm_password = findBy([
      'input[name*="confirm" i]',
      'input[placeholder*="confirm" i]',
      'input[type="password"]',
    ]);
    let submit = findBy(['button[type="submit"]', 'input[type="submit"]']);
    if (!submit) {
      const texts = ['create account', 'sign up', 'register', 'continue', 'submit'];
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], a, div, span')).filter(isVisible);
      const match = candidates.find((el) => {
        const txt = (el.innerText || el.value || '').trim().toLowerCase();
        return txt && texts.some((t) => txt.includes(t));
      });
      if (match) {
        if (match.id) submit = `#${CSS.escape(match.id)}`;
        else if (match.getAttribute('name')) submit = `${match.tagName.toLowerCase()}[name="${match.getAttribute('name')}"]`;
        else {
          const parent = match.parentElement;
          if (parent) {
            const tag = match.tagName.toLowerCase();
            const index = Array.from(parent.children).filter((c) => c.tagName.toLowerCase() === tag).indexOf(match) + 1;
            submit = `${tag}:nth-of-type(${index})`;
          }
        }
      }
    }
    return { firstname, lastname, email, password, confirm_password, submit };
  });

  console.log('[signup] Detected selectors:', sels);

  const safeFill = async (selector, value) => {
    await page.waitForSelector(selector, { timeout: 8000 });
    await page.click(selector, { timeout: 2000 }).catch(() => {});
    await page.fill(selector, value, { timeout: 8000 });
  };

  if (sels.firstname) await safeFill(sels.firstname, firstname);
  if (sels.lastname) await safeFill(sels.lastname, lastname);
  if (sels.email) await safeFill(sels.email, email);
  if (sels.password) await safeFill(sels.password, password);
  if (sels.confirm_password) await safeFill(sels.confirm_password, confirm_password);

  if (sels.submit) {
    await page.click(sels.submit);
  }

  // Wait for navigation or network to settle after submit
  await Promise.race([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.waitForTimeout(2000),
  ]);

  return { filled: sels };
}

const signup = tool({
  name: 'signup',
  parameters: z.object({
    url: z.string(),
    firstname: z.string(),
    lastname: z.string(),
    email: z.string(),
    password: z.string(),
    confirm_password: z.string(),
  }),
  async execute(input) {
    return await signupFlow(input);
  },
});

const websiteAutomationAgent = new Agent({
  name: 'WebSite Automation Agent',
  instructions: `Use selectors. Try find_auth_form; otherwise use common fallbacks and verify with wait_for_selector. Take minimal screenshots.`,
  tools: [
    takeScreenShot,
    openBrowser,
    openURL,
    clickOnScreen,
    clickSelector,
    sendKeys,
    waitForSelector,
    findAuthForm,
    signup,
  ],
});

const task = `Use the signup tool with these inputs:
url: https://ui.chaicode.com/auth/signup
firstname: Arpan
lastname: Sarkar
email: Arpt@example.com
password: Arpan@chai2
confirm_password: Arpan@chai2`;

(async () => {
  // Run deterministically without relying on model tool-calling
  await signupFlow({
    url: 'https://ui.chaicode.com/auth/signup',
    firstname: 'Arpan',
    lastname: 'Sarkar',
    email: 'Arpt@example.com',
    password: 'Arpan@chai2',
    confirm_password: 'Arpan@chai2',
  });

  // Optionally also run through the agent (commented out to avoid extra tokens)
  // await run(websiteAutomationAgent, task);
  await browser.close();
})();