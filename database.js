// js/database.js
// Wrapper fino e genérico sobre IndexedDB. Não conhece regras de negócio —
// isso fica por conta de storage.js. Aqui só existem operações de baixo nível
// (get, put, delete, getAll) sobre os object stores do banco MemoryAppDB.

const DB_NAME = 'MemoryAppDB';
const DB_VERSION = 1;

export const STORE_NAMES = {
    NOTES: 'notes',
    IMAGES: 'images',
    SETTINGS: 'settings',
    SYNC: 'sync'
};

let dbPromise = null;

function openDatabase() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;

            if (!database.objectStoreNames.contains(STORE_NAMES.NOTES)) {
                const notesStore = database.createObjectStore(STORE_NAMES.NOTES, { keyPath: 'id' });
                notesStore.createIndex('date', 'date');
                notesStore.createIndex('updatedAt', 'updatedAt');
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.IMAGES)) {
                database.createObjectStore(STORE_NAMES.IMAGES, { keyPath: 'id' });
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.SETTINGS)) {
                database.createObjectStore(STORE_NAMES.SETTINGS, { keyPath: 'key' });
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.SYNC)) {
                database.createObjectStore(STORE_NAMES.SYNC, { keyPath: 'key' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
}

function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAll(storeName) {
    const database = await openDatabase();
    const store = database.transaction(storeName, 'readonly').objectStore(storeName);
    return promisifyRequest(store.getAll());
}

export async function getById(storeName, id) {
    const database = await openDatabase();
    const store = database.transaction(storeName, 'readonly').objectStore(storeName);
    return promisifyRequest(store.get(id));
}

export async function put(storeName, value) {
    const database = await openDatabase();
    const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
    return promisifyRequest(store.put(value));
}

export async function remove(storeName, id) {
    const database = await openDatabase();
    const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
    return promisifyRequest(store.delete(id));
}

export async function clear(storeName) {
    const database = await openDatabase();
    const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
    return promisifyRequest(store.clear());
}

export async function bulkPut(storeName, values) {
    if (!values || values.length === 0) return true;
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        values.forEach((value) => store.put(value));
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
    });
}
