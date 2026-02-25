// app.js
import { db, state, setBrokers } from "./config.js";
import { updateHeaderDate, renderMain, scrollToBusinessHours } from "./render.js";
import {
    collection,
    query,
    onSnapshot,
    where,
    limit,
    getDocs,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import { initAuth } from "./auth.js";
import { setupUIInteractions } from "./interactions.js";
import { setupAppointmentLogic } from "./appointments.js";
import { initReports } from "./reports.js";
import { updateBrokerDropdowns } from "./interactions.js";

const usersRef = collection(db, "users");

// 1. INICIALIZAÇÃO E AUTENTICAÇÃO
initAuth(initApp);

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function isBrokerRole(role) {
    const normalized = normalizeRole(role);
    return normalized === "broker" || normalized === "corretor";
}

function normalizeBrokerId(value) {
    return String(value || "").trim().toLowerCase();
}

// 2. FUNÇÃO PRINCIPAL
function initApp() {
    listenToBrokers();

    if (state.userProfile && isBrokerRole(state.userProfile.role)) {
        document.body.classList.add("broker-view-only");
    } else {
        document.body.classList.remove("broker-view-only");
    }

   if (!state.appInitialized) {
        setupUIInteractions();
        setupAppointmentLogic();
        state.appInitialized = true;
    }

    // Movemos a validação para fora do 'appInitialized'. 
    // Assim, sempre que trocar de usuário, ele refaz a checagem corretamente.
    setTimeout(() => {
        const userRole = state.userProfile ? normalizeRole(state.userProfile.role) : "";
        
        if (userRole === "admin" || userRole === "master") {
            initReports(); // Mostra para Admin e Master
        } 
        renderUserInfo();
    }, 1000);
    

    cleanupExpiredDeletedAppointments().catch((e) => console.error("Erro na limpeza de excluídos:", e));

    const baseDate = state.currentDate || new Date();
    setupRealtime(baseDate);

    updateHeaderDate();
    renderMain();
    scrollToBusinessHours();
}

// 3. BUSCAR CORRETORES NO BANCO EM TEMPO REAL
function listenToBrokers() {
    onSnapshot(usersRef, (snapshot) => {
        const loadedBrokers = [];

        snapshot.forEach((userDoc) => {
            const data = userDoc.data() || {};
            if (!isBrokerRole(data.role)) return;

            const normalizedEmail = normalizeBrokerId(data.email || userDoc.id);
            if (!normalizedEmail) return;

            loadedBrokers.push({
                id: normalizedEmail,
                docId: userDoc.id,
                name: data.name || normalizedEmail,
                phone: data.phone || ""
            });
        });

        loadedBrokers.sort((a, b) => a.name.localeCompare(b.name));
        setBrokers(loadedBrokers);

        if (state.userProfile && isBrokerRole(state.userProfile.role)) {
            state.selectedBrokerId = normalizeBrokerId(state.userProfile.email || state.userProfile.id);
            const selectEl = document.getElementById("view-broker-select");
            if (selectEl) selectEl.style.display = "none";
        } else if (!state.selectedBrokerId) {
            state.selectedBrokerId = "all";
        }

        const selectEl = document.getElementById("view-broker-select");
        if (selectEl && state.selectedBrokerId) {
            selectEl.value = state.selectedBrokerId;
        }

        renderMain();

        if (typeof window.populateBrokerSelect === "function") window.populateBrokerSelect();
        if (typeof window.populateAllBrokerSelects === "function") window.populateAllBrokerSelects();

        updateBrokerDropdowns();
    });
}

function renderUserInfo() {
    if (!state.userProfile) return;

    const rolesMap = {
        admin: "Administrador",
        consultant: "Consultora",
        broker: "Corretor",
        master: "Master"
    };

    const userInfoDiv = document.querySelector(".user-info");
    if (userInfoDiv) {
        const roleDisplay = rolesMap[normalizeRole(state.userProfile.role)] || "Corretor";

        userInfoDiv.innerHTML = `
            <div style="font-weight:700; font-size:0.9rem;">${state.userProfile.name || "Usuário"}</div>
            <div style="font-size:0.75rem; color:#64748b;">${roleDisplay}</div>
        `;
        userInfoDiv.style.display = "block";
    }
}

// 4. REALTIME LISTENER OTIMIZADO
export function setupRealtime(centerDate) {
    if (state.unsubscribeSnapshot) {
        state.unsubscribeSnapshot();
        state.unsubscribeSnapshot = null;
    }

    const startDate = new Date(centerDate);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(centerDate);
    endDate.setDate(endDate.getDate() + 30);

    const formatDate = (dateObj) => {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, "0");
        const d = String(dateObj.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    const startString = formatDate(startDate);
    const endString = formatDate(endDate);

    const q = query(
        collection(db, "appointments"),
        where("date", ">=", startString),
        where("date", "<=", endString),
        limit(2000)
    );

    state.unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
            let appts = [];
            snapshot.forEach((entry) => {
                appts.push({ id: entry.id, ...entry.data() });
            });

            appts = appts.map((a) => ({ ...a, brokerId: normalizeBrokerId(a.brokerId) }));

            if (state.userProfile && isBrokerRole(state.userProfile.role)) {
                const ownBrokerId = normalizeBrokerId(state.userProfile.email || state.userProfile.id);
                appts = appts.filter((a) => a.brokerId === ownBrokerId);
            }

            state.appointments = appts.filter((a) => !a.deletedAt);
            renderMain();
        },
        (error) => {
            console.error("Erro no listener realtime:", error);
        }
    );
}

async function cleanupExpiredDeletedAppointments() {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - THIRTY_DAYS_MS;

    const snap = await getDocs(query(collection(db, "appointments"), limit(2000)));
    const deletions = [];

    snap.forEach((d) => {
        const data = d.data();
        if (!data.deletedAt) return;

        const deletedAtMs = new Date(data.deletedAt).getTime();
        if (deletedAtMs < cutoff) {
            deletions.push(deleteDoc(doc(db, "appointments", d.id)));
        }
    });

    if (deletions.length > 0) {
        await Promise.all(deletions);
        console.log(`[Limpeza] ${deletions.length} registros permanentemente excluídos.`);
    }
}
