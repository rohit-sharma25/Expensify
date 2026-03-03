// js/db-service.js
import { db } from './firebase-config.js';
import {
    collection, doc, setDoc, getDocs, getDoc, deleteDoc,
    query, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

export class DBService {
    static async saveData(userId, collectionName, id, data) {
        try {
            if (!userId) {
                let local = [];
                try {
                    const raw = localStorage.getItem(collectionName);
                    local = raw ? JSON.parse(raw) : [];
                    if (!Array.isArray(local)) local = [];
                } catch (e) {
                    local = [];
                }

                const idx = local.findIndex(i => i.id === id);
                if (idx >= 0) local[idx] = data;
                else local.push(data);

                localStorage.setItem(collectionName, JSON.stringify(local));

                // fire a storage event manually so same-tab listeners will update
                try {
                    const ev = new StorageEvent('storage', {
                        key: collectionName,
                        newValue: JSON.stringify(local),
                        oldValue: null,
                        storageArea: localStorage,
                        url: window.location.href
                    });
                    window.dispatchEvent(ev);
                } catch (e) {
                    console.warn('Unable to dispatch storage event:', e);
                }

                return;
            }
            // Ensure data has the ID for consistency
            const finalData = { ...data, id };
            await setDoc(doc(db, `users/${userId}/${collectionName}`, id), finalData);
        } catch (error) {
            console.error(`DBService Save Error [${collectionName}]:`, error);
            throw error;
        }
    }

    static async deleteData(userId, collectionName, id) {
        try {
            if (!userId) {
                let local = [];
                try {
                    const raw = localStorage.getItem(collectionName);
                    local = raw ? JSON.parse(raw) : [];
                    if (!Array.isArray(local)) local = [];
                } catch (e) {
                    local = [];
                }
                local = local.filter(i => i.id !== id);
                localStorage.setItem(collectionName, JSON.stringify(local));
                return;
            }
            await deleteDoc(doc(db, `users/${userId}/${collectionName}`, id));
        } catch (error) {
            console.error(`DBService Delete Error [${collectionName}]:`, error);
            throw error;
        }
    }

    static async fetchData(userId, collectionName) {
        try {
            if (!userId) {
                try {
                    const raw = localStorage.getItem(collectionName);
                    const local = raw ? JSON.parse(raw) : [];
                    console.log(`📦 Fetched ${collectionName} from localStorage:`, local);
                    return Array.isArray(local) ? local : [];
                } catch (e) {
                    console.warn(`⚠️ Error parsing localStorage ${collectionName}:`, e);
                    return [];
                }
            }
            const q = query(collection(db, `users/${userId}/${collectionName}`));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            console.log(`📦 Fetched ${collectionName} from Firebase:`, data);
            return data;
        } catch (error) {
            console.error(`❌ DBService Fetch Error [${collectionName}]:`, error.code || error.message, error);
            return [];
        }
    }

    static subscribe(userId, collectionName, callback) {
        if (!userId) {
            const getLocal = () => {
                try {
                    const raw = localStorage.getItem(collectionName);
                    const local = raw ? JSON.parse(raw) : [];
                    return Array.isArray(local) ? local : [];
                } catch (e) {
                    console.warn(`⚠️ Error reading localStorage ${collectionName}:`, e);
                    return [];
                }
            };

            const invoke = () => {
                const data = getLocal();
                console.log(`🔄 Subscribed to localStorage ${collectionName}:`, data);
                callback(data);
            };

            // initial call
            invoke();

            // listen for storage events (including manual dispatch)
            const listener = (e) => {
                if (e.key === collectionName) {
                    invoke();
                }
            };
            window.addEventListener('storage', listener);

            // return unsubscribe function
            return () => window.removeEventListener('storage', listener);
        }

        try {
            const q = query(collection(db, `users/${userId}/${collectionName}`));
            console.log(`🔄 Setting up Firestore subscription for ${collectionName}...`);
            return onSnapshot(q, (snapshot) => {
                const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                console.log(`✅ Subscription update ${collectionName}:`, data);
                callback(data);
            }, (error) => {
                console.error(`❌ Firestore Subscription Error [${collectionName}]:`, error.code || error.message, error);
                // Try to fall back to empty data
                callback([]);
            });
        } catch (error) {
            console.error(`❌ DBService Subscription Setup Error [${collectionName}]:`, error.code || error.message, error);
            callback([]);
            return () => { };
        }
    }

    static async getUserProfile(userId) {
        if (!userId) return null;
        try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            return userDoc.exists() ? userDoc.data() : null;
        } catch (error) {
            console.error('DBService GetUserProfile Error:', error);
            return null;
        }
    }
}

