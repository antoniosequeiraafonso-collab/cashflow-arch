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

// Firebase config do projecto cashflow-arch
const firebaseConfig = {
  apiKey: "AIzaSyBAUXw1GdmWulebWp-CNeB7qmcgXt0B2oQ",
  authDomain: "cashflow-arch.firebaseapp.com",
  projectId: "cashflow-arch",
  storageBucket: "cashflow-arch.firebasestorage.app",
  messagingSenderId: "484867845139",
  appId: "1:484867845139:web:732a4535e0840ef45c63e6",
  measurementId: "G-302CFZHR6E"
};

const PIN = "1906";

const categoriesByType = {
  Expenses: [
    "Software Subscriptions",
    "Stock Order",
    "Shipping",
    "IVAT",
    "Tributação Autónoma",
    "IRC",
    "Office Supplies",
    "Delivery Supplies",
    "Samples",
    "Tasting",
    "Other Expense"
  ],
  Inflow: [
    "Sales B2B",
    "Sales B2C",
    "Other Inflow"
  ]
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const el = (id) => document.getElementById(id);

let movements = [];
let unsubscribe = null;

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

function setDefaultDate() {
  el("date").value = localStorage.getItem("lastMovementDate") || todayISO();
}

function updateCategoryOptions() {
  const type = el("type").value;
  const category = el("category");
  category.innerHTML = "";

  categoriesByType[type].forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    category.appendChild(option);
  });
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
  const type = el("type").value;
  const rawValue = Number(el("value").value);
  const amount = type === "Expenses" ? -Math.abs(rawValue) : Math.abs(rawValue);
  const { year, month } = getYearMonth(date);

  await addDoc(collection(db, "movements"), {
    date,
    type,
    category: el("category").value,
    value: amount,
    description: el("description").value.trim(),
    year: Number(year),
    month: Number(month),
    createdAt: serverTimestamp()
  });

  localStorage.setItem("lastMovementDate", date);

  // Mantém a data e limpa apenas o resto.
  const keptDate = date;
  el("movementForm").reset();
  el("date").value = keptDate;
  el("type").value = type;
  updateCategoryOptions();
  el("value").focus();
}

async function removeMovement(id) {
  const ok = confirm("Apagar este movimento?");
  if (!ok) return;
  await deleteDoc(doc(db, "movements", id));
}

function getFilteredMovements() {
  const selectedMonth = el("monthFilter").value;
  if (selectedMonth === "all") return movements;
  return movements.filter((movement) => movement.date?.startsWith(selectedMonth));
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

function renderDashboard(data) {
  const byCategory = {};
  const byMonth = {};

  data.forEach((movement) => {
    byCategory[movement.category] = (byCategory[movement.category] || 0) + Number(movement.value || 0);
    const key = (movement.date || "").slice(0, 7) || "Sem mês";
    byMonth[key] = (byMonth[key] || 0) + Number(movement.value || 0);
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

  renderSummary("categorySummary", categoryRows, "Ainda não há dados para apresentar.");
  renderSummary("monthSummary", monthRows, "Ainda não há dados para apresentar.");
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
      <td>${movement.type === "Expenses" ? "Despesa" : "Entrada"}</td>
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
  const data = getFilteredMovements();
  renderCards(data);
  renderDashboard(data);
  renderTable(data);
}

function exportCSV() {
  const data = getFilteredMovements();
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

el("logoutBtn").addEventListener("click", showPin);
el("type").addEventListener("change", updateCategoryOptions);
el("movementForm").addEventListener("submit", addMovement);
el("monthFilter").addEventListener("change", render);
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
