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
  serverTimestamp,
  setDoc,
  updateDoc
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

const defaultCategoryDefinitions = [
  { name: "Sales B2B", type: "Inflow", source: "default" },
  { name: "Sales B2C", type: "Inflow", source: "default" },
  { name: "Other Inflow", type: "Inflow", source: "default" },

  { name: "Software Subscriptions", type: "Expenses", source: "default" },
  { name: "Stock Order", type: "Expenses", source: "default" },
  { name: "Shipping", type: "Expenses", source: "default" },
  { name: "IVAT", type: "Expenses", source: "default" },
  { name: "Tributação Autónoma", type: "Expenses", source: "default" },
  { name: "IRC", type: "Expenses", source: "default" },
  { name: "Office Supplies", type: "Expenses", source: "default" },
  { name: "Delivery Supplies", type: "Expenses", source: "default" },
  { name: "Samples", type: "Expenses", source: "default" },
  { name: "Tasting", type: "Expenses", source: "default" },
  { name: "Other Expense", type: "Expenses", source: "default" }
];

let categoryDefinitions = [...defaultCategoryDefinitions];
let customCategories = [];
let categoryTypeByName = Object.fromEntries(categoryDefinitions.map((item) => [item.name, item.type]));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const el = (id) => document.getElementById(id);

let movements = [];
let unsubscribe = null;
let unsubscribeCategories = null;
let editingMovementId = null;
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

function refreshCategoryMap() {
  categoryTypeByName = Object.fromEntries(categoryDefinitions.map((item) => [item.name, item.type]));
}

function updateCategoryOptions() {
  const category = el("category");
  const current = category.value;
  category.innerHTML = "";

  const inflow = categoryDefinitions.filter((item) => item.type === "Inflow").sort((a, b) => a.name.localeCompare(b.name));
  const expenses = categoryDefinitions.filter((item) => item.type === "Expenses").sort((a, b) => a.name.localeCompare(b.name));

  [
    { label: "Entradas", items: inflow },
    { label: "Despesas", items: expenses }
  ].forEach((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;

    group.items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = item.name;
      optgroup.appendChild(option);
    });

    category.appendChild(optgroup);
  });

  if ([...category.querySelectorAll("option")].some((option) => option.value === current)) {
    category.value = current;
  }

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

function openCategoryModal() {
  const modal = el("categoryModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  renderCategoryList();
}

function closeCategoryModal() {
  const modal = el("categoryModal");
  if (!modal) return;
  modal.classList.add("hidden");
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

function slugifyCategory(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function mergeCategories() {
  const map = new Map();

  defaultCategoryDefinitions.forEach((item) => {
    map.set(item.name.toLowerCase(), item);
  });

  customCategories.forEach((item) => {
    map.set(item.name.toLowerCase(), item);
  });

  categoryDefinitions = [...map.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === "Inflow" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  refreshCategoryMap();
  updateCategoryOptions();
  renderCategoryList();
}

function subscribeCategories() {
  if (unsubscribeCategories) unsubscribeCategories();

  const q = query(collection(db, "categories"), orderBy("name", "asc"));
  unsubscribeCategories = onSnapshot(q, (snapshot) => {
    customCategories = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
      source: "custom"
    }));
    mergeCategories();
    render();
  }, (error) => {
    alert("Erro ao ler categorias do Firestore: " + error.message);
  });
}

async function addCategory(event) {
  event.preventDefault();

  const name = el("newCategoryName").value.trim();
  const type = el("newCategoryType").value;

  if (!name) return;

  const exists = categoryDefinitions.some((item) => item.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    alert("Essa categoria já existe.");
    return;
  }

  const id = slugifyCategory(name) || `category_${Date.now()}`;

  await setDoc(doc(db, "categories", id), {
    name,
    type,
    createdAt: serverTimestamp()
  });

  el("categoryForm").reset();
  el("newCategoryType").value = "Expenses";
}

async function removeCategory(id, name) {
  const used = movements.some((movement) => movement.category === name);
  if (used) {
    alert("Esta categoria já está a ser usada em movimentos. Para evitar inconsistências, não pode ser apagada.");
    return;
  }

  const ok = confirm(`Apagar a categoria "${name}"?`);
  if (!ok) return;

  await deleteDoc(doc(db, "categories", id));
}

function renderCategoryList() {
  const container = el("categoryList");
  if (!container) return;

  container.innerHTML = "";

  const rows = [...categoryDefinitions].sort((a, b) => {
    if (a.type !== b.type) return a.type === "Inflow" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (!rows.length) {
    container.innerHTML = `<p class="hint">Ainda não existem categorias.</p>`;
    return;
  }

  rows.forEach((item) => {
    const usedCount = movements.filter((movement) => movement.category === item.name).length;
    const isDefault = item.source === "default";
    const canDelete = !isDefault && usedCount === 0;
    const canEdit = !isDefault;

    const div = document.createElement("div");
    div.className = "category-row";
    div.innerHTML = `
      <div class="category-row-main">
        <strong>${item.name}</strong>
        <small>${typeLabel(item.type)}${isDefault ? " · categoria base" : ""}${usedCount ? ` · ${usedCount} movimento(s)` : ""}</small>
      </div>

      <div class="category-row-actions">
        ${canEdit ? `<button class="secondary" data-category-edit-id="${item.id}" data-category-name="${item.name}" data-category-type="${item.type}">Editar</button>` : `<span class="locked-label">Base</span>`}
        ${canDelete ? `<button class="danger" data-category-delete-id="${item.id}" data-category-name="${item.name}">Apagar</button>` : `<button class="danger" disabled title="${isDefault ? "Categoria base" : "Categoria em uso"}">Apagar</button>`}
      </div>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll("[data-category-edit-id]").forEach((button) => {
    button.addEventListener("click", () => startEditingCategory(
      button.dataset.categoryEditId,
      button.dataset.categoryName,
      button.dataset.categoryType
    ));
  });

  document.querySelectorAll("[data-category-delete-id]").forEach((button) => {
    button.addEventListener("click", () => removeCategory(button.dataset.categoryDeleteId, button.dataset.categoryName));
  });
}

async function startEditingCategory(id, currentName, currentType) {
  const usedCount = movements.filter((movement) => movement.category === currentName).length;

  const newName = prompt("Novo nome da categoria:", currentName);
  if (!newName) return;

  const cleanName = newName.trim();
  if (!cleanName) return;

  const duplicate = categoryDefinitions.some((item) =>
    item.name.toLowerCase() === cleanName.toLowerCase() && item.name !== currentName
  );

  if (duplicate) {
    alert("Já existe uma categoria com esse nome.");
    return;
  }

  let newType = currentType;

  if (usedCount === 0) {
    const typeAnswer = prompt("Tipo da categoria: escreve 'entrada' ou 'despesa'", currentType === "Inflow" ? "entrada" : "despesa");
    if (!typeAnswer) return;

    const normalized = typeAnswer.trim().toLowerCase();
    if (normalized.startsWith("entr")) newType = "Inflow";
    else if (normalized.startsWith("desp")) newType = "Expenses";
    else {
      alert("Tipo inválido. Usa 'entrada' ou 'despesa'.");
      return;
    }
  } else if (cleanName !== currentName) {
    const ok = confirm(`Esta categoria está em uso em ${usedCount} movimento(s). Queres renomear também esses movimentos?`);
    if (!ok) return;
  }

  await updateDoc(doc(db, "categories", id), {
    name: cleanName,
    type: newType,
    updatedAt: serverTimestamp()
  });

  if (usedCount > 0 && cleanName !== currentName) {
    const affected = movements.filter((movement) => movement.category === currentName);
    await Promise.all(
      affected.map((movement) =>
        updateDoc(doc(db, "movements", movement.id), {
          category: cleanName,
          updatedAt: serverTimestamp()
        })
      )
    );
  }
}

async function addMovement(event) {
  event.preventDefault();

  const date = el("date").value;
  const category = el("category").value;
  const type = inferTypeFromCategory(category);
  const rawValue = Number(el("value").value);
  const amount = type === "Expenses" ? -Math.abs(rawValue) : Math.abs(rawValue);
  const { year, month } = getYearMonth(date);

  const payload = {
    date,
    type,
    category,
    value: amount,
    description: el("description").value.trim(),
    year: Number(year),
    month: Number(month),
    updatedAt: serverTimestamp()
  };

  if (editingMovementId) {
    await updateDoc(doc(db, "movements", editingMovementId), payload);
    stopEditing();
  } else {
    await addDoc(collection(db, "movements"), {
      ...payload,
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
}

function startEditingMovement(id) {
  const movement = movements.find((item) => item.id === id);
  if (!movement) return;

  editingMovementId = id;

  el("date").value = movement.date || todayISO();
  el("category").value = movement.category || categoryDefinitions[0]?.name || "";
  el("value").value = Math.abs(Number(movement.value || 0));
  el("description").value = movement.description || "";

  updateTypePreview();

  el("editNotice").classList.remove("hidden");
  el("submitMovementBtn").textContent = "Guardar alterações";

  setPage("home");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopEditing() {
  editingMovementId = null;

  el("movementForm").reset();
  setDefaultDate();
  
document.addEventListener("click", (event) => {
  const openBtn = event.target.closest("#openCategoriesBtn");
  if (openBtn) {
    event.preventDefault();
    openCategoryModal();
    return;
  }

  const closeBtn = event.target.closest("#closeCategoriesBtn");
  if (closeBtn) {
    event.preventDefault();
    closeCategoryModal();
    return;
  }

  if (event.target.id === "categoryModal") {
    closeCategoryModal();
  }
});

updateCategoryOptions();

  el("editNotice").classList.add("hidden");
  el("submitMovementBtn").textContent = "Guardar movimento";
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

function renderCssDonut(chartId, legendId, rows, emptyText) {
  const chart = el(chartId);
  const legend = el(legendId);

  chart.innerHTML = "";
  legend.innerHTML = "";

  const cleanRows = rows
    .filter((row) => Math.abs(row.value) > 0)
    .slice(0, 8)
    .map((row) => ({ ...row, value: Math.abs(row.value) }));

  const total = cleanRows.reduce((sum, row) => sum + row.value, 0);

  if (!cleanRows.length || total === 0) {
    chart.className = "donut-chart empty";
    chart.innerHTML = `<span>${emptyText}</span>`;
    legend.innerHTML = `<p class="hint">${emptyText}</p>`;
    return;
  }

  chart.className = "donut-chart";

  let cursor = 0;
  const segments = cleanRows.map((row, index) => {
    const start = cursor;
    const end = cursor + (row.value / total) * 100;
    cursor = end;
    const color = palette[index % palette.length];
    return `${color} ${start}% ${end}%`;
  });

  chart.style.background = `conic-gradient(${segments.join(", ")})`;

  const center = document.createElement("div");
  center.className = "donut-center";
  center.innerHTML = `<strong>${formatMoney(total)}</strong><small>total</small>`;
  chart.appendChild(center);

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

  renderCssDonut("expenseDonutChart", "expenseDonutLegend", expenseRows, "Sem despesas no período.");
  renderCssDonut("inflowDonutChart", "inflowDonutLegend", inflowRows, "Sem entradas no período.");

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
      <td class="right row-actions">
        <button class="secondary" data-edit-id="${movement.id}">Editar</button>
        <button class="danger" data-delete-id="${movement.id}">Apagar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => startEditingMovement(button.dataset.editId));
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

  renderCssDonut("expenseDonutChart", "expenseDonutLegend", expenseRows, "Sem despesas no período.");
  renderCssDonut("inflowDonutChart", "inflowDonutLegend", inflowRows, "Sem entradas no período.");

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
    subscribeCategories();
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
el("categoryForm").addEventListener("submit", addCategory);
el("cancelEditBtn").addEventListener("click", stopEditing);
el("tableTypeFilter").addEventListener("change", render);
el("tableCategoryFilter").addEventListener("change", render);
el("exportBtn").addEventListener("click", exportCSV);
el("refreshBtn").addEventListener("click", manualRefresh);


document.addEventListener("click", (event) => {
  const openBtn = event.target.closest("#openCategoriesBtn");
  if (openBtn) {
    event.preventDefault();
    openCategoryModal();
    return;
  }

  const closeBtn = event.target.closest("#closeCategoriesBtn");
  if (closeBtn) {
    event.preventDefault();
    closeCategoryModal();
    return;
  }

  if (event.target.id === "categoryModal") {
    closeCategoryModal();
  }
});

updateCategoryOptions();
setDefaultDate();

if (localStorage.getItem("cashflowPinOk") === "true") {
  showApp();
  ensureAuth().then(() => {
    subscribeMovements();
    subscribeCategories();
  }).catch((error) => {
    alert("Erro na autenticação anónima: " + error.message);
  });
}
