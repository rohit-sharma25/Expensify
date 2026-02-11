// ============================================
// CHART-UTILS.JS - Chart Configuration & Utilities
// ============================================

/**
 * Chart.js configuration and utilities
 * Note: Requires Chart.js library to be loaded
 */

// Default chart colors based on theme
export const chartColors = {
    primary: '#6c5ce7',
    primaryLight: '#a29bfe',
    success: '#2ecc71',
    danger: '#ff6b81',
    warning: '#ffc107',
    info: '#00f3ff',
    muted: '#8b8ca1',
    gradient: {
        primary: ['#6c5ce7', '#a29bfe'],
        success: ['#2ecc71', '#27ae60'],
        danger: ['#ff6b81', '#ee5a6f'],
        info: ['#00f3ff', '#00d4ff']
    }
};

// Default chart options
export const defaultChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: true,
            position: 'bottom',
            labels: {
                color: '#000000',
                padding: 15,
                font: {
                    family: 'Inter',
                    size: 12
                }
            }
        },
        tooltip: {
            backgroundColor: 'rgba(17, 18, 26, 0.95)',
            titleColor: '#f5f5f7',
            bodyColor: '#d1d1d6',
            borderColor: 'rgba(108, 92, 231, 0.3)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            displayColors: true
        }
    }
};

/**
 * Create a gradient for chart backgrounds
 */
export function createGradient(ctx, colors, direction = 'vertical') {
    const gradient = direction === 'vertical'
        ? ctx.createLinearGradient(0, 0, 0, 400)
        : ctx.createLinearGradient(0, 0, 400, 0);

    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    return gradient;
}

/**
 * Create a donut/pie chart for expense breakdown
 */
export function createDonutChart(canvas, data, labels) {
    const ctx = canvas.getContext('2d');

    // Generate colors for each category
    const backgroundColors = labels.map((_, i) => {
        const hue = (i * 360) / labels.length;
        return `hsla(${hue}, 70%, 60%, 0.8)`;
    });

    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: '#11121a',
                borderWidth: 2,
                hoverOffset: 10
            }]
        },
        options: {
            ...defaultChartOptions,
            cutout: '70%',
            plugins: {
                ...defaultChartOptions.plugins,
                legend: {
                    ...defaultChartOptions.plugins.legend,
                    position: 'right'
                }
            }
        }
    });
}

/**
 * Create a line chart for trends
 */
export function createLineChart(canvas, data, labels, label = 'Spending') {
    const ctx = canvas.getContext('2d');
    const gradient = createGradient(ctx, chartColors.gradient.primary);

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                borderColor: chartColors.primary,
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: chartColors.primary,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            ...defaultChartOptions,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8b8ca1',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#8b8ca1',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

/**
 * Create a bar chart for comparisons
 */
export function createBarChart(canvas, data, labels, label = 'Amount') {
    const ctx = canvas.getContext('2d');

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: chartColors.primary,
                borderColor: chartColors.primaryLight,
                borderWidth: 1,
                borderRadius: 8,
                barThickness: 30
            }]
        },
        options: {
            ...defaultChartOptions,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8b8ca1',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#8b8ca1',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

/**
 * Create a multi-dataset line chart (e.g., income vs expense)
 */
export function createComparisonChart(canvas, datasets, labels) {
    const ctx = canvas.getContext('2d');

    const chartDatasets = datasets.map((dataset, index) => {
        const colorKey = ['primary', 'success', 'danger', 'info'][index % 4];
        return {
            label: dataset.label,
            data: dataset.data,
            borderColor: chartColors[colorKey],
            backgroundColor: createGradient(ctx, chartColors.gradient[colorKey]),
            borderWidth: 2,
            fill: false,
            tension: 0.4,
            pointBackgroundColor: chartColors[colorKey],
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
        };
    });

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: chartDatasets
        },
        options: {
            ...defaultChartOptions,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8b8ca1',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#8b8ca1',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

/**
 * Create a specialized trajectory chart (Actual vs Ideal)
 */
export function createTrajectoryChart(canvas, data) {
    const ctx = canvas.getContext('2d');

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Actual Spending',
                    data: data.actual,
                    borderColor: '#6c5ce7',
                    backgroundColor: 'rgba(108, 92, 231, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5
                },
                {
                    label: 'Ideal Trajectory',
                    data: data.ideal,
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false,
                    tension: 0,
                    pointRadius: 0
                }
            ]
        },
        options: {
            ...defaultChartOptions,
            plugins: {
                ...defaultChartOptions.plugins,
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b8ca1', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#8b8ca1', font: { size: 10 } }
                }
            }
        }
    });
}

/**
 * Destroy chart instance safely
 */
export function destroyChart(chartInstance) {
    if (chartInstance) {
        chartInstance.destroy();
    }
}

/**
 * Update chart data
 */
export function updateChartData(chartInstance, newData, newLabels = null) {
    if (!chartInstance) return;

    chartInstance.data.datasets[0].data = newData;
    if (newLabels) {
        chartInstance.data.labels = newLabels;
    }
    chartInstance.update();
}
