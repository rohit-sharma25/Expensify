/**
 * GEN-3 Expensify Core Engine
 * Behavior-driven financial decision system.
 */

export class FinancialEngine {
    /**
     * Calculates the current financial state.
     */
    static calculateState(finances, monthlyBudget) {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const currentMonth = todayStr.slice(0, 7);
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();

        const monthExpenses = finances
            .filter(f => f.type === 'expense' && f.dateISO.startsWith(currentMonth))
            .reduce((sum, f) => sum + f.amount, 0);

        const monthIncome = finances
            .filter(f => f.type === 'income' && f.dateISO.startsWith(currentMonth))
            .reduce((sum, f) => sum + f.amount, 0);

        const balanceLeft = (monthlyBudget || 0) - monthExpenses;
        const burnRatePerDay = currentDay > 0 ? monthExpenses / currentDay : 0;
        const projectedEndBalance = (monthlyBudget || 0) - (burnRatePerDay * daysInMonth);

        let safetyLevel = 'Stable';
        if (projectedEndBalance < 0) safetyLevel = 'Critical';
        else if (projectedEndBalance < (monthlyBudget * 0.15)) safetyLevel = 'Warning';

        return {
            balanceLeft,
            burnRatePerDay,
            projectedEndBalance,
            safetyLevel,
            monthExpenses,
            monthIncome
        };
    }

    /**
     * Runs the Risk Engine to identify financial threats.
     */
    static runRiskEngine(state, monthlyBudget) {
        if (!monthlyBudget) return { overspendRisk: 0, deficitRisk: 0, riskScore: 0 };

        const budgetUsedPercent = (state.monthExpenses / monthlyBudget) * 100;
        const daysPassedPercent = (new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()) * 100;

        // Overspend risk: is current spending velocity higher than time elapsed?
        const overspendRisk = Math.max(0, budgetUsedPercent - daysPassedPercent);

        // Deficit risk: probability of ending the month with negative balance
        const deficitRisk = state.projectedEndBalance < 0 ? Math.min(100, Math.abs(state.projectedEndBalance / monthlyBudget) * 100) : 0;

        // Composite risk score (0-100)
        const riskScore = Math.min(100, (overspendRisk * 0.6) + (deficitRisk * 0.4));

        return {
            overspendRisk: Math.round(overspendRisk),
            deficitRisk: Math.round(deficitRisk),
            riskScore: Math.round(riskScore)
        };
    }

    /**
     * Runs the Behavior Model to detect spending patterns.
     */
    static runBehaviorModel(finances) {
        const last7Days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            last7Days.push(d.toISOString().slice(0, 10));
        }

        const recentExpenses = finances.filter(f => f.type === 'expense' && last7Days.includes(f.dateISO));

        // 1. Detect category spikes
        const catTotals = {};
        recentExpenses.forEach(f => {
            catTotals[f.category] = (catTotals[f.category] || 0) + f.amount;
        });

        const spikes = Object.entries(catTotals)
            .filter(([cat, amount]) => amount > 5000) // Arbitrary threshold for "spike"
            .map(([cat]) => cat);

        // 2. Detect impulse patterns (frequent small-medium purchases in short time)
        const impulseCount = recentExpenses.filter(f => f.amount > 100 && f.amount < 1000).length;
        const hasImpulsePattern = impulseCount > 5;

        // 3. Detect abnormal spending velocity
        const todayPrice = recentExpenses.filter(f => f.dateISO === last7Days[0]).reduce((s, f) => s + f.amount, 0);
        const avgDaily = recentExpenses.reduce((s, f) => s + f.amount, 0) / 7;
        const isAbnormalVelocity = todayPrice > (avgDaily * 2) && todayPrice > 1000;

        return {
            categorySpikes: spikes,
            impulsePattern: hasImpulsePattern,
            abnormalVelocity: isAbnormalVelocity,
            recentFrequency: recentExpenses.length
        };
    }
}
