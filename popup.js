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

    const playwright = selectBestPlaywrightLocator(el);
    const selenium = selectBestSeleniumLocator(el);

    showCopyModal(playwright, selenium);
  }

  document.addEventListener("mousemove", move);
  document.addEventListener("click", click, true);

  function cleanup() {
    highlight.remove();
    window.__locatorModeActive = false;
  }

  // ================= PLAYWRIGHT (UNCHANGED LOGIC) =================

  function selectBestPlaywrightLocator(el) {
    const candidates = [];

    const testId = el.getAttribute("data-testid");
    if (testId) {
      candidates.push({ code: `page.getByTestId("${testId}")`, matches: 1, score: 100 });
    }

    const role = el.getAttribute("role");
    const text = el.innerText?.trim();
    if (role && text) {
      const count = countByXPath(`//*[@role="${role}" and normalize-space()="${text}"]`);
      candidates.push({
        code: `page.getByRole("${role}", { name: "${text}" })`,
        matches: count,
        score: 95
      });
    }

    if (text) {
      const count = countByXPath(`//*[normalize-space()="${text}"]`);
      candidates.push({
        code: `page.getByText("${text}", { exact: true })`,
        matches: count,
        score: 85
      });
    }

    const css = getCssSelector(el);
    if (css) {
      const list = [...document.querySelectorAll(css)];
      if (list.length === 1) {
        candidates.push({ code: `page.locator("${css}")`, matches: 1, score: 70 });
      } else if (list.length > 1) {
        candidates.push({
          code: `page.locator("${css}").nth(${list.indexOf(el)})`,
          matches: 1,
          score: 60
        });
      }
    }

    const href = el.getAttribute("href");
    if (href) {
      const count = document.querySelectorAll(`a[href="${href}"]`).length;
      candidates.push({
        code: `page.locator('a[href="${href}"]')`,
        matches: count,
        score: 90
      });
    }

    return pickBest(candidates);
  }

  // ================= SELENIUM (UNCHANGED LOGIC) =================

  function selectBestSeleniumLocator(el) {
    const candidates = [];

    if (el.id) {
      candidates.push({ code: `driver.findElement(By.id("${el.id}"));`, matches: 1, score: 85 });
    }

    if (el.name) {
      const count = document.getElementsByName(el.name).length;
      candidates.push({ code: `driver.findElement(By.name("${el.name}"));`, matches: count, score: 80 });
    }

    if (el.tagName === "A" && el.innerText?.trim()) {
      const text = el.innerText.trim();
      const count = countByXPath(`//a[normalize-space()="${text}"]`);
      candidates.push({
        code: `driver.findElement(By.linkText("${text}"));`,
        matches: count,
        score: 75
      });
    }

    const css = getCssSelector(el);
    if (css && document.querySelectorAll(css).length === 1) {
      candidates.push({
        code: `driver.findElement(By.cssSelector("${css}"));`,
        matches: 1,
        score: 70
      });
    }

    candidates.push({
      code: `driver.findElement(By.xpath("${buildIndexedXPath(el)}"));`,
      matches: 1,
      score: 50
    });

    const href = el.getAttribute("href");
    if (href) {
      const count = document.querySelectorAll(`a[href="${href}"]`).length;
      candidates.push({
        code: `driver.findElement(By.cssSelector("a[href='${href}']"));`,
        matches: count,
        score: 85
      });
}


    return pickBest(candidates);
  }

  // ================= CORE HELPERS =================

  function pickBest(list) {
    return list.filter(l => l.matches === 1).sort((a, b) => b.score - a.score)[0];
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
    if (el.id) return `#${el.id}`;
    if (el.className) {
      return `${el.tagName.toLowerCase()}.${el.className.trim().split(/\s+/).join(".")}`;
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
    <h3 style="margin:0 0 10px;font-size:16px">Copy Locator</h3>

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

  function closeAll() {
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
