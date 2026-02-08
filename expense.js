// expense.js (Enhanced with Charts & Analytics)
import { AuthService } from './js/auth-service.js';
import { DBService } from './js/db-service.js';
import { AIService } from './js/ai-service.js';
import { createDonutChart, createLineChart, destroyChart } from './js/chart-utils.js';
import { calculateFinanceStats, analyzeSpendingByCategory, getSpendingTrend } from './js/analytics.js';

const TIMEZONE = "Asia/Kolkata";
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

let finances = [];
let monthlyBudget = null;
let currentCal = new Date();
currentCal.setDate(1);
let currentUser = null;

// Chart instances
let categoryChart = null;
let trendChart = null;

// DOM
const userName = document.getElementById('user-name');
const userPhoto = document.getElementById('user-photo');
const form = document.getElementById("expense-form");
const descInput = document.getElementById("expense-desc");
const amountInput = document.getElementById("expense-amount");
const categorySelect = document.getElementById("expense-category");
const subCategorySelect = document.getElementById("expense-subcategory");
const tableBody = document.getElementById("expense-table-body");
const summary = document.getElementById("expense-summary");
const budgetInput = document.getElementById("budget-input");
const budgetSave = document.getElementById("budget-save");
const budgetWarning = document.getElementById("budget-warning");
const toggleExpense = document.getElementById("btn-expense");
const toggleIncome = document.getElementById("btn-income");

// AI Chat elements
const fab = document.getElementById('ai-fab');
const chatPopup = document.getElementById('ai-chat-popup');
const chatClose = document.getElementById('ai-close');
const chatInput = document.getElementById('ai-chat-input');
const chatSend = document.getElementById('ai-chat-send');
const chatBody = document.getElementById('ai-chat-body');

// Category change handler - filter sub-categories
categorySelect.addEventListener('change', function () {
  const selectedCategory = this.value;
  const allOptions = subCategorySelect.querySelectorAll('option');

  // Reset and show placeholder
  subCategorySelect.value = '';

  allOptions.forEach(option => {
    if (option.value === '') {
      option.style.display = 'block'; // Always show placeholder
    } else if (option.dataset.category === selectedCategory) {
      option.style.display = 'block'; // Show matching options
    } else {
      option.style.display = 'none'; // Hide non-matching options
    }
  });
});

AuthService.onUserChange((user) => {
  currentUser = user;
  if (user) {
    userName.textContent = user.displayName;
    userPhoto.src = user.photoURL;
  } else {
    userName.textContent = AuthService.isLocalOnly() ? "Guest Mode" : "Sign in";
    userPhoto.src = "https://ui-avatars.com/api/?name=Guest";
  }

  // Reactive Subscriptions
  DBService.subscribe(user?.uid, 'finances', (data) => {
    finances = data;
    renderFinances();
    renderAnalytics();
    renderCharts();
  });

  DBService.subscribe(user?.uid, 'monthlyBudget', (data) => {
    const settings = data.find(d => d.id === 'settings');
    monthlyBudget = settings ? settings.value : null;
    if (budgetInput) {
      budgetInput.value = monthlyBudget || "";
      budgetInput.disabled = !!monthlyBudget;
    }
    if (budgetSave) {
      budgetSave.textContent = monthlyBudget ? 'Edit Budget' : 'Save Budget';
      if (monthlyBudget) budgetSave.classList.replace('btn-primary', 'btn-secondary');
      else budgetSave.classList.replace('btn-secondary', 'btn-primary');
    }
    updateBudgetUI();
    updateFinanceSummary();
    renderAnalytics();
  });

});

let filterCategory = "";
let searchQuery = "";

// Filter Listeners
document.getElementById('filter-category').onchange = (e) => {
  filterCategory = e.target.value;
  renderFinances();
};

document.getElementById('search-input').oninput = (e) => {
  searchQuery = e.target.value.toLowerCase();
  renderFinances();
};

function renderFinances() {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const filtered = finances.filter(f => {
    const matchesCategory = !filterCategory || f.category === filterCategory;
    const matchesSearch = !searchQuery || f.desc.toLowerCase().includes(searchQuery) || (f.category && f.category.toLowerCase().includes(searchQuery));
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" class="muted center" style="padding:20px;">No matching entries found.</td></tr>';
  } else {
    filtered.slice().sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO)).forEach((f, idx) => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border)";
      tr.innerHTML = `
        <td style="padding:10px;">${idx + 1}</td>
        <td style="padding:10px; font-weight:600; color:${f.type === 'income' ? 'var(--success)' : 'var(--danger)'}">
          ${f.type === 'income' ? '+' : '-'} ₹${Number(f.amount).toFixed(2)}
        </td>
        <td style="padding:10px;">${f.category || (f.type === 'income' ? 'Income' : 'Misc')}</td>
        <td style="padding:10px;" class="muted">${f.subCategory || '-'}</td>
        <td style="padding:10px;" class="muted">${f.dateISO}</td>
        <td style="padding:10px;">
          <span style="padding: 2px 6px; background: rgba(0,0,0,0.05); border-radius: 4px; font-size: 0.8rem;">
            ${f.mode || 'Cash'}
          </span>
        </td>
        <td style="padding:10px;">${f.desc}</td>
        <td style="padding:10px;">
          <button class="btn accent" style="background:rgba(255,0,0,0.1); color:var(--danger); padding:4px 8px; font-size:0.75rem; border-radius: 6px; border:none; cursor:pointer;">
            Delete
          </button>
        </td>
      `;
      tr.querySelector('button').onclick = () => deleteEntry(f.id);
      tableBody.appendChild(tr);
    });
  }
  updateFinanceSummary();
  updateBudgetUI();
}


function updateFinanceSummary() {
  const today = todayStr();
  const currentMonth = today.slice(0, 7);

  const todaySpent = finances.filter(f => f.type === 'expense' && f.dateISO === today).reduce((s, f) => s + f.amount, 0);
  const monthSpent = finances.filter(f => f.type === 'expense' && f.dateISO.startsWith(currentMonth)).reduce((s, f) => s + f.amount, 0);
  const monthIncome = finances.filter(f => f.type === 'income' && f.dateISO.startsWith(currentMonth)).reduce((s, f) => s + f.amount, 0);

  // Update summary cards
  const todayTotalEl = document.getElementById('today-total');
  const monthTotalEl = document.getElementById('month-total');
  const monthIncomeEl = document.getElementById('month-income-total');
  const budgetStatusEl = document.getElementById('budget-status');

  if (todayTotalEl) todayTotalEl.textContent = `₹${todaySpent.toFixed(2)}`;
  if (monthTotalEl) monthTotalEl.textContent = `₹${monthSpent.toFixed(2)}`;
  if (monthIncomeEl) monthIncomeEl.textContent = `₹${monthIncome.toFixed(2)}`;

  if (budgetStatusEl && monthlyBudget) {
    const remaining = monthlyBudget - monthSpent;
    if (remaining >= 0) {
      budgetStatusEl.textContent = `₹${remaining.toFixed(2)} Left`;
      budgetStatusEl.style.color = '#10B981';
    } else {
      budgetStatusEl.textContent = `₹${Math.abs(remaining).toFixed(2)} Over`;
      budgetStatusEl.style.color = '#EF4444';
    }
  } else if (budgetStatusEl) {
    budgetStatusEl.textContent = 'Not Set';
    budgetStatusEl.style.color = '#6B7280';
  }
}


function updateBudgetUI() {
  if (!monthlyBudget || !budgetWarning) {
    budgetWarning?.classList.add('hidden');
    return;
  }
  const month = todayStr().slice(0, 7);
  const spent = finances.filter(f => f.type === 'expense' && f.dateISO.startsWith(month)).reduce((s, f) => s + f.amount, 0);

  budgetWarning.classList.remove('hidden');
  if (spent > monthlyBudget) {
    budgetWarning.className = "alert danger";
    budgetWarning.textContent = `🚫 Over Budget! Spent ₹${spent.toFixed(2)} / ₹${monthlyBudget.toFixed(2)}`;
  } else {
    budgetWarning.className = "alert success";
    budgetWarning.style.background = "rgba(46, 204, 113, 0.1)";
    budgetWarning.textContent = `✅ On Track. ₹${(monthlyBudget - spent).toFixed(2)} remaining.`;
  }
}

async function deleteEntry(id) {
  if (confirm('Are you sure you want to delete this entry?')) {
    await DBService.deleteData(currentUser?.uid, 'finances', id);
  }
}

function renderAnalytics() {
  const analyticsStats = document.getElementById('analytics-stats');
  if (!analyticsStats) return;

  const stats = calculateFinanceStats(finances, monthlyBudget);

  analyticsStats.innerHTML = `
    <div class="stat-card hover-scale">
      <span class="stat-card-icon">💸</span>
      <div class="stat-card-value" style="color: var(--danger)">₹${stats.monthlyExpenses.toFixed(0)}</div>
      <div class="stat-card-label">Monthly Expenses</div>
    </div>
    
    <div class="stat-card hover-scale">
      <span class="stat-card-icon">💰</span>
      <div class="stat-card-value" style="color: var(--success)">₹${stats.monthlyIncome.toFixed(0)}</div>
      <div class="stat-card-label">Monthly Income</div>
    </div>
    
    <div class="stat-card hover-scale">
      <span class="stat-card-icon">📊</span>
      <div class="stat-card-value" style="color: ${stats.savingsRate >= 0 ? 'var(--success)' : 'var(--danger)'}">${stats.savingsRate}%</div>
      <div class="stat-card-label">Savings Rate</div>
    </div>
    
    <div class="stat-card hover-scale">
      <span class="stat-card-icon">🎯</span>
      <div class="stat-card-value" style="color: ${stats.budgetUsedPercent > 90 ? 'var(--danger)' : stats.budgetUsedPercent > 70 ? 'var(--warning)' : 'var(--success)'}">₹${stats.avgDailySpending.toFixed(0)}</div>
      <div class="stat-card-label">Avg Daily Spend</div>
    </div>
  `;
}

function renderCharts() {
  // Category Chart
  const categoryCanvas = document.getElementById('category-chart');
  if (categoryCanvas && typeof Chart !== 'undefined') {
    const categories = analyzeSpendingByCategory(finances);
    const labels = Object.keys(categories);
    const data = Object.values(categories);

    if (categoryChart) destroyChart(categoryChart);

    if (labels.length > 0) {
      categoryChart = createDonutChart(categoryCanvas, data, labels);
    }
  }

  // Trend Chart
  const trendCanvas = document.getElementById('trend-chart');
  if (trendCanvas && typeof Chart !== 'undefined') {
    const trend = getSpendingTrend(finances, 7);
    const labels = trend.map(t => t.label);
    const data = trend.map(t => t.amount);

    if (trendChart) destroyChart(trendChart);

    if (labels.length > 0) {
      trendChart = createLineChart(trendCanvas, data, labels, 'Daily Spending');
    }
  }
}

form.onsubmit = async (e) => {
  e.preventDefault();
  const desc = descInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const type = toggleIncome.classList.contains('active') ? 'income' : 'expense';
  const category = categorySelect.value;
  const subCategory = subCategorySelect.value;
  const mode = document.getElementById('expense-mode').value;
  const dateInput = document.getElementById('expense-date');
  const dateISO = dateInput.value || todayStr();

  if (!desc || isNaN(amount) || amount <= 0) {
    alert('Please enter valid description and amount');
    return;
  }

  if (type === 'expense' && (!category || !subCategory)) {
    alert('Please select category and sub-category for expenses');
    return;
  }

  const id = crypto.randomUUID();
  const expenseData = {
    id,
    desc,
    amount,
    type,
    dateISO,
    category: type === 'expense' ? category : '',
    subCategory: type === 'expense' ? subCategory : '',
    mode: type === 'expense' ? mode : ''
  };

  await DBService.saveData(currentUser?.uid, 'finances', id, expenseData);

  // Clear form
  descInput.value = "";
  amountInput.value = "";
  categorySelect.value = "";
  subCategorySelect.value = "";
  dateInput.value = "";

  // Show success message
  alert('Entry added successfully!');
};


if (budgetSave) {
  budgetSave.onclick = async () => {
    const isEditing = budgetSave.textContent.includes('Edit');

    if (isEditing) {
      budgetInput.disabled = false;
      budgetInput.focus();
      budgetSave.textContent = 'Save Budget';
      budgetSave.classList.replace('btn-secondary', 'btn-primary');
      return;
    }

    const value = parseFloat(budgetInput.value);

    if (isNaN(value) || value < 0) {
      alert('Please enter a valid budget amount');
      return;
    }

    try {
      const isLocal = AuthService.isLocalOnly();
      const uid = isLocal ? null : currentUser?.uid;

      if (!isLocal && !uid) {
        alert('Please sign in to save your budget online, or use Offline mode.');
        return;
      }

      await DBService.saveData(uid, 'monthlyBudget', 'settings', { id: 'settings', value });

      monthlyBudget = value;
      budgetInput.disabled = true;
      budgetSave.textContent = 'Edit Budget';
      budgetSave.classList.replace('btn-primary', 'btn-secondary');

      updateBudgetUI();
      updateFinanceSummary();
      renderAnalytics();

      alert(`Monthly budget set to ₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    } catch (error) {
      console.error('Error saving budget:', error);
      alert('Failed to save budget. Please check your connection or storage.');
    }
  };
}



toggleExpense.onclick = () => { toggleExpense.classList.add('active'); toggleIncome.classList.remove('active'); };
toggleIncome.onclick = () => { toggleIncome.classList.add('active'); toggleExpense.classList.remove('active'); };

// NEW AI CHAT INITIALIZATION
AIService.init({
  fab: document.getElementById('ai-chat-fab'),
  popup: document.getElementById('ai-chat-popup'),
  close: document.getElementById('ai-chat-close'),
  input: document.getElementById('ai-chat-input'),
  send: document.getElementById('ai-chat-send'),
  body: document.getElementById('ai-chat-body')
}, () => ({ finances, budget: monthlyBudget }));


// Calendar History (Simplified for v2)
document.getElementById('open-calendar').onclick = () => {
  document.getElementById('calendar-overlay').classList.remove('hidden');
  renderCalendar();
};
document.getElementById('cal-close').onclick = () => document.getElementById('calendar-overlay').classList.add('hidden');

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const title = document.getElementById('cal-title');
  const y = currentCal.getFullYear();
  const m = currentCal.getMonth();
  title.textContent = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(currentCal);
  grid.innerHTML = "";

  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < first; i++) grid.appendChild(document.createElement('div'));
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const day = document.createElement('div');
    day.className = 'day';
    day.innerHTML = `<span style="font-size:0.7rem;">${d}</span>`;
    const spent = finances.filter(f => f.type === 'expense' && f.dateISO === iso).reduce((s, f) => s + f.amount, 0);
    if (spent > 0) {
      const p = document.createElement('div');
      p.className = 'pill spend';
      day.appendChild(p);
    }
    grid.appendChild(day);
  }
}
document.getElementById('cal-prev').onclick = () => { currentCal.setMonth(currentCal.getMonth() - 1); renderCalendar(); };
document.getElementById('cal-next').onclick = () => { currentCal.setMonth(currentCal.getMonth() + 1); renderCalendar(); };
