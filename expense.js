// expense.js (Enhanced with Charts & Analytics)
import { AuthService } from './js/auth-service.js';
import { DBService } from './js/db-service.js';
import { AIService } from './js/ai-service.js';
import { FinancialEngine } from './js/financial-engine.js';
import { NotificationService } from './js/notification-service.js';
import { createDonutChart, createLineChart, createTrajectoryChart, destroyChart } from './js/chart-utils.js';
import { calculateFinanceStats, analyzeSpendingByCategory, getSpendingTrend, calculateBudgetTrajectory } from './js/analytics.js';
import { parseSMS } from './js/sms-parser.js';

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
let trajectoryChart = null;
let lastAiUpdate = 0;
let currentEngineState = { state: {}, risks: {}, behavior: {} };

// DOM
const userName = document.getElementById('user-name');
const userPhoto = document.getElementById('user-photo');
const userEmail = document.getElementById('user-email');
const loggedOutView = document.getElementById('logged-out-view');
const userInfoSection = document.getElementById('user-info');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const form = document.getElementById("expense-form");
const descInput = document.getElementById("expense-desc");
const amountInput = document.getElementById("expense-amount");
const categorySelect = document.getElementById("expense-category");
const subCategorySelect = document.getElementById("expense-subcategory");
const tableBody = document.getElementById("expense-table-body");
const budgetInput = document.getElementById("budget-input");
const budgetSave = document.getElementById("budget-save");
const budgetWarning = document.getElementById("budget-warning");
const toggleExpense = document.getElementById("btn-expense");
const toggleIncome = document.getElementById("btn-income");

// AI Chat elements (Updated IDs to match expense.html)
const fab = document.getElementById('ai-chat-fab');
const chatPopup = document.getElementById('ai-chat-popup');
const chatClose = document.getElementById('ai-chat-close');
const chatInput = document.getElementById('ai-chat-input');
const chatSend = document.getElementById('ai-chat-send');
const chatBody = document.getElementById('ai-chat-body');

// Category change handler - filter sub-categories
if (categorySelect) {
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
}

// Preserve original expense options so we can restore when switching modes
const originalCategoryOptions = categorySelect ? categorySelect.innerHTML : '';
const originalSubCategoryOptions = subCategorySelect ? subCategorySelect.innerHTML : '';

// Income categories & subcategories mapping
const incomeCategoryMap = {
  'Salary': ['Salary'],
  'Business': ['Sales', 'Freelance', 'Consulting'],
  'Investment Income': ['Dividends', 'Interest', 'Capital Gains'],
  'Gifts': ['Family', 'Friends', 'Other'],
  'Other Income': ['Miscellaneous']
};

function populateCategoriesForIncome() {
  if (!categorySelect || !subCategorySelect) return;
  // build category options
  categorySelect.innerHTML = '<option value="">Select Income Category</option>' +
    Object.keys(incomeCategoryMap).map(k => `<option value="${k}">${k}</option>`).join('\n');

  // build subcategory options with data-category attributes
  let subHtml = '<option value="">Select Sub Category</option>';
  Object.keys(incomeCategoryMap).forEach(cat => {
    incomeCategoryMap[cat].forEach(sub => {
      subHtml += `<option value="${sub}" data-category="${cat}">${sub}</option>`;
    });
  });
  subCategorySelect.innerHTML = subHtml;
}

function restoreExpenseCategories() {
  if (!categorySelect || !subCategorySelect) return;
  categorySelect.innerHTML = originalCategoryOptions;
  subCategorySelect.innerHTML = originalSubCategoryOptions;
}

AuthService.onUserChange((user) => {
  currentUser = user;
  if (user) {
    if (userInfoSection) userInfoSection.classList.remove('hidden');
    if (loggedOutView) loggedOutView.classList.add('hidden');
    if (userName) userName.textContent = user.displayName || "Unknown User";
    if (userEmail) userEmail.textContent = user.email || "";
    if (userPhoto) {
      userPhoto.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=5B6CF2&color=fff`;
    }

    // 🔔 Request notification permission early (before any alerts are triggered)
    if (NotificationService.isSupported() && Notification.permission === 'default') {
      NotificationService.requestPermission()
        .then(permission => {
          console.log('📢 Notification permission:', permission);
          if (permission === 'granted') {
            NotificationService.show('Notifications Enabled', 'You\'ll receive alerts about your spending and investments.');
          }
        })
        .catch(err => console.warn('⚠️ Notification permission request failed:', err));
    }
  } else {
    if (userInfoSection) userInfoSection.classList.add('hidden');
    if (loggedOutView) loggedOutView.classList.remove('hidden');
    if (userName) userName.textContent = AuthService.isLocalOnly() ? "Guest Mode" : "Sign in";
    if (userPhoto) userPhoto.src = "https://ui-avatars.com/api/?name=Guest";
  }

  // Reactive Subscriptions
  DBService.subscribe(user?.uid, 'finances', (data) => {
    finances = data;

    // GEN-3 Architecture: Run Engines
    const state = FinancialEngine.calculateState(finances, monthlyBudget);
    const risks = FinancialEngine.runRiskEngine(state, monthlyBudget);
    const behavior = FinancialEngine.runBehaviorModel(finances);

    // Save state objects for AI and UI (Async)
    const uid = AuthService.isLocalOnly() ? null : user?.uid;
    DBService.saveData(uid, 'engineState', 'financialState', state);
    DBService.saveData(uid, 'engineState', 'riskSignals', risks);
    DBService.saveData(uid, 'engineState', 'behaviorProfile', behavior);

    // Register state locally for Chat
    currentEngineState = { state, risks, behavior };

    renderFinances();
    renderAnalytics();
    renderCharts();
    updateAISmartDashboard(state, risks, behavior);
    processProactiveAlerts(finances, monthlyBudget);
    updateHeaderLevel();
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

    // Recalculate with new budget
    const state = FinancialEngine.calculateState(finances, monthlyBudget);
    const risks = FinancialEngine.runRiskEngine(state, monthlyBudget);
    const behavior = FinancialEngine.runBehaviorModel(finances);
    updateAISmartDashboard(state, risks, behavior);
  });
});

let filterCategory = "";
let searchQuery = "";

// Filter Listeners
const filterCatEl = document.getElementById('filter-category');
if (filterCatEl) {
  filterCatEl.onchange = (e) => {
    filterCategory = e.target.value;
    renderFinances();
  };
}

const searchInputEl = document.getElementById('search-input');
if (searchInputEl) {
  searchInputEl.oninput = (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderFinances();
  };
}

function renderFinances() {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const filtered = (finances || []).filter(f => {
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

  const todaySpent = (finances || []).filter(f => f.type === 'expense' && f.dateISO === today).reduce((s, f) => s + f.amount, 0);
  const monthSpent = (finances || []).filter(f => f.type === 'expense' && f.dateISO.startsWith(currentMonth)).reduce((s, f) => s + f.amount, 0);
  const monthIncome = (finances || []).filter(f => f.type === 'income' && f.dateISO.startsWith(currentMonth)).reduce((s, f) => s + f.amount, 0);

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
  const spent = (finances || []).filter(f => f.type === 'expense' && f.dateISO.startsWith(month)).reduce((s, f) => s + f.amount, 0);

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

async function updateAISmartDashboard(state, risks, behavior) {
  const dashboard = document.getElementById('ai-smart-dashboard');
  const insightEl = document.getElementById('ai-dashboard-insight');
  if (!dashboard || !insightEl) return;

  if (!monthlyBudget) {
    dashboard.style.display = 'none';
    return;
  }

  dashboard.style.display = 'block';

  // Throttle AI updates
  const now = Date.now();
  if (now - lastAiUpdate < 30000) return;
  lastAiUpdate = now;

  try {
    const insight = await AIService.generateDashboardInsight({
      budget: monthlyBudget,
      state,
      risks,
      behavior
    });

    if (insight) {
      insightEl.innerHTML = insight;
    }
  } catch (err) {
    console.error("Dashboard AI Insight Error:", err);
  }
}

if (form) {
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

    if ((!category || !subCategory)) {
      alert('Please select category and sub-category');
      return;
    }

    const id = crypto.randomUUID();
    const expenseData = {
      id,
      desc,
      amount,
      type,
      dateISO,
      category: category,
      subCategory: subCategory,
      mode: mode,
      timestamp: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}Z`; })()
    };

    await DBService.saveData(currentUser?.uid, 'finances', id, expenseData);

    // immediately update local cache/UI in case storage event is slow
    finances.push(expenseData);
    renderFinances();

    // Gamification: Award 10 XP
    try {
      const { GamificationService } = await import('./js/gamification-service.js');
      await GamificationService.awardPoints(10);
      updateHeaderLevel();
    } catch (err) {
      console.warn("Gamification points not awarded:", err);
    }

    // Clear form
    if (descInput) descInput.value = "";
    if (amountInput) amountInput.value = "";
    if (categorySelect) categorySelect.value = "";
    if (subCategorySelect) subCategorySelect.value = "";
    if (dateInput) dateInput.value = "";

    alert('Entry added successfully!');
    NotificationService.requestPermission();
  };
}

function processProactiveAlerts(finances, budget) {
  if (!budget) return;

  const alerts = FinancialEngine.getAlerts(finances, budget);

  alerts.forEach(alert => {
    const alertKey = `last_alert_${alert.type}_${alert.message.length}`;
    const lastShown = sessionStorage.getItem(alertKey);
    const now = Date.now();

    if (!lastShown || (now - parseInt(lastShown)) > (120 * 60 * 1000)) {
      NotificationService.show(alert.title, alert.message);
      sessionStorage.setItem(alertKey, now.toString());

      const chatBody = document.getElementById('ai-chat-body');
      if (chatBody) {
        AIService.appendMessage(chatBody, `<strong>${alert.title}</strong><br>${alert.message}`, 'ai');
      }
    }
  });
}

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

if (toggleExpense) {
  toggleExpense.onclick = () => {
    toggleExpense.classList.add('active');
    toggleIncome.classList.remove('active');
    const title = document.getElementById('entry-form-title');
    if (title) title.innerHTML = '➕ Add New Expense';
    restoreExpenseCategories();
  };
}
if (toggleIncome) {
  toggleIncome.onclick = () => {
    toggleIncome.classList.add('active');
    toggleExpense.classList.remove('active');
    const title = document.getElementById('entry-form-title');
    if (title) title.innerHTML = '💰 Add New Income';
    populateCategoriesForIncome();
  };
}

// NEW AI CHAT INITIALIZATION
AIService.init({
  fab: document.getElementById('ai-chat-fab'),
  popup: document.getElementById('ai-chat-popup'),
  close: document.getElementById('ai-chat-close'),
  input: document.getElementById('ai-chat-input'),
  send: document.getElementById('ai-chat-send'),
  body: document.getElementById('ai-chat-body')
}, () => ({
  finances,
  budget: monthlyBudget,
  engineState: currentEngineState
}));

// Calendar History
document.getElementById('open-calendar')?.addEventListener('click', () => {
  document.getElementById('calendar-overlay')?.classList.remove('hidden');
  renderCalendar();
});

document.getElementById('cal-close')?.addEventListener('click', () => {
  document.getElementById('calendar-overlay')?.classList.add('hidden');
});

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const title = document.getElementById('cal-title');
  if (!grid || !title) return;

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
    const spent = (finances || []).filter(f => f.type === 'expense' && f.dateISO === iso).reduce((s, f) => s + f.amount, 0);
    if (spent > 0) {
      const p = document.createElement('div');
      p.className = 'pill spend';
      day.appendChild(p);
    }
    grid.appendChild(day);
  }
}

document.getElementById('cal-prev')?.addEventListener('click', () => {
  currentCal.setMonth(currentCal.getMonth() - 1);
  renderCalendar();
});

document.getElementById('cal-next')?.addEventListener('click', () => {
  currentCal.setMonth(currentCal.getMonth() + 1);
  renderCalendar();
});


// Magic SMS Paste Logic
const processSmsBtn = document.getElementById('sms-process-btn');
const smsPasteArea = document.getElementById('sms-input');

if (processSmsBtn && smsPasteArea) {
  processSmsBtn.onclick = async () => {
    const text = smsPasteArea.value.trim();
    if (!text) {
      alert('Please paste an SMS first');
      return;
    }

    processSmsBtn.textContent = '✨ Parsing SMS...';
    processSmsBtn.disabled = true;

    try {
      const result = await parseSMS(text);

      if (result && result.success) {

        // --- AUTO ADD TO DATABASE ---
        const id = crypto.randomUUID();
        const expenseData = {
          id,
          desc: result.description || 'Magic Paste Entry',
          amount: parseFloat(result.amount) || 0,
          type: result.type || 'expense',
          dateISO: result.date || todayStr(),
          category: result.category || 'Miscellaneous',
          subCategory: 'Bank Sync',
          mode: 'Bank Account',
          timestamp: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}Z`; })()
        };

        await DBService.saveData(currentUser?.uid, 'finances', id, expenseData);

        // Gamification XP
        try {
          const { GamificationService } = await import('./js/gamification-service.js');
          await GamificationService.awardPoints(10);
          updateHeaderLevel();
        } catch (err) {
          console.warn("Gamification points not awarded:", err);
        }

        // Populate form fields (so they can see what was added)
        if (descInput) descInput.value = result.description || '';
        if (amountInput) amountInput.value = result.amount || 0;

        const dateInput = document.getElementById('expense-date');
        if (dateInput) dateInput.value = result.date || todayStr();

        // Handle Type (Expense/Income)
        if (result.type === 'income') {
          if (toggleIncome) toggleIncome.click();
        } else {
          if (toggleExpense) toggleExpense.click();
        }

        // Handle Category
        if (categorySelect && result.category) {
          const options = Array.from(categorySelect.options);
          const found = options.find(o => o.value.toLowerCase() === result.category.toLowerCase() || result.category.toLowerCase().includes(o.value.toLowerCase()));

          if (found) {
            categorySelect.value = found.value;
            categorySelect.dispatchEvent(new Event('change'));
          }
        }

        // Visual feedback
        processSmsBtn.textContent = '✅ Added to Database!';
        processSmsBtn.style.background = 'var(--success)';
        processSmsBtn.style.color = 'white';

        // Clear input area
        smsPasteArea.value = '';

        setTimeout(() => {
          processSmsBtn.textContent = 'Extract Details';
          processSmsBtn.style.background = '';
          processSmsBtn.style.color = '';
        }, 3000);

      } else {
        alert('Could not parse the SMS definitively. Please check the format or fill manually.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to parser.');
    } finally {
      processSmsBtn.disabled = false;
      if (processSmsBtn.textContent.includes('Parsing')) {
        processSmsBtn.textContent = 'Extract Details';
      }
    }
  };
}



// Auth Action Listeners
if (loginBtn) loginBtn.onclick = () => AuthService.login();

async function updateHeaderLevel() {
  try {
    const { GamificationService } = await import('./js/gamification-service.js');
    const stats = await GamificationService.getStats();
    const badge = document.getElementById('header-level-badge');
    if (badge) {
      badge.textContent = `LVL ${stats.level || 0}`;
      badge.style.display = 'inline-block';
    }
  } catch (err) {
    console.warn("Failed to update header level:", err);
  }
}
