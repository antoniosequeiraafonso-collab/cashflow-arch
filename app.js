import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBAUXw1GdmWu1ebWp-CNeB7qmcgXt0B2oQ",
  authDomain: "cashflow-arch.firebaseapp.com",
  projectId: "cashflow-arch",
  storageBucket: "cashflow-arch.firebasestorage.app",
  messagingSenderId: "484867845139",
  appId: "1:484867845139:web:732a4535e0840ef45c63e6",
  measurementId: "G-302CFZHR6E"
};

const PIN = "1906";

const categoryDefinitions = [
  { name: "Sales B2B", type: "Inflow" },
  { name: "Sales B2C", type: "Inflow" },
  { name: "Other Inflow", type: "Inflow" },

  { name: "Software Subscriptions", type: "Expenses" },
  { name: "Stock Order", type: "Expenses" },
  { name: "Shipping", type: "Expenses" },
  { name: "IVAT", type: "Expenses" },
  { name: "Tributação Autónoma", type: "Expenses" },
  { name: "IRC", type: "Expenses" },
  { name: "Office Supplies", type: "Expenses" },
  { name: "Delivery Supplies", type: "Expenses" },
  { name: "Samples", type: "Expenses" },
  { name: "Tasting", type: "Expenses" },
  { name: "Other Expense", type: "Expenses" }
];

const categoryTypeByName = Object.fromEntries(categoryDefinitions.map((item) => [item.name, item.type]));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const el = (id) => document.getElementById(id);

let movements = [];
let unsubscribe = null;
let selectedYears = new Set(["all"]);
let selectedMonths = new Set(["all"]);

const palette = ["#071936", "#175cd3", "#067647", "#b42318", "#b54708", "#7f56d9", "#0e9384", "#c11574", "#344054", "#475467", "#2970ff", "#039855"];

const monthNames = [
  { value: "01", label: "Jan" },
  { value: "02", label: "Fev" },
  { value: "03", label: "Mar" },
  { value: "04", label: "Abr" },
  { value: "05", label: "Mai" },
  { value: "06", label: "Jun" },
  { value: "07", label: "Jul" },
  { value: "08", label: "Ago" },
  { value: "09", label: "Set" },
  { value: "10", label: "Out" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dez" }
];

const currency = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR"
});

function formatMoney(value) {
  return currency.format(Number(value || 0));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getYearMonth(dateString) {
  if (!dateString) return { year: "", month: "" };
  const [year, month] = dateString.split("-");
  return { year, month };
}

function typeLabel(type) {
  return type === "Inflow" ? "Entrada" : "Despesa";
}

function inferTypeFromCategory(category) {
  return categoryTypeByName[category] || "Expenses";
}

function setDefaultDate() {
  el("date").value = localStorage.getItem("lastMovementDate") || todayISO();
}

function updateCategoryOptions() {
  const category = el("category");
  category.innerHTML = "";

  categoryDefinitions.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = item.type === "Inflow" ? `${item.name} · Entrada` : `${item.name} · Despesa`;
    category.appendChild(option);
  });

  updateTypePreview();
}

function updateTypePreview() {
  const type = inferTypeFromCategory(el("category").value);
  const preview = el("typePreview");
  preview.textContent = typeLabel(type);
  preview.className = type === "Inflow" ? "positive" : "negative";
}

function showApp() {
  el("pinScreen").classList.add("hidden");
  el("app").classList.remove("hidden");
  localStorage.setItem("cashflowPinOk", "true");
}

function showPin() {
  el("app").classList.add("hidden");
  el("pinScreen").classList.remove("hidden");
  localStorage.removeItem("cashflowPinOk");
}

function setPage(page) {
  document.querySelectorAll(".page").forEach((section) => section.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((button) => button.classList.remove("active"));

  el(`${page}Page`).classList.add("active");
  document.querySelector(`[data-page="${page}"]`).classList.add("active");

  if (page === "dashboard") setTimeout(render, 30);
}

async function ensureAuth() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (user) resolve(user);
        else resolve((await signInAnonymously(auth)).user);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function subscribeMovements() {
  if (unsubscribe) unsubscribe();

  const q = query(collection(db, "movements"), orderBy("date", "desc"));
  unsubscribe = onSnapshot(q, (snapshot) => {
    movements = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    render();
  }, (error) => {
    alert("Erro ao ler dados do Firestore: " + error.message);
  });
}

async function addMovement(event) {
  event.preventDefault();

  const date = el("date").value;
  const category = el("category").value;
  const type = inferTypeFromCategory(category);
  const rawValue = Number(el("value").value);
  const amount = type === "Expenses" ? -Math.abs(rawValue) : Math.abs(rawValue);
  const { year, month } = getYearMonth(date);

  await addDoc(collection(db, "movements"), {
    date,
    type,
    category,
    value: amount,
    description: el("description").value.trim(),
    year: Number(year),
    month: Number(month),
    createdAt: serverTimestamp()
  });

  localStorage.setItem("lastMovementDate", date);

  const keptDate = date;
  const keptCategory = category;

  el("movementForm").reset();
  el("date").value = keptDate;
  el("category").value = keptCategory;
  updateTypePreview();
  el("value").focus();
}

async function removeMovement(id) {
  const ok = confirm("Apagar este movimento?");
  if (!ok) return;
  await deleteDoc(doc(db, "movements", id));
}

function getAvailableYears() {
  const years = [...new Set(movements.map((m) => Number(m.year || (m.date || "").slice(0, 4))).filter(Boolean))].sort((a, b) => b - a);
  return years.length ? years : [new Date().getFullYear()];
}

function toggleSelection(set, value) {
  if (value === "all") {
    set.clear();
    set.add("all");
    return;
  }

  if (set.has("all")) set.clear();

  if (set.has(value)) set.delete(value);
  else set.add(value);

  if (set.size === 0) set.add("all");
}

function renderChips() {
  const years = getAvailableYears();

  if (![...selectedYears].every((year) => year === "all" || years.includes(Number(year)))) {
    selectedYears = new Set(["all"]);
  }

  const yearChips = el("yearChips");
  yearChips.innerHTML = "";
  [{ value: "all", label: "Todos" }, ...years.map((year) => ({ value: String(year), label: String(year) }))].forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = selectedYears.has(item.value) ? "chip active" : "chip";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      toggleSelection(selectedYears, item.value);
      render();
    });
    yearChips.appendChild(button);
  });

  const monthChips = el("monthChips");
  monthChips.innerHTML = "";
  [{ value: "all", label: "Todos" }, ...monthNames].forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = selectedMonths.has(item.value) ? "chip active" : "chip";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      toggleSelection(selectedMonths, item.value);
      render();
    });
    monthChips.appendChild(button);
  });
}

function renderTableCategoryFilter() {
  const select = el("tableCategoryFilter");
  const current = select.value || "all";

  const categories = [...new Set(movements.map((movement) => movement.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  select.innerHTML = `<option value="all">Todas as categorias</option>`;

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function getDashboardMovements() {
  return movements.filter((movement) => {
    const date = movement.date || "";
    const year = date.slice(0, 4);
    const month = date.slice(5, 7);
    const yearOk = selectedYears.has("all") || selectedYears.has(year);
    const monthOk = selectedMonths.has("all") || selectedMonths.has(month);
    return yearOk && monthOk;
  });
}

function getTableMovements() {
  const selectedType = el("tableTypeFilter").value;
  const selectedCategory = el("tableCategoryFilter").value;

  return movements.filter((movement) => {
    const typeOk = selectedType === "all" || movement.type === selectedType;
    const categoryOk = selectedCategory === "all" || movement.category === selectedCategory;
    return typeOk && categoryOk;
  });
}

function calculateTotals(data) {
  const inflow = data.filter((m) => Number(m.value) > 0).reduce((sum, m) => sum + Number(m.value), 0);
  const expenses = data.filter((m) => Number(m.value) < 0).reduce((sum, m) => sum + Number(m.value), 0);
  return { inflow, expenses, balance: inflow + expenses };
}

function renderCards(data) {
  const { inflow, expenses, balance } = calculateTotals(data);
  const expenseCount = data.filter((m) => Number(m.value) < 0).length;
  const inflowCount = data.filter((m) => Number(m.value) > 0).length;
  const avgExpense = expenseCount ? Math.abs(expenses) / expenseCount : 0;
  const avgInflow = inflowCount ? inflow / inflowCount : 0;

  el("totalInflow").textContent = formatMoney(inflow);
  el("totalExpenses").textContent = formatMoney(Math.abs(expenses));
  el("balance").textContent = formatMoney(balance);
  el("movementCount").textContent = data.length;

  el("inflowDetail").textContent = avgInflow ? `Média por entrada: ${formatMoney(avgInflow)}` : "Sem entradas no período";
  el("expensesDetail").textContent = avgExpense ? `Média por despesa: ${formatMoney(avgExpense)}` : "Sem despesas no período";
  el("balanceDetail").textContent = balance >= 0 ? "Período positivo" : "Período negativo";
  el("movementDetail").textContent = `${data.length} movimentos no período`;
}

function renderHome() {
  const currentMonth = todayISO().slice(0, 7);
  const currentMonthMovements = movements.filter((movement) => movement.date?.startsWith(currentMonth));
  const monthBalance = currentMonthMovements.reduce((sum, movement) => sum + Number(movement.value || 0), 0);
  const latest = [...movements].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];

  el("homeMonthBalance").textContent = formatMoney(monthBalance);
  el("homeMonthBalance").className = monthBalance >= 0 ? "positive" : "negative";

  if (latest) {
    el("lastMovementValue").textContent = formatMoney(latest.value);
    el("lastMovementValue").className = latest.value >= 0 ? "positive" : "negative";
    el("lastMovementMeta").textContent = `${latest.date} · ${latest.category}`;
  } else {
    el("lastMovementValue").textContent = "—";
    el("lastMovementMeta").textContent = "Ainda sem movimentos";
  }
}

function groupByCategory(data, predicate = () => true) {
  const grouped = {};
  data.filter(predicate).forEach((movement) => {
    const category = movement.category || "Sem categoria";
    grouped[category] = (grouped[category] || 0) + Number(movement.value || 0);
  });
  return Object.entries(grouped)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

function renderInsights(data) {
  const expenses = data.filter((m) => Number(m.value) < 0).sort((a, b) => Number(a.value) - Number(b.value));
  const biggest = expenses[0];

  if (biggest) {
    el("biggestExpense").textContent = formatMoney(Math.abs(biggest.value));
    el("biggestExpenseMeta").textContent = `${biggest.category} · ${biggest.date}`;
  } else {
    el("biggestExpense").textContent = "—";
    el("biggestExpenseMeta").textContent = "Sem despesas";
  }

  const topExpenses = groupByCategory(data, (m) => Number(m.value) < 0)[0];
  if (topExpenses) {
    el("topExpenseCategory").textContent = topExpenses.label;
    el("topExpenseCategoryMeta").textContent = formatMoney(Math.abs(topExpenses.value));
  } else {
    el("topExpenseCategory").textContent = "—";
    el("topExpenseCategoryMeta").textContent = "Sem despesas";
  }

  const topInflow = groupByCategory(data, (m) => Number(m.value) > 0)[0];
  if (topInflow) {
    el("topInflowCategory").textContent = topInflow.label;
    el("topInflowCategoryMeta").textContent = formatMoney(topInflow.value);
  } else {
    el("topInflowCategory").textContent = "—";
    el("topInflowCategoryMeta").textContent = "Sem entradas";
  }
}

function renderSummary(containerId, rows, emptyText, absoluteValues = false) {
  const container = el(containerId);
  container.innerHTML = "";

  if (!rows.length) {
    container.innerHTML = `<p class="hint">${emptyText}</p>`;
    return;
  }

  const totalAbs = rows.reduce((sum, row) => sum + Math.abs(row.value), 0) || 1;

  rows.forEach((row) => {
    const percentage = Math.round((Math.abs(row.value) / totalAbs) * 100);
    const displayValue = absoluteValues ? Math.abs(row.value) : row.value;
    const div = document.createElement("div");
    div.className = "summary-row";
    div.innerHTML = `
      <div>
        <strong>${row.label}</strong>
        <small>${percentage}% do total apresentado</small>
      </div>
      <strong class="${row.value >= 0 ? "positive" : "negative"}">${formatMoney(displayValue)}</strong>
    `;
    container.appendChild(div);
  });
}

function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width || canvas.parentElement.clientWidth || 320);
  const height = Number(canvas.getAttribute("height")) || 260;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function drawEmptyCanvas(canvas, text) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#667085";
  ctx.font = "14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2);
}

function drawDonut(canvasId, legendId, rows, emptyText) {
  const canvas = el(canvasId);
  const legend = el(legendId);
  legend.innerHTML = "";

  const cleanRows = rows
    .filter((row) => Math.abs(row.value) > 0)
    .slice(0, 8)
    .map((row) => ({ ...row, value: Math.abs(row.value) }));

  const total = cleanRows.reduce((sum, row) => sum + row.value, 0);

  if (!cleanRows.length || total === 0) {
    drawEmptyCanvas(canvas, emptyText);
    legend.innerHTML = `<p class="hint">${emptyText}</p>`;
    return;
  }

  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const innerRadius = radius * 0.58;

  let start = -Math.PI / 2;

  cleanRows.forEach((row, index) => {
    const angle = (row.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.arc(cx, cy, innerRadius, start + angle, start, true);
    ctx.closePath();
    ctx.fillStyle = palette[index % palette.length];
    ctx.fill();
    start += angle;
  });

  ctx.fillStyle = "#071936";
  ctx.font = "700 18px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(formatMoney(total), cx, cy - 2);
  ctx.fillStyle = "#667085";
  ctx.font = "12px system-ui";
  ctx.fillText("total", cx, cy + 18);

  cleanRows.forEach((row, index) => {
    const pct = Math.round((row.value / total) * 100);
    const div = document.createElement("div");
    div.className = "legend-item";
    div.innerHTML = `
      <span class="legend-dot" style="background:${palette[index % palette.length]}"></span>
      <span>${row.label}</span>
      <strong>${pct}%</strong>
    `;
    legend.appendChild(div);
  });
}

function renderDashboard(data) {
  const expenseRows = groupByCategory(data, (m) => Number(m.value) < 0);
  const inflowRows = groupByCategory(data, (m) => Number(m.value) > 0);

  renderInsights(data);

  drawDonut("expenseDonutCanvas", "expenseDonutLegend", expenseRows, "Sem despesas no período.");
  drawDonut("inflowDonutCanvas", "inflowDonutLegend", inflowRows, "Sem entradas no período.");

  renderSummary("expenseCategoriesTable", expenseRows, "Ainda não há despesas para apresentar.", true);
}

function renderDashboardTables(data) {
  const expenseRows = groupByCategory(data, (m) => Number(m.value) < 0);
  const inflowRows = groupByCategory(data, (m) => Number(m.value) > 0);

  renderSummary("expenseCategoriesTable", expenseRows, "Ainda não há despesas para apresentar.", true);
  renderSummary("inflowCategoriesTable", inflowRows, "Ainda não há entradas para apresentar.", false);
}

function renderAccountBalance() {
  const totalBalance = movements.reduce((sum, movement) => sum + Number(movement.value || 0), 0);
  const balanceEl = el("accountBalance");
  balanceEl.textContent = formatMoney(totalBalance);
  balanceEl.className = totalBalance >= 0 ? "positive" : "negative";
}

function renderTable(data) {
  const tbody = el("movementsTable");
  tbody.innerHTML = "";

  if (!data.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="hint">Ainda não há movimentos.</td>
      </tr>
    `;
    return;
  }

  data.forEach((movement) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${movement.date || ""}</td>
      <td>${typeLabel(movement.type)}</td>
      <td>${movement.category || ""}</td>
      <td>${movement.description || ""}</td>
      <td class="right ${movement.value >= 0 ? "positive" : "negative"}">${formatMoney(movement.value)}</td>
      <td class="right"><button class="danger" data-delete-id="${movement.id}">Apagar</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => removeMovement(button.dataset.deleteId));
  });
}

function render() {
  renderChips();
  renderTableCategoryFilter();
  renderHome();
  renderAccountBalance();

  const dashboardData = getDashboardMovements();
  renderCards(dashboardData);
  renderInsights(dashboardData);

  const expenseRows = groupByCategory(dashboardData, (m) => Number(m.value) < 0);
  const inflowRows = groupByCategory(dashboardData, (m) => Number(m.value) > 0);

  drawDonut("expenseDonutCanvas", "expenseDonutLegend", expenseRows, "Sem despesas no período.");
  drawDonut("inflowDonutCanvas", "inflowDonutLegend", inflowRows, "Sem entradas no período.");

  renderSummary("expenseCategoriesTable", expenseRows, "Ainda não há despesas para apresentar.", true);
  renderSummary("inflowCategoriesTable", inflowRows, "Ainda não há entradas para apresentar.", false);

  renderTable(getTableMovements());
}

function exportCSV() {
  const data = getTableMovements();
  const header = ["Data", "Tipo", "Categoria", "Descrição", "Valor"];
  const rows = data.map((m) => [
    m.date,
    m.type,
    m.category,
    m.description || "",
    String(m.value).replace(".", ",")
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cashflow-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function manualRefresh() {
  const snapshot = await getDocs(query(collection(db, "movements"), orderBy("date", "desc")));
  movements = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  render();
}

el("pinForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (el("pinInput").value !== PIN) {
    el("pinError").classList.remove("hidden");
    return;
  }

  el("pinError").classList.add("hidden");
  showApp();

  try {
    await ensureAuth();
    subscribeMovements();
  } catch (error) {
    alert("Erro na autenticação anónima: " + error.message);
  }
});

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", () => setPage(button.dataset.page));
});

el("logoutBtn").addEventListener("click", showPin);
el("category").addEventListener("change", updateTypePreview);
el("movementForm").addEventListener("submit", addMovement);
el("tableTypeFilter").addEventListener("change", render);
el("tableCategoryFilter").addEventListener("change", render);
el("exportBtn").addEventListener("click", exportCSV);
el("refreshBtn").addEventListener("click", manualRefresh);

window.addEventListener("resize", () => render());

updateCategoryOptions();
setDefaultDate();

if (localStorage.getItem("cashflowPinOk") === "true") {
  showApp();
  ensureAuth().then(subscribeMovements).catch((error) => {
    alert("Erro na autenticação anónima: " + error.message);
  });
}
