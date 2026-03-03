// js/profile.js
import { AuthService } from './auth-service.js';
import { DBService } from './db-service.js';
import { GamificationService } from './gamification-service.js';
import { db } from './firebase-config.js';
import { doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    AuthService.onUserChange(async (user) => {
        if (user) {
            renderUserInfo(user);
            await renderGamificationStats();
            await renderFinancialSummary(user.uid);
            await initTelegramSync(user.uid);
        } else {
            const isLocal = AuthService.isLocalOnly();
            if (isLocal) {
                renderUserInfo({
                    displayName: "Guest User",
                    email: "Local Mode",
                    photoURL: "https://ui-avatars.com/api/?name=Guest&background=5B6CF2&color=fff"
                });
                await renderGamificationStats();
                await renderFinancialSummary(null);
            } else {
                window.location.href = 'index.html';
            }
        }
    });
});

function renderUserInfo(user) {
    document.getElementById('profile-name').textContent = user.displayName || "User";
    document.getElementById('profile-email').textContent = user.email || "Offline Account";

    const photoElement = document.getElementById('profile-photo');
    if (photoElement) {
        const displayName = user.displayName || "User";
        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=5B6CF2&color=fff`;
        const photoUrl = user.photoURL || fallbackUrl;

        photoElement.src = photoUrl;
        photoElement.onerror = () => {
            photoElement.src = fallbackUrl;
        };
    }
}

async function renderGamificationStats() {
    const stats = await GamificationService.getStats();
    const progress = GamificationService.getXpProgress(stats.xp || 0);

    document.getElementById('profile-level').textContent = stats.level;
    document.getElementById('current-xp').textContent = stats.xp;
    document.getElementById('next-level-xp').textContent = GamificationService.getXpForLevel(progress.currentLevel + 1);
    document.getElementById('xp-bar-fill').style.width = `${progress.percent}%`;
    document.getElementById('xp-away').textContent = progress.xpRequiredForNext - progress.xpInLevel;
    document.getElementById('next-level-num').textContent = progress.currentLevel + 1;
    document.getElementById('total-xp-earned').textContent = `${stats.xp} XP`;

    // Rank logic
    const ranks = ["NOVICE", "APPRENTICE", "SAVER", "STRATEGIST", "ELITE", "MAESTRO"];
    const rankIndex = Math.min(Math.floor(stats.level / 2), ranks.length - 1);
    document.getElementById('rank-name').textContent = ranks[rankIndex];
}

async function renderFinancialSummary(uid) {
    const finances = await DBService.fetchData(uid, 'finances');

    document.getElementById('total-tx').textContent = finances.length;

    if (finances.length > 0) {
        // Top Category
        const cats = {};
        finances.forEach(f => {
            if (f.type === 'expense') cats[f.category] = (cats[f.category] || 0) + 1;
        });
        const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
        if (top) document.getElementById('top-category').textContent = top[0];

        // Active Days
        const dates = new Set(finances.map(f => f.dateISO));
        document.getElementById('active-days').textContent = dates.size;
    }
}

async function initTelegramSync(uid) {
    const syncCard = document.getElementById('telegram-sync-card');
    const syncCodeText = document.getElementById('sync-code-text');
    const generateSyncBtn = document.getElementById('generate-sync-btn');
    const linkedStatus = document.getElementById('linked-status');
    const syncInstruction = document.getElementById('sync-instruction');

    if (!syncCard) return;

    // Check if already linked
    const userProfile = await DBService.getUserProfile(uid);
    if (userProfile && userProfile.telegramLinked) {
        linkedStatus.style.display = 'block';
        generateSyncBtn.style.display = 'none';
        syncInstruction.style.display = 'none';
        return;
    }

    // Handle Generate Sync Code
    generateSyncBtn.addEventListener('click', async () => {
        generateSyncBtn.disabled = true;
        generateSyncBtn.textContent = 'Generating...';

        try {
            if (!uid) throw new Error('User UID is missing. Please log in again.');

            // Generate 6-digit Sync Code
            const code = Math.floor(100000 + Math.random() * 900000).toString();

            // Using a plain Date object which Firestore handles as a Timestamp
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            console.log('🔗 Attempting to save sync code to Firestore root collection...');

            // Save directly to Firestore 
            // NOTE: This requires 'syncCodes' collection to have write permissions for authenticated users
            await setDoc(doc(db, 'syncCodes', code), {
                uid: uid,
                expiresAt: expiresAt,
                createdAt: new Date()
            });

            syncCodeText.textContent = code;
            syncCodeText.style.display = 'block';
            generateSyncBtn.style.display = 'none';

            syncInstruction.innerHTML = `Send code <b>${code}</b> to <a href="https://t.me/ExpensifierBot" target="_blank" style="color: #24A1DE; font-weight: 700;">@ExpensifierBot</a><br><small>(Expires in 10 mins)</small>`;
        } catch (err) {
            console.error('Frontend Sync Code Error:', err);
            generateSyncBtn.disabled = false;
            generateSyncBtn.textContent = 'Try Again';

            // Helping the user identify if it's a permission issue or something else
            const errorMsg = err.code === 'permission-denied'
                ? 'Permission Denied: Please check your Firebase Firestore rules for "syncCodes" collection.'
                : err.message;

            alert('Sync Error: ' + errorMsg);
        }
    });
}

// Logout Logic
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to logout?')) {
        await AuthService.logout();
        window.location.href = 'index.html';
    }
});
