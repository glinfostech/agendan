// utils.js
import { state, TIME_START } from "./config.js";

// --- FUNÇÕES AUXILIARES ---
export function toMinutes(t) { 
    if (!t || typeof t !== 'string') return 0; // Proteção contra o erro t.split
    const [h, m] = t.split(":").map(Number); 
    return h * 60 + m; 
}

export function isoDate(d) { 
    const z = d.getTimezoneOffset() * 60 * 1000;
    const localDate = new Date(d - z);
    return localDate.toISOString().split("T")[0];
}

export function translateRole(r) { 
    const role = String(r || "").trim().toLowerCase(); // Transforma tudo em minúsculo antes de ler
    if (role === "master" || role === "ti") return "Master";
    
    // MUDANÇA AQUI: Se não for nenhum dos acima, devolve "TESTE"
    return role === "admin" ? "Admin" : role === "consultant" ? "Consultora" : "Corretor"; 
}
export function getRow(t) { 
    const [h, m] = t.split(":").map(Number); 
    return (h - TIME_START) * 2 + (m === 30 ? 1 : 0) + 2; 
}

export function getStartOfWeek(d) { 
    const date = new Date(d); 
    const day = date.getDay(); 
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(date.setDate(diff)); 
}

export function getClientList(appt) {
    if (appt.clients && Array.isArray(appt.clients) && appt.clients.length > 0) {
        return appt.clients;
    }
    if (appt.clientName) {
        return [{ name: appt.clientName, phone: appt.clientPhone || "", addedBy: appt.createdBy }]; 
    }
    return [];
}

export function getPropertyList(appt) {
    if (appt && Array.isArray(appt.properties) && appt.properties.length > 0) {
        return appt.properties
            .map((prop) => ({
                reference: String(prop?.reference || "").trim(),
                propertyAddress: String(prop?.propertyAddress || "").trim()
            }))
            .filter((prop) => prop.reference || prop.propertyAddress);
    }

    const legacyReference = String(appt?.reference || "").trim();
    const legacyAddress = String(appt?.propertyAddress || "").trim();
    if (legacyReference || legacyAddress) {
        return [{ reference: legacyReference, propertyAddress: legacyAddress }];
    }

    return [];
}

// --- LÓGICA DE NEGÓCIO E CONFLITOS ---

export function checkOverlap(brokerId, dateStr, startStr, endStr, excludeId = null, isNewEvent = false) {
    // Eventos (Avisos) não bloqueiam a agenda
    if (isNewEvent) return false;
  
    const newStart = toMinutes(startStr);
    const newEnd = toMinutes(endStr);
    
    return state.appointments.some((appt) => {
      if (appt.id === excludeId) return false;
      if (appt.isEvent) return false; // Ignora eventos existentes para fins de bloqueio
  
      if (appt.brokerId !== brokerId) return false;
      if (appt.date !== dateStr) return false;
      const existStart = toMinutes(appt.startTime);
      const existEnd = toMinutes(appt.endTime);
      return newStart < existEnd && newEnd > existStart;
    });
}

export function checkTimeOverlap(novoAgendamento) {
    // Filtra apenas agendamentos que caem no mesmo dia e com o mesmo corretor
    const agendamentosConcorrentes = state.appointments.filter(a => 
        a.date === novoAgendamento.date && 
        a.brokerId === novoAgendamento.brokerId &&
        a.id !== novoAgendamento.id // Ignora o próprio agendamento se for uma edição
    );

    // Converte os horários para facilitar a comparação (minutos)
    const novoInicio = toMinutes(novoAgendamento.startTime);
    const novoFim = toMinutes(novoAgendamento.endTime);

    // Função auxiliar para ver se ocupa metade do espaço
    const ocupaMetade = (appt) => {
        const status = String(appt.status || "").toLowerCase();
        return appt.isEvent || status === "cancelada" || status === "cancelado";
    };

    let pesoOcupado = 0;

    for (let existente of agendamentosConcorrentes) {
        const existenteInicio = toMinutes(existente.startTime);
        const existenteFim = toMinutes(existente.endTime);

        // Verifica se os horários se cruzam
        if (novoInicio < existenteFim && novoFim > existenteInicio) {
            // Se cruzar, somamos o "peso" na agenda
            pesoOcupado += ocupaMetade(existente) ? 1 : 2;
        }
    }

    // Calcula o peso do agendamento que estamos a tentar salvar agora
    const pesoNovo = ocupaMetade(novoAgendamento) ? 1 : 2;

    // Se o peso total passar de 2, significa que não há espaço!
    // Exemplo: 1 Visita (2) + 1 Visita (2) = 4 (Bloqueia)
    // Exemplo: 1 Evento (1) + 1 Cancelado (1) + 1 Evento (1) = 3 (Bloqueia)
    // Exemplo: 1 Cancelado (1) + 1 Evento (1) = 2 (Permite)
    if ((pesoOcupado + pesoNovo) > 2) {
        return true; // Retorna TRUE porque HOUVE sobreposição não permitida
    }

    return false; // Retorna FALSE porque PODE SALVAR
}
export function checkDateLock(dateStr) {
    if (state.userProfile && state.userProfile.role === 'admin') return false;

    const today = new Date();
    today.setHours(0,0,0,0);
    
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d);

    if (targetDate.getTime() < today.getTime()) return true;

    if (targetDate.getTime() === today.getTime()) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();
        const dayOfWeek = now.getDay(); 

        // Regra Sábado (após 12:30)
        if (dayOfWeek === 6) {
            if (currentHour > 12 || (currentHour === 12 && currentMin >= 30)) return true;
        }
        // Regra Semana (após 18:00)
        else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            if (currentHour >= 18) return true;
        }
    }
    return false;
}
// utils.js (Adicione ao final, mantendo as outras funções)

// utils.js (Adicione ao final, mantendo as outras funções)

export function showDialog(title, message, buttons = [], options = {}) {
    return new Promise((resolve) => {
        const overlay = document.getElementById("custom-dialog");
        const box = overlay?.querySelector(".custom-dialog-box");
        const titleEl = document.getElementById("dialog-title");
        const textEl = document.getElementById("dialog-text");
        const actionsEl = document.getElementById("dialog-actions");

        if (!overlay || !box || !titleEl || !textEl || !actionsEl) {
            resolve(null);
            return;
        }

        const {
            showClose = false,
            closeValue = null,
            listLayout = false,
            closeOnOverlay = false,
            closeOnEscape = true
        } = options;

        titleEl.innerText = title;
        textEl.innerText = message;
        actionsEl.innerHTML = "";

        box.classList.toggle("dialog-list-mode", listLayout);

        if (buttons.length === 0) {
            buttons = [{ text: "OK", value: true, class: "btn-confirm" }];
        }

        let resolved = false;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            overlay.classList.add("hidden");
            box.classList.remove("dialog-list-mode");
            overlay.removeEventListener("click", onOverlayClick);
            document.removeEventListener("keydown", onEscape);
            closeBtn?.removeEventListener("click", onCloseBtnClick);
            if (closeBtn) closeBtn.remove();
            resolve(value);
        };

        const onOverlayClick = (event) => {
            if (!closeOnOverlay) return;
            if (event.target === overlay) finish(closeValue);
        };

        const onEscape = (event) => {
            if (!closeOnEscape) return;
            if (event.key === "Escape") finish(closeValue);
        };

        const closeBtn = showClose ? document.createElement("button") : null;
        const onCloseBtnClick = () => finish(closeValue);

        if (closeBtn) {
            closeBtn.type = "button";
            closeBtn.className = "dialog-close-btn";
            closeBtn.setAttribute("aria-label", "Fechar");
            closeBtn.innerHTML = "&times;";
            box.appendChild(closeBtn);
            closeBtn.addEventListener("click", onCloseBtnClick);
        }

        buttons.forEach((btn) => {
            const button = document.createElement("button");
            button.type = "button";
            button.innerText = btn.text;
            button.className = `btn-dialog ${btn.class || "btn-confirm"}`;
            button.onclick = () => finish(btn.value);
            actionsEl.appendChild(button);
        });

        overlay.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onEscape);
        overlay.classList.remove("hidden");
    });
}
