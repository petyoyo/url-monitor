const state = { results: [] };

function formatDate(value) {
  if (!value) return "No check yet";
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function shortUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.host + parsed.pathname + (parsed.search ? parsed.search : "");
  } catch {
    return url;
  }
}

function reason(result) {
  if (result.result === "DEVICE_NOT_PUBLISHED") return "Device page is not published";
  if (result.result === "HTTP_ERROR") return `HTTP error — ${result.status ?? "no response"}`;
  if (result.result === "TIMEOUT") return "Page did not respond in time";
  return result.error || "Page requires attention";
}

function isProblem(result) {
  return result.result !== "OK";
}

function render() {
  const results = state.results;
  const problems = results.filter(isProblem);
  const healthy = results.length - problems.length;

  document.querySelector("#healthy-count").textContent = healthy;
  document.querySelector("#attention-count").textContent = problems.length;
  document.querySelector("#total-count").textContent = results.length;
  document.querySelector("#attention-badge").textContent = problems.length;
  document.querySelector("#last-check").textContent = formatDate(state.checkedAt);

  const problemList = document.querySelector("#problem-list");
  if (!problems.length) {
    problemList.innerHTML = '<div class="empty-state">Everything looks good.</div>';
  } else {
    problemList.innerHTML = problems.map(result => `
      <article class="problem-card">
        <div class="problem-main">
          <h3>${escapeHtml(result.name)}</h3>
          <p class="url">${escapeHtml(shortUrl(result.url))}</p>
          <p class="reason">${escapeHtml(reason(result))}</p>
        </div>
        <a href="${escapeAttribute(result.url)}" target="_blank" rel="noopener" class="open-link">Open URL ↗</a>
      </article>
    `).join("");
  }

  renderList("all");
}

function renderList(filter) {
  const list = document.querySelector("#url-list");
  const results = state.results.filter(result => {
    if (filter === "problem") return isProblem(result);
    if (filter === "healthy") return !isProblem(result);
    return true;
  });

  list.innerHTML = results.map(result => `
    <div class="url-row">
      <div>
        <strong>${escapeHtml(result.name)}</strong>
        <span>${escapeHtml(shortUrl(result.url))}</span>
      </div>
      <span class="status ${isProblem(result) ? "problem" : "healthy"}">
        ${isProblem(result) ? "Attention" : "Healthy"}
      </span>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

async function loadResults() {
  try {
    const response = await fetch(`results.json?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.results = data.results || [];
    state.checkedAt = data.checked_at;
    render();
  } catch (error) {
    document.querySelector("#last-check").textContent = "Unable to load results";
    document.querySelector("#problem-list").innerHTML =
      '<div class="empty-state">Results could not be loaded.</div>';
    console.error(error);
  }
}

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    renderList(button.dataset.filter);
  });
});

document.querySelector("#check-button").addEventListener("click", () => {
  alert("The Check now button will be connected to GitHub Actions in the next step.");
});

loadResults();
