import { db, state } from "./config.js";
import { 
    collection, onSnapshot, setDoc, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let unsubscribeUsers = null;

// E-mails que NUNCA devem aparecer na lista (Ocultos/Sistema)
const HIDDEN_EMAILS = [
    "gl.infostech@gmail.com",
    "master@nunes.com.br"
];

const ALLOWED_MANAGED_ROLES = new Set(["broker", "consultant", "admin", "master"]);

function normalizeRole(role) {
    const normalized = String(role || "").trim().toLowerCase();
    if (normalized === "corretor") return "broker";
    if (normalized === "consultora") return "consultant";
    if (normalized === "admin" || normalized === "administrador") return "admin";
    if (normalized === "master" || normalized === "master") return "master";
    return normalized;
}

export function initAdminPanel() {
    setupRealtimeUsers();
    setupForm();
    setupInputMasks();
    setupRolePlaceholder();
    setupRoleToggle();

    const currentRole = normalizeRole(state.userProfile?.role);
    const canManageUsers = currentRole === "master";

    const btnAdminPanel = document.getElementById("btn-admin-panel");
    if (btnAdminPanel) {
        btnAdminPanel.classList.toggle("hidden", !canManageUsers);
    }

    const userFormCard = document.querySelector("#admin-crud-screen .admin-card");
    if (userFormCard) {
        userFormCard.classList.toggle("hidden", !canManageUsers);
    }
    
    const btnLogout = document.getElementById("btn-admin-logout");
    if(btnLogout) {
        btnLogout.onclick = () => {
            if (unsubscribeUsers) unsubscribeUsers();
            if(window.logout) window.logout();
        };
    }

    const btnBack = document.getElementById("btn-admin-back");
    if (btnBack) {
        btnBack.onclick = () => {
            if (window.closeAdminPanel) window.closeAdminPanel();
        };
    }
}

// --- CONTROLE DE EXIBIÇÃO DO TELEFONE ---
function setupRoleToggle() {
    const roleSelect = document.getElementById("crud-role");
    const phoneGroup = document.getElementById("phone-group");

    if (!roleSelect || !phoneGroup) return;

    roleSelect.addEventListener("change", (e) => {
        // "broker" é o value que está no seu index.html para Corretor
        if (e.target.value === "broker") {
            phoneGroup.style.display = "flex";
        } else {
            phoneGroup.style.display = "none";
            document.getElementById("crud-phone").value = ""; // Limpa o campo
        }
    });
}

// --- SINCRONIZAÇÃO EM TEMPO REAL ---
function setupRealtimeUsers() {
    const tbody = document.getElementById("crud-user-list");
    if (!tbody) return;

    tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:20px;'>Conectando ao banco...</td></tr>";

    unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
        tbody.innerHTML = "";
        const users = [];
        
        snapshot.forEach(doc => {
            const userData = doc.data();
            const role = normalizeRole(userData.role);
            if (!ALLOWED_MANAGED_ROLES.has(role)) return;
            
            if (!HIDDEN_EMAILS.includes(userData.email)) users.push({ ...userData, role });
        });

        // --- ORDENAÇÃO POR DEPARTAMENTO E E-MAIL (COM CORREÇÃO PARA NÚMEROS) ---
        users.sort((a, b) => {
            // 1º Critério: Departamento (Role)
            const roleCompare = (a.role || "").localeCompare(b.role || "");
            
            if (roleCompare !== 0) return roleCompare;

            // 2º Critério: E-mail com ordenação natural (resolve o caso do 10 antes do 2)
            return (a.email || "").localeCompare(b.email || "", undefined, { 
                numeric: true, 
                sensitivity: 'base' 
            });
        });

        users.forEach((u) => {
            const tr = document.createElement("tr");

            let badgeClass = "badge-broker";
            let roleLabel = "Corretor";
            
            if (u.role === "admin" || u.role === "Admin") { badgeClass = "badge-admin"; roleLabel = "Admin"; }
            else if (u.role === "consultant") { badgeClass = "badge-consultant"; roleLabel = "Consultora"; }
            else if (u.role === "master") { badgeClass = "badge-master"; roleLabel = "Master"; }

            tr.innerHTML = `
                <td>
                    <strong class="view-mode view-name">${u.name || '-'}</strong>
                    <input type="text" class="edit-mode edit-name form-control" style="display: none; width: 100%;" value="${u.name || ""}">
                </td>
                <td>
                    <span class="view-mode view-email">${u.email}</span>
                    <input type="email" class="edit-mode edit-email form-control" style="display: none; width: 100%;" value="${u.email}">
                </td>
                <td>
                    <span class="view-mode view-phone">${u.phone || '-'}</span>
                    <input type="text" class="edit-mode edit-phone form-control" style="display: none; width: 100%;" value="${u.phone || ""}">
                </td>
                <td>
                    <span class="view-mode view-pass" style="font-family: monospace; color: #d63384;">${u.password || '***'}</span>
                    <input type="text" class="edit-mode edit-pass form-control" style="display: none; width: 100%;" value="${u.password || ""}">
                </td>
                <td>
                    <span class="view-mode badge ${badgeClass}">${roleLabel}</span>
                    <select class="edit-mode edit-role form-control" style="display: none; width: 100%;">
                        <option value="broker" ${u.role === 'broker' ? 'selected' : ''}>Corretor</option>
                        <option value="consultant" ${u.role === 'consultant' ? 'selected' : ''}>Consultora</option>
                        <option value="admin" ${u.role === 'admin' || u.role === 'Admin' ? 'selected' : ''}>Admin</option>
                        <option value="master" ${u.role === 'master' ? 'selected' : ''}>Master (TI)</option>
                    </select>
                </td>
                <td style="text-align: center;">
                    <div class="view-actions" style="display: flex; gap: 8px; justify-content: center;">
                        <button type="button" class="action-btn edit btn-edit"><i class="fas fa-pencil-alt"></i></button>
                        <button type="button" class="action-btn delete btn-delete"><i class="fas fa-trash-alt"></i></button>
                    </div>
                    <div class="edit-actions" style="display: none; gap: 8px; justify-content: center;">
                        <button type="button" class="btn-save-inline" style="color: #10b981; border:none; background:none; cursor:pointer;"><i class="fas fa-check"></i></button>
                        <button type="button" class="btn-cancel-inline" style="color: #ef4444; border:none; background:none; cursor:pointer;"><i class="fas fa-times"></i></button>
                    </div>
                </td>
            `;

            const toggleEditMode = (isEditing) => {
                tr.querySelectorAll(".view-mode").forEach(el => el.style.display = isEditing ? "none" : "");
                tr.querySelectorAll(".edit-mode").forEach(el => el.style.display = isEditing ? "block" : "none");
                tr.querySelector(".view-actions").style.display = isEditing ? "none" : "flex";
                tr.querySelector(".edit-actions").style.display = isEditing ? "flex" : "none";
            };

            tr.querySelector(".btn-edit").onclick = () => toggleEditMode(true);
            tr.querySelector(".btn-cancel-inline").onclick = () => {
                tr.querySelector(".edit-name").value = u.name || "";
                tr.querySelector(".edit-email").value = u.email || "";
                tr.querySelector(".edit-phone").value = u.phone || "";
                tr.querySelector(".edit-pass").value = u.password || "";
                tr.querySelector(".edit-role").value = u.role || "broker";
                toggleEditMode(false);
            };

            tr.querySelector(".btn-save-inline").onclick = async () => {
                const newEmail = tr.querySelector(".edit-email").value.trim();
                const newData = {
                    ...u,
                    name: tr.querySelector(".edit-name").value.trim(),
                    email: newEmail,
                    phone: tr.querySelector(".edit-phone").value.trim(),
                    password: tr.querySelector(".edit-pass").value.trim(),
                    role: tr.querySelector(".edit-role").value
                };

                try {
                    if (newEmail !== u.email) {
                        await setDoc(doc(db, "users", newEmail), newData);
                        await deleteDoc(doc(db, "users", u.email));
                    } else {
                        await setDoc(doc(db, "users", u.email), newData, { merge: true });
                    }
                    showToast("Atualizado com sucesso!", "success");
                    toggleEditMode(false);
                } catch (err) {
                    showToast("Erro ao atualizar.", "error");
                }
            };
            tr.querySelector(".btn-delete").onclick = () => removeUser(u.email);
            tbody.appendChild(tr);
        });
    });
}

// --- CRIAÇÃO DE USUÁRIO (Versão Unificada) ---
function setupForm() {
    const form = document.getElementById("admin-user-form");
    if(!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
// --- TRAVA DE SEGURANÇA EXTRA ---
        if (state.userProfile.role !== "master") {
            showToast("Apenas usuários de TI (Master) podem cadastrar novos perfis.", "error");
            return;
        }
        const email = document.getElementById("crud-email").value.trim();
        const password = document.getElementById("crud-password").value.trim();
        const name = document.getElementById("crud-name").value.trim();
        const role = normalizeRole(document.getElementById("crud-role").value);
        const phoneInput = document.getElementById("crud-phone");
        const phone = phoneInput ? phoneInput.value.trim() : "";

        if (!validateRules(email, password, name, role, phone)) return;

        const btnSave = form.querySelector("button[type='submit']");
        const originalText = btnSave.innerHTML;
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            await setDoc(doc(db, "users", email), { email, password, name, role, phone });
            form.reset();
            
            // Reseta estilos do select e oculta o telefone
            document.getElementById("crud-role").classList.remove("filled");
            const phoneGroup = document.getElementById("phone-group");
            if(phoneGroup) phoneGroup.style.display = "none";
            
            showToast("Utilizador criado com sucesso!", "success");
        } catch (error) {
            console.error("Erro salvar:", error.code);
            showToast("Erro ao salvar.", "error");
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = originalText;
        }
    };
}

function setupRolePlaceholder() {
    const roleSelect = document.getElementById("crud-role");
    if (!roleSelect) return;
    roleSelect.addEventListener("change", () => {
        if (roleSelect.value && roleSelect.value !== "") roleSelect.classList.add("filled");
        else roleSelect.classList.remove("filled");
    });
    if (!roleSelect.value) roleSelect.classList.remove("filled");
}

function setupInputMasks() {
    const nameInput = document.getElementById("crud-name");
    if (nameInput) {
        nameInput.addEventListener("input", (e) => {
            let value = e.target.value;
            value = value.replace(/[^a-zA-Z\u00C0-\u00FF\s]/g, "");
            const words = value.toLowerCase().split(" ");
            for (let i = 0; i < words.length; i++) {
                if (words[i].length > 0) {
                    words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);
                }
            }
            e.target.value = words.join(" ");
        });
    }

    // Máscara de Telefone (11) 99999-9999
    const phoneInput = document.getElementById("crud-phone");
    if (phoneInput) {
        phoneInput.addEventListener("input", (e) => {
            let value = e.target.value.replace(/\D/g, "");
            if (value.length > 11) value = value.slice(0, 11);
            if (value.length > 2) value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
            if (value.length > 9) value = `${value.slice(0, 9)}-${value.slice(9)}`;
            e.target.value = value;
        });
    }
}

function validateRules(email, password, name, role, phone) {
    if (!role || role === "") {
        showToast("Por favor, selecione uma Função para o utilizador.", "error");
        return false;
    }

    if (!ALLOWED_MANAGED_ROLES.has(role)) {
        showToast("Nesta tela, só é permitido cadastrar Corretor, Consultora, Admin ou Master.", "error");
        return false;
    }

    if (role === "broker") {
        if (!phone || phone.replace(/\D/g, '').length < 10) {
            showToast("Por favor, informe um telefone válido para o Corretor.", "error");
            return false;
        }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast("E-mail inválido. Verifique o formato.", "error");
        return false;
    }
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!strongPasswordRegex.test(password)) {
        if (password.length < 8) showToast("A senha precisa ter no mínimo 8 caracteres.", "error");
        else if (!/(?=.*[A-Z])/.test(password)) showToast("A senha precisa ter uma letra Maiúscula.", "error");
        else if (!/(?=.*[\W_])/.test(password)) showToast("A senha precisa ter um Símbolo (!@#$).", "error");
        else if (!/(?=.*\d)/.test(password)) showToast("A senha precisa ter um Número.", "error");
        else showToast("Senha fraca. Use letras, números e símbolos.", "error");
        return false;
    }
    if (!name || name.trim().length < 3) {
        showToast("O nome deve ter pelo menos 3 letras.", "error");
        return false;
    }
    return true;
}

async function removeUser(email) {
    if (email === "admin@admin.com" || email === "gl.infostech@gmail.com") {
        return showToast("Este utilizador mestre não pode ser excluído.", "error");
    }
    const confirmed = await customConfirm("Excluir Utilizador?", `Tem certeza que deseja remover o acesso de <b>${email}</b>?`);
    if (confirmed) {
        try {
            await deleteDoc(doc(db, "users", email));
            showToast("Utilizador excluído.", "success");
        } catch (error) {
            showToast("Erro ao excluir.", "error");
        }
    }
}

function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if(!container) return; 
    const toast = document.createElement("div");
    let icon = "fa-check-circle";
    if (type === "error") icon = "fa-times-circle";
    if (type === "info") icon = "fa-info-circle";
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "fadeOut 0.5s ease-out forwards";
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function customConfirm(title, text) {
    return new Promise((resolve) => {
        const modal = document.getElementById("custom-confirm-modal");
        if(!modal) { resolve(confirm(text.replace(/<[^>]*>?/gm, ''))); return; }
        const titleEl = document.getElementById("confirm-title");
        const textEl = document.getElementById("confirm-text");
        const btnConfirm = document.getElementById("btn-modal-confirm");
        const btnCancel = document.getElementById("btn-modal-cancel");

        titleEl.innerText = title;
        textEl.innerHTML = text;
        modal.classList.add("active");

        const close = () => {
            modal.classList.remove("active");
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
        };

        btnConfirm.onclick = () => { close(); resolve(true); };
        btnCancel.onclick = () => { close(); resolve(false); };
        modal.onclick = (e) => { if(e.target === modal) { close(); resolve(false); } };
    });
}