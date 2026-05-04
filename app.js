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
let activePage = "home";

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

function monthLabel(dateString) {
  if (!dateString) return "Sem mês";
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("pt-PT", { year: "numeric", month: "long" });
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
  activePage = page;

  document.querySelectorAll(".page").forEach((section) => section.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((button) => button.classList.remove("active"));

  el(`${page}Page`).classList.add("active");
  document.querySelector(`[data-page="${page}"]`).classList.add("active");
}

async function ensureAuth() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          resolve(user);
        } else {
          const result = await signInAnonymously(auth);
          resolve(result.user);
        }
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
    movements = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));
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

function getDashboardMovements() {
  const selectedMonth = el("monthFilter").value;
  if (selectedMonth === "all") return movements;
  return movements.filter((movement) => movement.date?.startsWith(selectedMonth));
}

function getTableMovements() {
  const selectedType = el("tableTypeFilter").value;
  if (selectedType === "all") return movements;
  return movements.filter((movement) => movement.type === selectedType);
}

function renderFilters() {
  const current = el("monthFilter").value;
  const months = [...new Set(movements.map((m) => (m.date || "").slice(0, 7)).filter(Boolean))].sort().reverse();

  el("monthFilter").innerHTML = `<option value="all">Todos os meses</option>`;
  months.forEach((month) => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = monthLabel(`${month}-01`);
    el("monthFilter").appendChild(option);
  });

  if ([...el("monthFilter").options].some((option) => option.value === current)) {
    el("monthFilter").value = current;
  }
}

function renderCards(data) {
  const inflow = data.filter((m) => Number(m.value) > 0).reduce((sum, m) => sum + Number(m.value), 0);
  const expenses = data.filter((m) => Number(m.value) < 0).reduce((sum, m) => sum + Number(m.value), 0);
  const balance = inflow + expenses;

  el("totalInflow").textContent = formatMoney(inflow);
  el("totalExpenses").textContent = formatMoney(Math.abs(expenses));
  el("balance").textContent = formatMoney(balance);
  el("movementCount").textContent = data.length;
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

function renderSummary(containerId, rows, emptyText) {
  const container = el(containerId);
  container.innerHTML = "";

  if (!rows.length) {
    container.innerHTML = `<p class="hint">${emptyText}</p>`;
    return;
  }

  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "summary-row";
    div.innerHTML = `
      <div>
        <strong>${row.label}</strong>
        ${row.subLabel ? `<small>${row.subLabel}</small>` : ""}
      </div>
      <strong class="${row.value >= 0 ? "positive" : "negative"}">${formatMoney(row.value)}</strong>
    `;
    container.appendChild(div);
  });
}

function renderBarChart(containerId, rows, emptyText) {
  const container = el(containerId);
  container.innerHTML = "";

  if (!rows.length) {
    container.innerHTML = `<p class="hint">${emptyText}</p>`;
    return;
  }

  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  rows.forEach((row) => {
    const pct = Math.max(4, Math.round((Math.abs(row.value) / max) * 100));
    const div = document.createElement("div");
    div.className = "chart-row";
    div.innerHTML = `
      <div class="chart-row-top">
        <span>${row.label}</span>
        <strong class="${row.value >= 0 ? "positive" : "negative"}">${formatMoney(row.value)}</strong>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${row.value >= 0 ? "positive-fill" : "negative-fill"}" style="width: ${pct}%"></div>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderDashboard(data) {
  const byCategory = {};
  const byExpenseCategory = {};
  const byMonth = {};
  const monthlyInOut = {};

  data.forEach((movement) => {
    const value = Number(movement.value || 0);
    const category = movement.category || "Sem categoria";
    const monthKey = (movement.date || "").slice(0, 7) || "Sem mês";

    byCategory[category] = (byCategory[category] || 0) + value;
    byMonth[monthKey] = (byMonth[monthKey] || 0) + value;

    if (value < 0) {
      byExpenseCategory[category] = (byExpenseCategory[category] || 0) + value;
    }

    if (!monthlyInOut[monthKey]) monthlyInOut[monthKey] = { inflow: 0, expenses: 0 };
    if (value >= 0) monthlyInOut[monthKey].inflow += value;
    else monthlyInOut[monthKey].expenses += value;
  });

  const categoryRows = Object.entries(byCategory)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const monthRows = Object.entries(byMonth)
    .map(([key, value]) => ({
      label: key === "Sem mês" ? key : monthLabel(`${key}-01`),
      value
    }))
    .sort((a, b) => b.label.localeCompare(a.label));

  const expenseCategoryRows = Object.entries(byExpenseCategory)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 8);

  const monthlyRows = Object.entries(monthlyInOut)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([key, values]) => {
      const label = key === "Sem mês" ? key : monthLabel(`${key}-01`);
      return [
        { label: `${label} · Entradas`, value: values.inflow },
        { label: `${label} · Despesas`, value: values.expenses }
      ];
    })
    .slice(-12);

  renderSummary("categorySummary", categoryRows, "Ainda não há dados para apresentar.");
  renderSummary("monthSummary", monthRows, "Ainda não há dados para apresentar.");
  renderBarChart("expenseCategoryChart", expenseCategoryRows, "Ainda não há despesas para apresentar.");
  renderBarChart("monthlyChart", monthlyRows, "Ainda não há dados para apresentar.");
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
  renderFilters();
  renderHome();

  const dashboardData = getDashboardMovements();
  renderCards(dashboardData);
  renderDashboard(dashboardData);
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
el("monthFilter").addEventListener("change", render);
el("tableTypeFilter").addEventListener("change", render);
el("exportBtn").addEventListener("click", exportCSV);
el("refreshBtn").addEventListener("click", manualRefresh);

updateCategoryOptions();
setDefaultDate();

if (localStorage.getItem("cashflowPinOk") === "true") {
  showApp();
  ensureAuth().then(subscribeMovements).catch((error) => {
    alert("Erro na autenticação anónima: " + error.message);
  });
}
