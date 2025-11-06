/*****************
 *  FIREBASE AUTH + FIRESTORE (requires compat SDK loaded in index.html)
 *****************/
let currentUser = null;
const usersCollection = () => db.collection("users");

/*****************
 *  APP STATE
 *****************/
let activities = [];        // [{id,name,streak,lastDone}]
let finances = [];          // [{id,type,desc,amount,dateISO}]
let habitLogs = {};         // { "YYYY-MM-DD": ["Gym","Pray"] }
let monthlyBudget = null;   // number
let expenseType = "expense";

/*****************
 *  HELPERS
 *****************/
const TIMEZONE = "Asia/Kolkata";
const todayStr = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

const toUTC = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000);

/*****************
 *  DOM REFS (safe to read because script is placed after HTML)
 *****************/
// Auth UI
const loginBtn   = document.getElementById("login-btn");
const userInfo   = document.getElementById("user-info");
const userNameEl = document.getElementById("user-name");
const userPhoto  = document.getElementById("user-photo");

// Habits
const activityForm  = document.getElementById("activity-form");
const activityInput = document.getElementById("activity-input");
const activityList  = document.getElementById("activity-list");

// Expenses
const expenseForm   = document.getElementById("expense-form");
const expenseDesc   = document.getElementById("expense-desc");
const expenseAmount = document.getElementById("expense-amount");
const expenseTable  = document.getElementById("expense-table-body");
const expenseSummary= document.getElementById("expense-summary");
const btnExpense    = document.getElementById("btn-expense");
const btnIncome     = document.getElementById("btn-income");

// Budget
const budgetInput   = document.getElementById("budget-input");
const budgetSaveBtn = document.getElementById("budget-save");
const budgetWarning = document.getElementById("budget-warning");

// Calendar modal
const openCalendarBtn = document.getElementById("open-calendar");
const overlay         = document.getElementById("calendar-overlay");
const calCloseBtn     = document.getElementById("cal-close");
const calPrevBtn      = document.getElementById("cal-prev");
const calNextBtn      = document.getElementById("cal-next");
const calTitle        = document.getElementById("cal-title");
const calGrid         = document.getElementById("calendar-grid");
const dayDetails      = document.getElementById("day-details");

let currentCal = new Date();
currentCal.setDate(1); // make month math sane

/*****************
 *  FIREBASE AUTH FLOW
 *****************/
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    // Show user info
    loginBtn.classList.add("hidden");
    userInfo.classList.remove("hidden");
    userNameEl.innerText = user.displayName || "You";
    userPhoto.src = user.photoURL || "";

    await loadDataFromFirestore();
    renderActivities();
    renderFinances();
    updateBudgetUI();
  } else {
    currentUser = null;
    // Show login button, hide user box
    loginBtn.classList.remove("hidden");
    userInfo.classList.add("hidden");

    // Clear UI (don’t leak previous user’s data)
    activities = [];
    finances = [];
    habitLogs = {};
    monthlyBudget = null;
    renderActivities();
    renderFinances();
    updateBudgetUI();
  }
});

loginBtn.addEventListener("click", () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
});
document.getElementById("logout-btn").addEventListener("click", () => {
  auth.signOut();
});

/*****************
 *  FIRESTORE LOAD/SAVE
 *****************/
async function loadDataFromFirestore() {
  if (!currentUser) return;
  const docRef = usersCollection().doc(currentUser.uid);
  const snap = await docRef.get();
  if (snap.exists) {
    const data = snap.data();
    activities    = Array.isArray(data.activities) ? data.activities : [];
    finances      = Array.isArray(data.finances)   ? data.finances   : [];
    habitLogs     = data.habitLogs    || {};
    monthlyBudget = data.monthlyBudget ?? null;
  } else {
    await docRef.set({
      activities: [], finances: [], habitLogs: {}, monthlyBudget: null
    });
    activities = []; finances = []; habitLogs = {}; monthlyBudget = null;
  }
}

async function saveDataToFirestore() {
  if (!currentUser) return;
  await usersCollection().doc(currentUser.uid).set({
    activities, finances, habitLogs, monthlyBudget
  }, { merge: true });
}

/*****************
 *  HABITS
 *****************/
function renderActivities() {
  activityList.innerHTML = "";
  if (!activities.length) {
    activityList.innerHTML = `<li class="item"><span class="muted">No habits yet. Add one above.</span></li>`;
    return;
  }
  activities.forEach(a => {
    const doneToday = a.lastDone === todayStr();
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div>
        <div class="name">${a.name}</div>
        <div class="meta">${a.lastDone ? `Last: ${a.lastDone}` : "Not done yet"}</div>
      </div>
      <div class="badge">🔥 Streak: ${a.streak || 0}</div>
      <div class="actions">
        <button class="success" ${doneToday ? "disabled" : ""} data-action="done">Done</button>
        <button class="secondary" data-action="reset">Reset</button>
        <button class="danger" data-action="delete">Delete</button>
      </div>
    `;
    li.querySelector('[data-action="done"]').onclick   = () => markHabitDone(a.id);
    li.querySelector('[data-action="reset"]').onclick  = () => resetHabit(a.id);
    li.querySelector('[data-action="delete"]').onclick = () => deleteHabit(a.id);
    activityList.appendChild(li);
  });
}

async function addHabit(name) {
  if (!currentUser) return alert("Please login first.");
  name = (name || "").trim();
  if (!name) return;
  if (activities.some(h => (h.name || "").toLowerCase() === name.toLowerCase())) {
    alert("Habit already exists."); return;
  }
  activities.push({ id: crypto.randomUUID(), name, streak: 0, lastDone: null });
  await saveDataToFirestore();
  renderActivities();
}

async function markHabitDone(id) {
  if (!currentUser) return alert("Please login first.");
  const a = activities.find(h => h.id === id);
  if (!a) return;
  const today = todayStr();
  if (a.lastDone === today) return;

  if (!a.lastDone) a.streak = 1;
  else a.streak = diffDays(today, a.lastDone) === 1 ? (a.streak || 0) + 1 : 1;

  a.lastDone = today;

  if (!habitLogs[today]) habitLogs[today] = [];
  if (!habitLogs[today].includes(a.name)) habitLogs[today].push(a.name);

  await saveDataToFirestore();
  renderActivities();
}

async function resetHabit(id) {
  const a = activities.find(h => h.id === id);
  if (!a) return;
  a.streak = 0; a.lastDone = null;
  await saveDataToFirestore();
  renderActivities();
}

async function deleteHabit(id) {
  activities = activities.filter(h => h.id !== id);
  await saveDataToFirestore();
  renderActivities();
}

/*****************
 *  FINANCES
 *****************/
function renderFinances() {
  expenseTable.innerHTML = "";
  if (!finances.length) {
    expenseTable.innerHTML = `<tr><td colspan="5" class="muted">No entries yet.</td></tr>`;
  } else {
    // newest first
    finances.slice().sort((a,b)=>toUTC(b.dateISO)-toUTC(a.dateISO)).forEach(f => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${f.type === "income" ? "💰 Income" : "💸 Expense"}</td>
        <td>${f.desc}</td>
        <td>${Number(f.amount).toFixed(2)}</td>
        <td>${f.dateISO}</td>
        <td><button class="danger" data-id="${f.id}">Delete</button></td>
      `;
      tr.querySelector("button").onclick = () => deleteFinance(f.id);
      expenseTable.appendChild(tr);
    });
  }
  updateFinanceSummary();
  updateBudgetUI();
}

async function addFinance(type, desc, amount) {
  if (!currentUser) return alert("Please login first.");
  amount = Number(amount);
  if (!desc || !desc.trim() || isNaN(amount) || amount <= 0) {
    alert("Enter valid description and amount."); return;
  }
  finances.push({
    id: crypto.randomUUID(),
    type,
    desc: desc.trim(),
    amount,
    dateISO: todayStr(),
  });
  await saveDataToFirestore();
  renderFinances();
}

async function deleteFinance(id) {
  finances = finances.filter(f => f.id !== id);
  await saveDataToFirestore();
  renderFinances();
}

function updateFinanceSummary() {
  const today = todayStr();
  const month = today.slice(0,7);

  const todaySpent = finances
    .filter(f => f.type==="expense" && f.dateISO===today)
    .reduce((s,f)=>s+Number(f.amount),0);

  let income=0, expense=0;
  finances.forEach(f=>{
    if (f.dateISO.startsWith(month)) {
      if (f.type==="income") income += Number(f.amount);
      else expense += Number(f.amount);
    }
  });

  const net = income - expense;
  expenseSummary.textContent = `Today Spent: ₹${todaySpent.toFixed(2)} | Month: Income ₹${income.toFixed(2)}, Spent ₹${expense.toFixed(2)} | Net: ₹${net.toFixed(2)}`;
}

/*****************
 *  BUDGET
 *****************/
function updateBudgetUI() {
  // reflect message + input value
  const month = todayStr().slice(0,7);
  const spent = finances.filter(f=>f.type==="expense" && f.dateISO.startsWith(month))
                        .reduce((s,f)=>s+Number(f.amount),0);
  if (monthlyBudget && monthlyBudget > 0) {
    const left = monthlyBudget - spent;
    budgetWarning.classList.remove("hidden");
    if (left < 0) {
      budgetWarning.classList.add("danger");
      budgetWarning.textContent = `⚠ Budget exceeded! Limit ₹${monthlyBudget.toFixed(2)} | Spent ₹${spent.toFixed(2)} | Over by ₹${Math.abs(left).toFixed(2)}`;
    } else {
      budgetWarning.classList.remove("danger");
      budgetWarning.textContent = `Budget: ₹${monthlyBudget.toFixed(2)} | Spent: ₹${spent.toFixed(2)} | Remaining: ₹${left.toFixed(2)}`;
    }
    budgetInput.value = monthlyBudget;
  } else {
    budgetWarning.classList.add("hidden");
    budgetInput.value = "";
  }
}

/*****************
 *  CALENDAR
 *****************/
function openCalendar() {
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden","false");
  renderCalendar();
}
function closeCalendar() {
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden","true");
}

function renderCalendar() {
  const y = currentCal.getFullYear();
  const m = currentCal.getMonth();
  const monthName = new Intl.DateTimeFormat("en", { month: "long" }).format(currentCal);
  calTitle.textContent = `${monthName} ${y}`;

  calGrid.innerHTML = "";
  // weekday headers
  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>{
    const el=document.createElement("div");
    el.className="weekday";
    el.textContent=d;
    calGrid.appendChild(el);
  });

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();

  for (let i=0;i<firstDay;i++) calGrid.appendChild(document.createElement("div"));

  // Month aggregates for speed
  const monthKey = `${y}-${String(m+1).padStart(2,"0")}`;
  const daySpend = {};
  const dayIncome = {};
  finances.forEach(f=>{
    if (f.dateISO.startsWith(monthKey)) {
      if (f.type==="income") dayIncome[f.dateISO] = (dayIncome[f.dateISO]||0)+Number(f.amount);
      else daySpend[f.dateISO] = (daySpend[f.dateISO]||0)+Number(f.amount);
    }
  });

  for (let d=1; d<=daysInMonth; d++) {
    const iso = `${monthKey}-${String(d).padStart(2,"0")}`;
    const cell = document.createElement("div");
    cell.className = "day";
    let pills = "";
    if (habitLogs[iso] && habitLogs[iso].length) pills += `<span class="pill habit">✓ ${habitLogs[iso].length}</span>`;
    if (daySpend[iso])  pills += `<span class="pill spend">-₹${daySpend[iso].toFixed(0)}</span>`;
    if (dayIncome[iso]) pills += `<span class="pill income">+₹${dayIncome[iso].toFixed(0)}</span>`;
    cell.innerHTML = `<header><span>${d}</span></header><div class="pills">${pills}</div>`;
    cell.onclick = () => showDayDetails(iso);
    calGrid.appendChild(cell);
  }

  dayDetails.innerHTML = `<div class="muted">Tap a date to view details.</div>`;
}

function showDayDetails(iso) {
  const habits = habitLogs[iso] || [];
  const spent = finances.filter(f=>f.type==="expense" && f.dateISO===iso).reduce((s,f)=>s+Number(f.amount),0);
  const inc   = finances.filter(f=>f.type==="income"  && f.dateISO===iso).reduce((s,f)=>s+Number(f.amount),0);
  dayDetails.innerHTML = `
    <h4>${new Date(iso).toDateString()}</h4>
    <div class="line"><span>Habits Done</span><span>${habits.length}</span></div>
    <div class="muted">${habits.length ? habits.join(", ") : "None"}</div>
    <div class="line"><span>Spent</span><span>₹${spent.toFixed(2)}</span></div>
    <div class="line"><span>Income</span><span>₹${inc.toFixed(2)}</span></div>
  `;
}

/*****************
 *  EVENT LISTENERS (keep OUTSIDE auth callback)
 *****************/
// Forms
activityForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await addHabit(activityInput.value);
  activityInput.value = "";
  activityInput.focus();
});
expenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await addFinance(expenseType, expenseDesc.value, expenseAmount.value);
  expenseDesc.value = "";
  expenseAmount.value = "";
  expenseDesc.focus();
});

// Toggle buttons (also set active class for colors)
btnExpense.addEventListener("click", () => {
  expenseType = "expense";
  btnExpense.classList.add("active");
  btnIncome.classList.remove("active");
});
btnIncome.addEventListener("click", () => {
  expenseType = "income";
  btnIncome.classList.add("active");
  btnExpense.classList.remove("active");
});

// Budget save
budgetSaveBtn.addEventListener("click", async () => {
  const val = Number(budgetInput.value);
  if (isNaN(val) || val <= 0) { alert("Enter a valid budget."); return; }
  monthlyBudget = val;
  await saveDataToFirestore();
  updateBudgetUI();
});

// Calendar open/close
openCalendarBtn.addEventListener("click", openCalendar);
calCloseBtn.addEventListener("click", closeCalendar);
overlay.addEventListener("click", (e)=>{ if (e.target === overlay) closeCalendar(); });
document.addEventListener("keydown", (e)=>{ if (e.key==="Escape" && !overlay.classList.contains("hidden")) closeCalendar(); });

// Calendar month nav
calPrevBtn.addEventListener("click", ()=>{ currentCal.setMonth(currentCal.getMonth()-1); currentCal.setDate(1); renderCalendar(); });
calNextBtn.addEventListener("click", ()=>{ currentCal.setMonth(currentCal.getMonth()+1); currentCal.setDate(1); renderCalendar(); });

console.log("Firebase Sync Enabled ✅");
