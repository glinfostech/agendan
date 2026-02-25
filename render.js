import { BROKERS, TIME_START, TIME_END, state } from "./config.js";
import { isoDate, getRow, getStartOfWeek, getClientList, getPropertyList, checkTimeOverlap } from "./utils.js";

// --- PALETA DE CORES DINÂMICA (21 Cores Diferentes) ---
const DYNAMIC_THEMES = [
    { bg: "#e0f2fe", border: "#0ea5e9" }, { bg: "#ffe4e6", border: "#f43f5e" },
    { bg: "#dcfce7", border: "#22c55e" }, { bg: "#fae8ff", border: "#d946ef" },
    { bg: "#fef9c3", border: "#eab308" }, { bg: "#ffedd5", border: "#f97316" },
    { bg: "#ede9fe", border: "#8b5cf6" }, { bg: "#ccfbf1", border: "#14b8a6" },
    { bg: "#fbcfe8", border: "#ec4899" }, { bg: "#dbeafe", border: "#3b82f6" },
    { bg: "#ecfccb", border: "#84cc16" }, { bg: "#fef3c7", border: "#f59e0b" },
    { bg: "#e0e7ff", border: "#6366f1" }, { bg: "#cffafe", border: "#06b6d4" },
    { bg: "#f3e8ff", border: "#a855f7" }, { bg: "#d1fae5", border: "#10b981" },
    { bg: "#ffe4e6", border: "#e11d48" }, { bg: "#d0fdd7", border: "#4ade80" },
    { bg: "#f1f5f9", border: "#64748b" }, { bg: "#f5f5f4", border: "#78716c" },
    { bg: "#eef2ff", border: "#4f46e5" }
];

function getSafeBrokerIdForCreation() {
  if (state.selectedBrokerId && state.selectedBrokerId !== "all") return state.selectedBrokerId;
  return BROKERS.length > 0 ? BROKERS[0].id : "";
}

function getBrokerNameById(brokerId) {
  return BROKERS.find((b) => b.id === brokerId)?.name || "Sem corretor";
}

function getBrokerTheme(brokerId) {
    if (!brokerId) return { bg: "#f8fafc", border: "#94a3b8" };
    const idx = BROKERS.findIndex(b => b.id === brokerId);
    if (idx !== -1) return DYNAMIC_THEMES[idx % DYNAMIC_THEMES.length];
    
    let hash = 0;
    for (let i = 0; i < brokerId.length; i++) hash = brokerId.charCodeAt(i) + ((hash << 5) - hash);
    return DYNAMIC_THEMES[Math.abs(hash) % DYNAMIC_THEMES.length];
}

export function renderMain() {
  const grid = document.getElementById("schedule-grid");
  if (!grid) return;

  grid.innerHTML = "";
  grid.className = `schedule-grid grid-${state.currentView}`;
  document.documentElement.style.setProperty('--num-corretores', BROKERS.length);
  
  if (state.currentView === "day") renderDayView(grid);
  if (state.currentView === "week") renderWeekView(grid);
  if (state.currentView === "month") renderMonthView(grid);
}

export function updateHeaderDate() {
  const dateEl = document.getElementById("current-date-label");
  if (!dateEl) return;

  if (state.currentView === "day") {
    dateEl.innerText = state.currentDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  } else if (state.currentView === "week") {
    const start = getStartOfWeek(state.currentDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    dateEl.innerText = `Semana de ${fmt(start)} até ${fmt(end)}`;
  } else {
    dateEl.innerText = state.currentDate.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  }
}

export function scrollToBusinessHours() {
  setTimeout(() => {
    const container = document.getElementById("calendar-scroller");
    const target = document.getElementById("time-marker-08:00");
    if (target && container) {
      container.scrollTo({ top: target.offsetTop - 60, behavior: "smooth" });
    }
  }, 100);
}

function renderDayView(grid) {
  grid.appendChild(createCell("header-cell", "Horário"));
  BROKERS.forEach((b, i) => {
    const h = createCell("header-cell", b.name);
    h.style.gridColumn = i + 2;
    h.style.gridRow = 1;
    grid.appendChild(h);
  });

  let row = 2;
  const dateStr = isoDate(state.currentDate);
  const now = new Date(); 
  const [year, month, day] = dateStr.split('-').map(Number);
  
  for (let h = TIME_START; h < TIME_END; h++) {
    ["00", "30"].forEach((m) => {
      const time = `${h.toString().padStart(2, "0")}:${m}`;
      const t = createCell("time-cell", time);
      t.id = `time-marker-${time}`;
      t.style.gridColumn = 1; t.style.gridRow = row;
      grid.appendChild(t);

      const slotDate = new Date(year, month - 1, day, h, parseInt(m));
      const isPast = slotDate < now;
      const isBroker = state.userProfile && (state.userProfile.role === "broker" || state.userProfile.role === "Corretor");

      BROKERS.forEach((broker, colIdx) => {
        const slot = createCell("grid-slot", "");
        slot.style.gridColumn = colIdx + 2; slot.style.gridRow = row;
        
        if (isPast) {
            slot.style.cursor = "not-allowed";
            slot.style.backgroundColor = "rgba(241, 245, 249, 0.4)"; 
            slot.onclick = (e) => e.stopPropagation(); 
        } else if (isBroker) {
            slot.style.cursor = "not-allowed";
            slot.onclick = (e) => {
                e.stopPropagation();
                if(window.showToast) window.showToast("Corretores só podem visualizar agendamentos.", "error");
            };
        } else {
            slot.onclick = () => window.openModal(null, { brokerId: broker.id, time, date: dateStr });
        }
        
        grid.appendChild(slot);
      });
      row++;
    });
  }
  
  const todaysAppts = state.appointments.filter((a) => a.date === dateStr);
  
  todaysAppts.forEach((appt) => {
      const bIdx = BROKERS.findIndex((b) => b.id === appt.brokerId);
      if (bIdx >= 0) {
          const col = bIdx + 2;
          const rStart = getRow(appt.startTime);
          const span = getRow(appt.endTime) - getRow(appt.startTime);
          
          let styleConfig = { width: "100%", left: "0%" };
          
          // Verifica se é evento ou se está cancelado (para ocupar metade do tamanho)
          const statusAppt = String(appt.status || "").toLowerCase();
          const isApptHalfSize = appt.isEvent || statusAppt === "cancelada" || statusAppt === "cancelado";

          if (isApptHalfSize) {
              styleConfig.width = "50%";
              styleConfig.left = "0%";
          } else {
              // Procura se existe algum agendamento que ocupe metade (evento/cancelado) no mesmo horário para empurrar este para a direita
              const conflictEvent = todaysAppts.find(other => {
                  const statusOther = String(other.status || "").toLowerCase();
                  const isOtherHalfSize = other.isEvent || statusOther === "cancelada" || statusOther === "cancelado";
                  
                  return isOtherHalfSize && 
                         other.brokerId === appt.brokerId && 
                         checkTimeOverlap(appt, other);
              });
              
              if (conflictEvent) {
                  styleConfig.width = "50%";
                  styleConfig.left = "50%"; 
              }
          }
          placeCard(grid, appt, col, rStart, span, styleConfig);
      }
  });
}

function renderWeekView(grid) {
  const startOfWeek = getStartOfWeek(state.currentDate);
  const weekDays = [];
  
  grid.appendChild(createCell("header-cell", "Horário"));
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekDays.push(isoDate(d));
    const h = createCell("header-cell", d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric" }));
    h.classList.add("capitalize");
    h.style.gridColumn = i + 2; h.style.gridRow = 1;
    grid.appendChild(h);
  }

  let row = 2;
  const now = new Date(); 

  for (let h = TIME_START; h < TIME_END; h++) {
    ["00", "30"].forEach((m) => {
      const time = `${h.toString().padStart(2, "0")}:${m}`;
      const t = createCell("time-cell", time);
      t.id = `time-marker-${time}`;
      t.style.gridColumn = 1; t.style.gridRow = row;
      grid.appendChild(t);
      
      weekDays.forEach((dIso, colIdx) => {
        const slot = createCell("grid-slot", "");
        slot.style.gridColumn = colIdx + 2; slot.style.gridRow = row;
        
        const [year, month, day] = dIso.split('-').map(Number);
        const slotDate = new Date(year, month - 1, day, h, parseInt(m));
        const isPast = slotDate < now;
        const isBroker = state.userProfile && (state.userProfile.role === "broker" || state.userProfile.role === "Corretor");

        if (isPast) {
            slot.style.cursor = "not-allowed";
            slot.style.backgroundColor = "rgba(241, 245, 249, 0.4)"; 
            slot.onclick = (e) => e.stopPropagation(); 
        } else if (isBroker) {
            slot.style.cursor = "not-allowed";
            slot.onclick = (e) => {
                e.stopPropagation();
                if(window.showToast) window.showToast("Corretores só podem visualizar agendamentos.", "error");
            };
        } else {
            slot.onclick = () => window.openModal(null, { brokerId: getSafeBrokerIdForCreation(), time, date: dIso });
        }

        grid.appendChild(slot);
      });
      row++;
    });
  }

  // Captura o corretor selecionado no Filtro (Select) ou no estado
  const currentSelectedBroker = document.getElementById("view-broker-select")?.value || state.selectedBrokerId || "all";
  
  const weekAppts = state.appointments.filter((a) => (currentSelectedBroker === "all" || a.brokerId === currentSelectedBroker) && weekDays.includes(a.date));
  
  weekAppts.forEach((appt) => {
      const dayIdx = weekDays.indexOf(appt.date);
      if (dayIdx >= 0) {
          const col = dayIdx + 2;
          const rStart = getRow(appt.startTime);
          const span = getRow(appt.endTime) - getRow(appt.startTime);

          let styleConfig = { width: "100%", left: "0%" };
          
          // Verifica se é evento ou se está cancelado (para ocupar metade do tamanho)
          const statusAppt = String(appt.status || "").toLowerCase();
          const isApptHalfSize = appt.isEvent || statusAppt === "cancelada" || statusAppt === "cancelado";

          if (isApptHalfSize) {
              styleConfig.width = "50%";
              styleConfig.left = "0%";
          } else {
              // Procura se existe algum agendamento que ocupe metade (evento/cancelado) no mesmo dia/horário
              const conflictEvent = weekAppts.find(other => {
                  const statusOther = String(other.status || "").toLowerCase();
                  const isOtherHalfSize = other.isEvent || statusOther === "cancelada" || statusOther === "cancelado";
                  
                  return isOtherHalfSize && 
                         other.date === appt.date &&
                         checkTimeOverlap(appt, other);
              });
              
              if (conflictEvent) {
                  styleConfig.width = "50%";
                  styleConfig.left = "50%";
              }
          }
          placeCard(grid, appt, col, rStart, span, styleConfig);
      }
  });
}

function renderMonthView(grid) {
  ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"].forEach((d) => {
    const c = createCell("header-cell", d);
    c.style.position = "static";
    grid.appendChild(c);
  });

  const y = state.currentDate.getFullYear();
  const m = state.currentDate.getMonth();
  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);
  
  let startDayOffset = firstDay.getDay() - 1;
  if (startDayOffset === -1) startDayOffset = 6;
  
  for (let i = 0; i < startDayOffset; i++) grid.appendChild(createCell("month-cell", ""));
  
  // Captura o corretor selecionado no Filtro (Select) ou no estado
  const currentSelectedBroker = document.getElementById("view-broker-select")?.value || state.selectedBrokerId || "all";

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const cur = new Date(y, m, d);
    const iso = isoDate(cur);
    const cell = document.createElement("div");
    cell.className = "month-cell";
    cell.innerHTML = `<div class="month-cell-header">${d}</div>`;
    
    const dayAppts = state.appointments.filter((a) => a.date === iso && (currentSelectedBroker === "all" || a.brokerId === currentSelectedBroker));
    dayAppts.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    dayAppts.forEach((a) => {
      const dot = document.createElement("div");
      const theme = getBrokerTheme(a.brokerId);
      const bgColor = a.isEvent ? "#fff7ed" : theme.bg;
      const borderColor = a.isEvent ? "#f97316" : theme.border;
      
      dot.style.cssText = `font-size:10px; padding:2px; background:${bgColor}; margin-bottom:2px; border-radius:3px; overflow:hidden; white-space:nowrap; cursor:pointer; color:#0f172a; border-left: 3px solid ${borderColor}; border-top:1px solid rgba(0,0,0,0.05); border-right:1px solid rgba(0,0,0,0.05); border-bottom:1px solid rgba(0,0,0,0.05);`;
      
      const firstProperty = getPropertyList(a)[0] || { reference: "" };
      const brokerLabel = getBrokerNameById(a.brokerId);
      const labelText = a.isEvent ? `(AVISO) ${a.eventComment}` : `${a.startTime} [${brokerLabel}] ${firstProperty.reference || ""} ${getClientList(a)[0]?.name || ""}`;
      dot.innerText = labelText;
      
      dot.onclick = (e) => { e.stopPropagation(); window.openModal(a); };
      cell.appendChild(dot);
    });
    
    cell.onclick = (e) => {
      if (e.target !== cell && e.target.className !== "month-cell-header") return;

      state.currentDate = new Date(y, m, d);
      window.setView("day");
    };
    grid.appendChild(cell);
  }
}

function createCell(cls, txt) { 
    const d = document.createElement("div"); 
    d.className = cls; 
    d.innerText = txt; 
    return d; 
}

function placeCard(grid, appt, col, rowStart, span, styleConfig = {}) {
  const div = document.createElement("div");
  
  const hasShares = appt.sharedWith && appt.sharedWith.length > 0;
  const amInvolved = (appt.createdBy === state.userProfile.email) ||
                     (appt.sharedWith && appt.sharedWith.includes(state.userProfile.email));
  const showSharedIcon = hasShares && amInvolved;
  
  const theme = getBrokerTheme(appt.brokerId);
  div.className = `appointment-card`;
  div.style.backgroundColor = theme.bg;
  div.style.borderLeftColor = theme.border; 

  if (!appt.isEvent) {
      const [y, m, d] = appt.date.split('-').map(Number);
      const [h, min] = appt.startTime.split(':').map(Number);
      
      const apptEnd = new Date(y, m - 1, d, h, min);
      apptEnd.setMinutes(apptEnd.getMinutes() + (parseInt(appt.duration) || 30));
      
      const now = new Date();

      if (apptEnd < now) {
          div.style.filter = "saturate(40%) brightness(96%) contrast(90%)";
          div.style.cursor = "default";
      }
  }

  div.style.gridColumn = col;
  div.style.gridRow = `${rowStart} / span ${span}`;
  
  div.style.overflow = "hidden"; 
  div.style.maxHeight = "100%";
  div.style.display = "flex";
  div.style.flexDirection = "column";
  div.style.justifyContent = "flex-start";
  
  if (styleConfig.width) div.style.width = styleConfig.width;
  if (styleConfig.left) div.style.left = styleConfig.left;

  const textStyle = `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; line-height: 1.2;`;
  const apptStatus = String(appt.status || "").trim().toLowerCase();
  const isCanceled = apptStatus === "cancelada" || apptStatus === "cancelado";

  if (appt.isEvent) {
      div.classList.add("event-card-style");
      div.style.zIndex = "15"; 
      div.innerHTML = `
          <div style="font-weight:bold; font-size:0.8rem; margin-bottom:2px; ${textStyle}"><i class="fas fa-exclamation-circle"></i> AVISO</div>
          <div style="font-style:italic; white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">${appt.eventComment || "Sem descrição"}</div>
      `;
  } else {
      div.style.zIndex = "20"; 
      
      if (state.userProfile && appt.createdBy === state.userProfile.email) {
          div.classList.add("my-appointment-highlight");
          const star = document.createElement("i");
          star.className = "fas fa-star my-star-icon";
          div.appendChild(star);
      }

      const contentDiv = document.createElement("div");
      contentDiv.style.flex = "1";
      contentDiv.style.overflow = "hidden";

      if (isCanceled) {
          div.classList.add("canceled-appointment-card");
      }
      
      let iconHtml = showSharedIcon ? `<i class="fas fa-users shared-icon" title="Compartilhado"></i> ` : "";
      const canceledIconHtml = isCanceled ? `<i class="fas fa-ban canceled-icon" title="Agendamento cancelado" aria-label="Agendamento cancelado"></i>` : "";
      
      let html = "";
      html += `<div style="${textStyle}">${canceledIconHtml}<strong>Cons:</strong> ${iconHtml}${appt.createdByName}</div>`;
      
      const propertyList = getPropertyList(appt);
      const firstProperty = propertyList[0] || { reference: appt.reference || "", propertyAddress: appt.propertyAddress || "" };

      if (firstProperty.reference) {
         html += `<div style="${textStyle}"><strong>Ref:</strong> ${firstProperty.reference}</div>`;
      }

      html += `<div style="${textStyle}" title="${firstProperty.propertyAddress || ""}"><strong>End:</strong> ${firstProperty.propertyAddress || ""}</div>`;
      if (propertyList.length > 1) {
          html += `<div style="${textStyle}; color:#555;">+ ${propertyList.length - 1} imóvel(is)</div>`;
      }

      const clientList = getClientList(appt);
      if (clientList.length > 0) {
          const mainName = clientList[0].name || "Sem Nome"; 
          html += `<div style="${textStyle}" title="${mainName}"><strong>Cli:</strong> ${mainName}</div>`;
          
          if (clientList[0].phone) {
             html += `<div style="${textStyle}"><i class="fab fa-whatsapp" style="font-size:0.7rem; color: #25D366;"></i> ${clientList[0].phone}</div>`;
          }
          
          if (clientList.length > 1) {
              html += `<div style="${textStyle}; color:#555;">+ ${clientList.length - 1} cliente(s)</div>`;
          }
      }

      contentDiv.innerHTML = html;
      div.prepend(contentDiv);
  }

  div.onclick = (e) => { e.stopPropagation(); window.openModal(appt); };
  grid.appendChild(div);
}