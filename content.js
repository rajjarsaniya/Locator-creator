chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "START_LOCATOR_MODE") {
    startLocatorMode();
  }
});

function startLocatorMode() {
  if (window.__locatorModeActive) return;
  window.__locatorModeActive = true;

  /* ---------------- UI PANEL ---------------- */
  const panel = document.createElement("div");
  panel.innerHTML = `
    <strong>Locator Mode ON</strong><br>
    Click an element to generate locator<br><br>
    <button id="cancel">Cancel (ESC)</button>
  `;
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "15px",
    right: "15px",
    background: "#222",
    color: "#fff",
    padding: "10px",
    fontSize: "12px",
    zIndex: 999999,
    borderRadius: "6px"
  });
  document.body.appendChild(panel);

  /* ---------------- HIGHLIGHT BOX ---------------- */
  const highlight = document.createElement("div");
  Object.assign(highlight.style, {
    position: "absolute",
    background: "rgba(0,123,255,0.3)",
    pointerEvents: "none",
    zIndex: 999998
  });
  document.body.appendChild(highlight);

  function move(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const r = el.getBoundingClientRect();
    highlight.style.top = r.top + scrollY + "px";
    highlight.style.left = r.left + scrollX + "px";
    highlight.style.width = r.width + "px";
    highlight.style.height = r.height + "px";
  }

  function click(e) {
    e.preventDefault();
    e.stopPropagation();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;

    const result = getValidatedLocator(el);

    const playwright =
      result.type === "unique"
        ? `page.locator("${result.locator}")`
        : `page.locator("${result.locator}").nth(${result.index})`;

    const selenium =
      result.type === "unique"
        ? `driver.findElement(By.cssSelector("${result.locator}"));`
        : `driver.findElement(By.xpath("${result.xpathIndexed}"));`;

    copyToClipboard(playwright);

    panel.innerHTML = `
      <strong>Locator Generated ✅</strong><br><br>
      <b>Base:</b> ${result.locator}<br>
      <b>Matches:</b> ${result.count}<br><br>
      <b>Playwright:</b><br>
      <code>${playwright}</code><br><br>
      <b>Selenium:</b><br>
      <code>${selenium}</code><br><br>
      <small>Playwright locator copied</small>
    `;

    cleanup(true);
  }

  function escHandler(e) {
    if (e.key === "Escape") cleanup();
  }

  function cleanup(keepPanel = false) {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", escHandler);
    highlight.remove();
    if (!keepPanel) panel.remove();
    window.__locatorModeActive = false;
  }

  panel.querySelector("#cancel").onclick = () => cleanup();

  document.addEventListener("mousemove", move);
  document.addEventListener("click", click, true);
  document.addEventListener("keydown", escHandler);

  /* ---------------- LOCATOR LOGIC ---------------- */

  function cssEscape(value) {
    return CSS.escape(value);
  }

  function getValidatedLocator(el) {
    const base = getBaseLocator(el);
    let elements = [];

    try {
      elements = Array.from(document.querySelectorAll(base));
    } catch {}

    const count = elements.length;

    if (count === 1) {
      return { type: "unique", locator: base, count };
    }

    return {
      type: "indexed",
      locator: base,
      count,
      index: elements.indexOf(el),
      xpathIndexed: buildIndexedXPath(el)
    };
  }

  function getBaseLocator(el) {
    const testId = el.getAttribute("data-testid");
    if (testId) return `[data-testid="${testId}"]`;

    const aria = el.getAttribute("aria-label");
    if (aria) return `[aria-label="${aria}"]`;

    if (el.id) return `#${cssEscape(el.id)}`;

    if (el.classList.length === 1) {
      return `${el.tagName.toLowerCase()}.${el.classList[0]}`;
    }

    return buildIndexedXPath(el);
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

  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }
}
