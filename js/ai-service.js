import { CONFIG } from './config.js';

export class AIService {
    static async chat(message, context) {
        if (!CONFIG.GROQ_API_KEY) {
            return "Please add your Groq API Key in `js/config.js` to enable the AI assistant.";
        }

        // Financial Context Extraction
        const today = new Date().toISOString().slice(0, 7);
        const finances = context.finances || [];
        const budget = context.budget || 0;
        const spent = finances
            .filter(f => f.type === 'expense' && f.dateISO.startsWith(today))
            .reduce((sum, f) => sum + f.amount, 0);

        const recentExpenses = finances
            .filter(f => f.type === 'expense')
            .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))
            .slice(0, 10);

        const systemPrompt = `
            You are "Expensify AI", a premium, friendly financial advisor. 
            User Context:
            - Monthly Budget: ₹${budget.toLocaleString('en-IN')}
            - Total Spent this Month: ₹${spent.toLocaleString('en-IN')}
            - Recent Transactions: ${JSON.stringify(recentExpenses.map(e => ({ desc: e.desc, amount: e.amount, cat: e.category })))}
            
            Instructions:
            - Keep responses concise (max 3-4 sentences).
            - Use emojis and markdown (**bold**).
            - Based on the data above, give specific advice if asked.
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
}
