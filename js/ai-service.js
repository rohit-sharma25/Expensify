import { CONFIG } from './config.js';

export class AIService {
    static async chat(message, context) {
        if (!CONFIG.GROQ_API_KEY) {
            return "Please add your Groq API Key in `js/config.js` to enable the AI assistant.";
        }

        const { finances = [], budget = 0, engineState = {} } = context;
        const { state = {}, risks = {}, behavior = {} } = engineState;

        const systemPrompt = `
            You are "Expensify AI", a premium, friendly financial advisor.
            
            CRITICAL DASHBOARD FACTS (Verify all answers against these):
            - Monthly Budget: ₹${budget.toLocaleString('en-IN')}
            - Current Spending: ₹${(state.monthExpenses || 0).toLocaleString('en-IN')}
            - Daily Spending (Burn Rate): ₹${(state.burnRatePerDay || 0).toLocaleString('en-IN')}
            - Health Score: ${risks.riskScore || 0}/100
            - Risk Level: ${state.safetyLevel || 'Stable'}
            - Behavior Pattern: ${behavior.categorySpikes?.length > 0 ? behavior.categorySpikes.join(', ') : 'Stable'}
            
            Instructions:
            - You MUST use the values above when asked about finances. Never calculate your own totals.
            - Keep responses concise (max 3-4 sentences).
            - Use emojis and markdown (**bold**).
            - If asked "Why is my health score X?", explain based on risk factors like overspending velocity.
        `;

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${CONFIG.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: message }
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || "Groq API Error");
            }

            const data = await response.json();
            let aiText = data.choices[0].message.content;

            // Simple Markdown Processing
            aiText = aiText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            aiText = aiText.replace(/\n/g, '<br>');

            return aiText;
        } catch (error) {
            console.error("Groq Error:", error);
            throw error;
        }
    }

    /**
     * Stable UI Handler
     */
    static init(elements, getContext) {
        const { fab, popup, close, input, send, body } = elements;

        if (!fab || !popup || !input) return;

        fab.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpening = popup.classList.contains('hidden');
            popup.classList.toggle('hidden');

            if (isOpening) {
                setTimeout(() => {
                    input.focus();
                }, 100);
            }
        });

        close?.addEventListener('click', () => popup.classList.add('hidden'));

        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && !fab.contains(e.target)) {
                popup.classList.add('hidden');
            }
        });

        const sendMessage = async () => {
            const text = input.value.trim();
            if (!text) return;

            this.appendMessage(body, text, 'user');
            input.value = '';

            const aiMsg = this.appendMessage(body, '<span class="typing-dots">Thinking...</span>', 'ai');

            try {
                const response = await this.chat(text, getContext());
                aiMsg.innerHTML = response;
            } catch (err) {
                aiMsg.innerHTML = `<span style="color:var(--danger)">Error: ${err.message}</span><br><small style="color:var(--muted)">Ensure your GROQ_API_KEY is valid in config.js</small>`;
            }

            body.scrollTop = body.scrollHeight;
        };

        send?.addEventListener('click', sendMessage);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    static appendMessage(container, text, type) {
        const div = document.createElement('div');
        div.className = `msg-${type}`;
        div.innerHTML = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        return div;
    }

    static async generateDashboardInsight(context) {
        if (!CONFIG.GROQ_API_KEY) return null;

        const { budget, state, risks, behavior } = context;

        const systemPrompt = `
            You are "Expensify Financial Manager", a high-end personal wealth advisor.
            Your goal is to provide a single, actionable, and professional financial insight.
            
            Context:
            - Budget: ₹${budget}
            - Spent: ₹${state.monthExpenses}
            - Safety Level: ${state.safetyLevel}
            - Risk Score: ${risks.riskScore}/100
            - Behavior: ${behavior.categorySpikes.length > 0 ? 'Spikes in ' + behavior.categorySpikes.join(', ') : 'Stable'}
            - Impulse Pattern: ${behavior.impulsePattern ? 'Detected' : 'None'}
            
            Rules:
            1. MAX 20 WORDS.
            2. Be extremely specific and actionable.
            3. No generic advice like "save more".
            4. Sound like a premium human manager.
            
            Example: "Your dining velocity is 2x average. Cut luxury spending by ₹2k this week to stay on track."
        `;

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${CONFIG.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: "Provide manager insight based on the exact context provided." }
                    ],
                    temperature: 0.5,
                    max_tokens: 100
                })
            });

            if (!response.ok) return null;

            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error("Dashboard AI Error:", error);
            return null;
        }
    }
}
