// ============================================
// ANALYTICS.JS - Data Analysis & Insights
// ============================================



/**
 * Calculate finance statistics
 */
export function calculateFinanceStats(finances, monthlyBudget) {
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);

    const stats = {
        totalExpenses: 0,
        totalIncome: 0,
        monthlyExpenses: 0,
        monthlyIncome: 0,
        todayExpenses: 0,
        budgetRemaining: 0,
        budgetUsedPercent: 0,
        savingsRate: 0,
        avgDailySpending: 0,
        topExpense: null
    };

    const todayStr = today.toISOString().slice(0, 10);
    const monthExpenses = [];

    finances.forEach(f => {
        if (f.type === 'expense') {
            stats.totalExpenses += f.amount;
            if (f.dateISO.startsWith(currentMonth)) {
                stats.monthlyExpenses += f.amount;
                monthExpenses.push(f);
            }
            if (f.dateISO === todayStr) {
                stats.todayExpenses += f.amount;
            }
        } else if (f.type === 'income') {
            stats.totalIncome += f.amount;
            if (f.dateISO.startsWith(currentMonth)) {
                stats.monthlyIncome += f.amount;
            }
        }
    });

    // Budget calculations
    if (monthlyBudget) {
        stats.budgetRemaining = monthlyBudget - stats.monthlyExpenses;
        stats.budgetUsedPercent = Math.round((stats.monthlyExpenses / monthlyBudget) * 100);
    }

    // Savings rate
    if (stats.monthlyIncome > 0) {
        stats.savingsRate = Math.round(((stats.monthlyIncome - stats.monthlyExpenses) / stats.monthlyIncome) * 100);
    }

    // Average daily spending
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    stats.avgDailySpending = stats.monthlyExpenses / today.getDate();

    // Top expense
    if (monthExpenses.length > 0) {
        stats.topExpense = monthExpenses.reduce((max, f) => f.amount > max.amount ? f : max);
    }

    return stats;
}

/**
 * Analyze spending by category
 */
export function analyzeSpendingByCategory(finances) {
    const categories = {};
    finances.filter(f => f.type === 'expense').forEach(f => {
        const cat = f.category || 'Miscellaneous';
        categories[cat] = (categories[cat] || 0) + f.amount;
    });
    return categories;
}

/**
 * Get spending trend (last 7 days)
 */
export function getSpendingTrend(finances, days = 7) {
    const trend = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);

        const dayExpenses = finances
            .filter(f => f.type === 'expense' && f.dateISO === dateStr)
            .reduce((sum, f) => sum + f.amount, 0);

        trend.push({
            date: dateStr,
            amount: dayExpenses,
            label: date.toLocaleDateString('en-US', { weekday: 'short' })
        });
    }

    return trend;
}



/**
 * Generate insights based on data
 */
export function generateInsights(habitStats, financeStats) {
    const insights = [];



    // Finance insights
    if (financeStats.budgetUsedPercent > 90) {
        insights.push({
            type: 'danger',
            icon: '⚠️',
            message: `Budget alert! You've used ${financeStats.budgetUsedPercent}% of your monthly budget.`
        });
    } else if (financeStats.budgetUsedPercent > 0 && financeStats.budgetUsedPercent <= 70) {
        insights.push({
            type: 'success',
            icon: '💰',
            message: `Great job! You're at ${financeStats.budgetUsedPercent}% of your budget.`
        });
    }

    if (financeStats.savingsRate > 20) {
        insights.push({
            type: 'success',
            icon: '📈',
            message: `Impressive ${financeStats.savingsRate}% savings rate this month!`
        });
    }

    if (financeStats.topExpense && financeStats.topExpense.amount > 1000) {
        insights.push({
            type: 'info',
            icon: '💸',
            message: `Biggest expense: ₹${financeStats.topExpense.amount.toFixed(2)} on ${financeStats.topExpense.desc}`
        });
    }

    return insights;
}

/**
 * Calculate budget trajectory data for the current month
 */
export function calculateBudgetTrajectory(finances, monthlyBudget) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const lastDayToProcess = today.getDate();

    const dailySpending = new Array(daysInMonth).fill(0);
    const monthPrefix = today.toISOString().slice(0, 7);

    finances.filter(f => f.type === 'expense' && f.dateISO.startsWith(monthPrefix)).forEach(f => {
        const day = new Date(f.dateISO).getDate();
        if (day <= daysInMonth) {
            dailySpending[day - 1] += f.amount;
        }
    });

    const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const actualSpending = [];
    let cumulative = 0;

    for (let i = 0; i < lastDayToProcess; i++) {
        cumulative += dailySpending[i];
        actualSpending.push(cumulative);
    }

    const idealTrajectory = labels.map(day => {
        return monthlyBudget ? (monthlyBudget / daysInMonth) * day : 0;
    });

    return {
        labels,
        actual: actualSpending,
        ideal: idealTrajectory,
        isOverBudget: monthlyBudget ? actualSpending[actualSpending.length - 1] > idealTrajectory[lastDayToProcess - 1] : false
    };
}
