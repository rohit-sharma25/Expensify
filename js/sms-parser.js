// js/sms-parser.js
import { AIService } from './ai-service.js';

/**
 * Parses bank/UPI SMS text using Regex patterns first, falling back to AI if needed.
 */
export const parseSMS = async (text) => {
    if (!text) return null;

    // 1. Try Regex Patterns (Faster, Local, No API cost)
    const regexResult = tryRegexParse(text);

    // If regex found amount and type, we consider it a success but still might want AI 
    // for better merchant categorization if desired. 
    // However, the PRD says "potentially AI as a fallback".
    if (regexResult.success && regexResult.amount && regexResult.type) {
        console.log("Regex Parse Success:", regexResult);
        return regexResult;
    }

    // 2. Fallback to AI if Regex fails or is incomplete
    console.log("Regex failed or incomplete, falling back to AI...");
    return await parseWithAI(text);
};

const tryRegexParse = (text) => {
    const result = {
        success: false,
        amount: null,
        type: 'expense',
        description: '',
        category: 'Miscellaneous',
        subCategory: 'Bank Sync',
        date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()
    };

    // Transaction Type
    const expenseWords = /debited|spent|paid|vpa|sent|payment|dr\.?\s|dr:|[^-]dr\s/i;
    const incomeWords = /credited|received|added|deposited|refund|cr\.?\s|cr:|[^-]cr\s/i;

    if (expenseWords.test(text)) {
        result.type = 'expense';
    } else if (incomeWords.test(text)) {
        result.type = 'income';
    }

    // Amount patterns: Rs. 100, INR 100, 100.00
    // Skip if preceded by Balance related words 
    const balancedWords = /balance|bal|avlbal|avl\sbal|available\sbalance|bal:|balance:/i;
    // Updated regex to catch amounts followed by Dr./Cr. or preceded by symbols
    const amtRegex = /(?:Rs\.?|INR|VPA|Amt|₹)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:cr\.|dr\.|cr\s|dr\s|dr:|cr:)/gi;

    let match;
    while ((match = amtRegex.exec(text)) !== null) {
        const amtValue = match[1] || match[2];
        const matchIndex = match.index;
        const textBefore = text.substring(Math.max(0, matchIndex - 20), matchIndex).toLowerCase();

        if (!balancedWords.test(textBefore)) {
            result.amount = parseFloat(amtValue.replace(/,/g, ''));
            result.success = true;
            break;
        }
    }

    // Merchant / Description
    // Look for patterns like "at [Merchant]", "to [Merchant]", "from [Merchant]"
    const merchantRegex = /(?:at|to|from|info)\s+([^,.\s]+(?:\s+[^,.\s]+)?)/i;
    const merchantMatch = text.match(merchantRegex);
    if (merchantMatch) {
        result.description = merchantMatch[1].trim();

        // Simple Merchant-to-Category Mapping
        const merchantMap = {
            'swiggy': 'Food & Grocery',
            'zomato': 'Food & Grocery',
            'uber': 'Traveling',
            'ola': 'Traveling',
            'amazon': 'Shopping',
            'flipkart': 'Shopping',
            'netflix': 'Bill & Subscription',
            'spotify': 'Bill & Subscription',
            'lic': 'Bill & Subscription',
            'airtel': 'Bill & Subscription',
            'jio': 'Bill & Subscription',
            'openai': 'LLM Models',
            'anthropic': 'LLM Models',
            'google': 'LLM Models',
            'replicate': 'LLM Models'
        };

        const descLower = result.description.toLowerCase();
        for (const [key, cat] of Object.entries(merchantMap)) {
            if (descLower.includes(key)) {
                result.category = cat;
                // Simple sub-category heuristics
                if (cat === 'Food & Grocery') result.subCategory = 'Restaurant';
                if (cat === 'Traveling') result.subCategory = 'Cab/Taxi';
                if (cat === 'Shopping') result.subCategory = 'Clothing';
                if (cat === 'Bill & Subscription') result.subCategory = 'Mobile';
                if (cat === 'LLM Models') result.subCategory = 'Others';
                break;
            }
        }
    }

    if (result.amount && result.amount > 0) {
        result.success = true;
    }

    return result;
};

const parseWithAI = async (text) => {
    const systemPrompt = `
You are an expert financial SMS parser. Extract transaction details precisely from the provided SMS text.
Respond ONLY with a valid JSON object. Do NOT include markdown code blocks (\`\`\`json) or any conversational text.
Format precisely as follows:
{
  "amount": <number or null>,
  "type": "expense" or "income",
  "description": "<merchant or sender name>",
  "category": "<Must be exactly one of: Food & Grocery, Traveling, Shopping, Bill & Subscription, Investment, Peoples, LLM Models, Miscellaneous>",
  "subCategory": "<Suggest a sub-category that fits the category. E.g., for Food: Restaurant, Groceries; for Travel: Flight, Cab/Taxi, etc.>",
  "date": "<YYYY-MM-DD format. Use today's date if missing>",
  "success": true or false
}
`;

    try {
        const todayLocal = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
        const payload = {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Today's Date: ${todayLocal}\n\nSMS Text:\n"${text}"` }
            ],
            temperature: 0.1,
            max_tokens: 150
        };

        const response = await AIService.chatWithRetry(payload);
        let aiText = response.choices[0].message.content;
        aiText = aiText.replace(/```json/gi, '').replace(/```/gi, '').trim();
        const result = JSON.parse(aiText);

        if (!result.amount || isNaN(result.amount)) result.success = false;
        if (!['expense', 'income'].includes(result.type)) result.type = 'expense';
        if (!result.date) {
            const d = new Date();
            result.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        return result;
    } catch (error) {
        console.error("AI Parsing Error:", error);
        return {
            success: false,
            amount: null,
            type: 'expense',
            subCategory: 'Bank Sync'
        };
    }
};
