document.getElementById("start").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: startLocatorMode
  });

  window.close();
});

function startLocatorMode() {
  if (window.__locatorModeActive) return;
  window.__locatorModeActive = true;

  // Highlight overlay
  const highlight = document.createElement("div");
  Object.assign(highlight.style, {
    position: "absolute",
    background: "rgba(37,99,235,0.25)",
    pointerEvents: "none",
    zIndex: "999999"
  });
  document.body.appendChild(highlight);

  function move(e) {
    const r = e.target.getBoundingClientRect();
    highlight.style.top = r.top + scrollY + "px";
    highlight.style.left = r.left + scrollX + "px";
    highlight.style.width = r.width + "px";
    highlight.style.height = r.height + "px";
  }

  function click(e) {
    e.preventDefault();
    e.stopPropagation();

    document.removeEventListener("mousemove", move);
    document.removeEventListener("click", click, true);

    const el = e.target;

    let playwright = selectBestPlaywrightLocator(el);
    let selenium = selectBestSeleniumLocator(el);

    if (!playwright) {
      playwright = {
        code: `page.locator("${getCssSelector(el) || el.tagName.toLowerCase()}")`,
        matches: -1,
        score: 0
      };
    }

    if (!selenium) {
      selenium = {
        code: `driver.findElement(By.xpath("${buildIndexedXPath(el)}"));`,
        matches: -1,
        score: 0
      };
    }

showCopyModal(playwright, selenium);

  }

  document.addEventListener("mousemove", move);
  document.addEventListener("click", click, true);

  function cleanup() {
    highlight.remove();
    window.__locatorModeActive = false;
  }

  // ================= PLAYWRIGHT (UPDATED LOGIC) =================

  // ================= PLAYWRIGHT (STANDARD SCORING) =================
function selectBestPlaywrightLocator(el) {
  const candidates = [];
  const text = el.innerText?.trim();

  // Helper to add only unique candidate
  function addCandidate(code, selectorQuery, score) {
    const matches = document.querySelectorAll(selectorQuery).length;
    if (matches === 1) {
      candidates.push({ code, matches, score });
    }
  }

  // 1️⃣ data-testid
  const testId = el.getAttribute("data-testid");
  if (testId) addCandidate(`page.getByTestId("${testId}")`, `[data-testid="${testId}"]`, 100);

  // 2️⃣ id
  if (el.id) addCandidate(`page.locator("#${el.id}")`, `#${CSS.escape(el.id)}`, 99);

  // 3️⃣ label / aria-label
  const label = el.labels?.[0]?.innerText?.trim();
  if (label) addCandidate(`page.getByLabel("${label}")`, `label:has-text("${label}")`, 98);
  const aria = el.getAttribute("aria-label");
  if (aria) addCandidate(`page.getByLabel("${aria}")`, `[aria-label="${aria}"]`, 98);

  // 4️⃣ placeholder
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) addCandidate(`page.getByPlaceholder("${placeholder}")`, `[placeholder="${placeholder}"]`, 95);

  // 5️⃣ alt (images)
  const alt = el.getAttribute("alt");
  if (alt) addCandidate(`page.getByAltText("${alt}")`, `[alt="${alt}"]`, 94);

  // 6️⃣ role + text
  const role = el.getAttribute("role");
  if (role && text) {
    const xpath = `//*[@role="${role}" and normalize-space()="${text}"]`;
    const matches = countByXPath(xpath);
    if (matches === 1) candidates.push({ code: `page.getByRole("${role}", { name: "${text}" })`, matches, score: 93 });
  }

  // 7️⃣ exact text
  if (text) {
    const xpath = `//*[normalize-space()="${text}"]`;
    const matches = countByXPath(xpath);
    if (matches === 1) candidates.push({ code: `page.getByText("${text}", { exact: true })`, matches, score: 90 });
  }

  // 8️⃣ input type + name
  if (el.tagName === "INPUT" && el.type && el.name) {
    const selector = `input[type="${el.type}"][name="${el.name}"]`;
    addCandidate(`page.locator('${selector}')`, selector, 88);
  }

  // 9️⃣ css selector (unique)
  const css = getCssSelector(el);
  if (css) addCandidate(`page.locator("${css}")`, css, 80);

  // 🔟 fallback: absolute xpath
  candidates.push({
  code: `page.locator("${getCssSelector(el) || el.tagName.toLowerCase()}")`,
  matches: 1,
  score: 50
});

  return pickBest(candidates);
}

// ================= SELENIUM (STANDARD SCORING) =================






function selectBestSeleniumLocator(el) {
  const candidates = [];
  const text = el.innerText?.trim();

  // Helper to add only unique candidate
  function addCandidate(code, selectorQuery, score) {
    const matches = document.querySelectorAll(selectorQuery).length;
    if (matches === 1) {
      candidates.push({ code, matches, score });
    }
  }

  // 1️⃣ id
  if (el.id) addCandidate(`driver.findElement(By.id("${el.id}"));`, `#${CSS.escape(el.id)}`, 100);

  // 2️⃣ data-testid
  const testId = el.getAttribute("data-testid");
  if (testId) addCandidate(`driver.findElement(By.cssSelector('[data-testid="${testId}"]'));`, `[data-testid="${testId}"]`, 98);

  // 3️⃣ label xpath
  const label = el.labels?.[0]?.innerText?.trim();
  if (label) {
    const xpath = `//label[normalize-space()="${label}"]/following::input[1]`;
    const matches = countByXPath(xpath);
    if (matches === 1) candidates.push({ code: `driver.findElement(By.xpath("${xpath}"));`, matches, score: 95 });
  }

  // 4️⃣ name
  if (el.name) {
    const matches = document.getElementsByName(el.name).length;
    if (matches === 1) candidates.push({ code: `driver.findElement(By.name("${el.name}"));`, matches, score: 92 });
  }

  // 5️⃣ placeholder
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) {
    const xpath = `//*[@placeholder="${placeholder}"]`;
    const matches = countByXPath(xpath);
    if (matches === 1) candidates.push({ code: `driver.findElement(By.xpath("${xpath}"));`, matches, score: 90 });
  }

  // 6️⃣ title
  const title = el.getAttribute("title");
  if (title) {
    const xpath = `//*[@title="${title}"]`;
    const matches = countByXPath(xpath);
    if (matches === 1) candidates.push({ code: `driver.findElement(By.xpath("${xpath}"));`, matches, score: 88 });
  }

  // 7️⃣ link text
  if (el.tagName === "A" && text) {
    const xpath = `//a[normalize-space()="${text}"]`;
    const matches = countByXPath(xpath);
    if (matches === 1) candidates.push({ code: `driver.findElement(By.linkText("${text}"));`, matches, score: 85 });
  }

  // 8️⃣ input type + name
  if (el.tagName === "INPUT" && el.type && el.name) {
    const selector = `input[type="${el.type}"][name="${el.name}"]`;
    addCandidate(`driver.findElement(By.cssSelector("${selector}"));`, selector, 88);
  }

  // 9️⃣ css selector (unique)
  const css = getCssSelector(el);
  if (css) addCandidate(`driver.findElement(By.cssSelector("${css}"));`, css, 80);

  // 🔟 strong relative XPath (preferred)
  const strongXPath = buildStrongRelativeXPath(el);
  if (strongXPath) {
    candidates.push({
      code: `driver.findElement(By.xpath("${strongXPath}"));`,
      matches: 1,
      score: 85
    });
  }

  // ⓫ absolute indexed XPath (LAST resort)
  candidates.push({
    code: `driver.findElement(By.xpath("${buildIndexedXPath(el)}"));`,
    matches: 1,
    score: 30
  });

  return pickBest(candidates);
}

  // ================= CORE HELPERS =================

  function pickBest(list) {
    if (!list.length) return null;

    // Prefer unique locators
    const unique = list.filter(l => l.matches === 1);
    if (unique.length) {
      return unique.sort((a, b) => b.score - a.score)[0];
    }

    // Fallback: best-scored locator even if not unique
    return list.sort((a, b) => b.score - a.score)[0];
  }


  function countByXPath(xpath) {
    return document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    ).snapshotLength;
  }

  function getCssSelector(el) {
    if (el.id && typeof el.id === "string") {
      return `#${CSS.escape(el.id)}`;
    }

    // className can be string OR SVGAnimatedString
    let className = el.className;

    if (typeof className === "string") {
      const classes = className.trim().split(/\s+/).filter(Boolean);
      if (classes.length) {
        return `${el.tagName.toLowerCase()}.${classes.map(c => CSS.escape(c)).join(".")}`;
      }
    }

    // SVG elements
    if (className && typeof className === "object" && typeof className.baseVal === "string") {
      const classes = className.baseVal.trim().split(/\s+/).filter(Boolean);
      if (classes.length) {
        return `${el.tagName.toLowerCase()}.${classes.map(c => CSS.escape(c)).join(".")}`;
      }
    }

    return null;
  }

  function buildIndexedXPath(el) {
    let path = "";
    while (el && el.nodeType === 1) {
      let index = 1;
      let sib = el.previousSibling;
      while (sib) {
        if (sib.nodeType === 1 && sib.tagName === el.tagName) index++;
        sib = sib.previousSibling;
      }
      path = `/${el.tagName.toLowerCase()}[${index}]` + path;
      el = el.parentNode;
    }
    return path;
  }


  // ================= STRONG RELATIVE XPATH =================
  function buildStrongRelativeXPath(el) {
    if (!el || el.nodeType !== 1) return null;

    const tag = el.tagName.toLowerCase();

    const attrs = [
      "data-testid",
      "data-test",
      "aria-label",
      "name",
      "title",
      "placeholder",
      "role",
      "type",
      "value"
    ];

    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (val) {
        const xpath = `//${tag}[@${attr}="${val}"]`;
        if (countByXPath(xpath) === 1) {
          return xpath;
        }
      }
    }

    const text = el.innerText?.trim();
    if (text && text.length < 80) {
      const xpath = `//${tag}[normalize-space()="${text}"]`;
      if (countByXPath(xpath) === 1) {
        return xpath;
      }
    }

    return null;
  }



  function getScopedCssSelector(el, baseCss) {
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      if (parent.id) return `#${parent.id} ${baseCss}`;
      if (parent.className) {
        const cls = parent.className.trim().split(/\s+/)[0];
        return `.${cls} ${baseCss}`;
      }
      parent = parent.parentElement;
    }
    return null;
  }




  // ================= CLIPBOARD SAFE COPY =================
  function copyToClipboard(text) {
    // Modern Clipboard API (works on https & allowed apps)
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;

    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand("copy");
    } catch (e) {
      console.error("Copy failed", e);
    }

    document.body.removeChild(textarea);
  }



  
  // ================= MODERN UI MODAL =================

function showCopyModal(playwright, selenium) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 999999;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #0f172a;
    color: #fafbfc;
    border-radius: 14px;
    padding: 18px;
    width: min(92vw, 380px);
    max-height: 85vh;
    overflow-y: auto;
    z-index: 1000000;
    font-family: Inter, Arial, sans-serif;
    box-shadow: 0 25px 50px rgba(0,0,0,0.35);
  `;

  modal.innerHTML = `
<div style="
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  ">
    <h3 style="margin:0;font-size:16px">Copy Locator</h3>

    <button id="closeBtn" title="Close" style="
      background: rgba(255,255,255,0.06);
      border: none;
      color: #e5e7eb;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      line-height: 28px;
      text-align: center;
    ">X</button>
  </div>
    <label style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
      <input type="checkbox" id="pw" checked />
      <strong>Playwright</strong>
    </label>

    <pre style="
      background:#fafbfc;
      padding:10px;
      border-radius:8px;
      font-size:12px;
      overflow:auto;
      color: #000000;
    ">${playwright.code}</pre>

    <label style="display:flex;gap:8px;align-items:center;margin:12px 0 6px">
      <input type="checkbox" id="sel" checked />
      <strong>Selenium</strong>
    </label>
        
    <pre style="
      background:#fafbfc;
      padding:10px;
      border-radius:8px;
      font-size:12px;
      overflow:auto;
      color: #000000;
    ">${selenium.code}</pre>

    <button id="copyBtn" style="
      width:100%;
      margin-top:14px;
      padding:11px;
      border:none;
      border-radius:10px;
      background:#1d4ed8;
      color:#e5e7eb;
      font-weight:600;
      cursor:pointer;
    ">Copy Selected</button>
  `;

  modal.addEventListener("click", e => e.stopPropagation());
  overlay.addEventListener("click", closeAll);
  modal.querySelector("#closeBtn").onclick = closeAll;
  function onEsc(e) {
  if (e.key === "Escape") {
    closeAll();
  }
}

document.addEventListener("keydown", onEsc);



  function closeAll() {
    document.removeEventListener("keydown", onEsc);
    overlay.remove();
    modal.remove();
    cleanup();
  }

  modal.querySelector("#copyBtn").onclick = () => {
    let text = "";
    if (modal.querySelector("#pw").checked)
      text += `Playwright:\n${playwright.code}\n\n`;
    if (modal.querySelector("#sel").checked)
      text += `Selenium:\n${selenium.code}`;

    if (!text.trim()) return;

    copyToClipboard(text.trim());

    modal.innerHTML = `
      <h3 style="text-align:center">Copied</h3>
      <p style="text-align:center;font-size:13px;color:#6b7280">
        Locator copied to clipboard
      </p>
    `;

    setTimeout(closeAll, 900);
  };

  document.body.appendChild(overlay);
  document.body.appendChild(modal);
}

}
