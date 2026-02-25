import { state, BROKERS, TIME_START, TIME_END } from "./config.js";
import { getClientList, getPropertyList } from "./utils.js";
import { renderMain, updateHeaderDate, scrollToBusinessHours } from "./render.js";

export function setupUIInteractions() {
    document.body.classList.remove("theme-dark");
    setupDropdowns();
    setupSearch();
    setupEventCheckboxLogic();
    setupClientAddButton();
    setupGlobalViewFunctions();
}

function setupDropdowns() {
    // 1. Tenta carregar os corretores na primeira vez
    updateBrokerDropdowns();

    // 2. Monta os horários (esses não mudam, então carregamos uma vez só)
    let times = "";
    for (let h = TIME_START; h < TIME_END; h++) {
        times += `<option value="${h.toString().padStart(2, "0")}:00">${h}:00</option>`;
        times += `<option value="${h.toString().padStart(2, "0")}:30">${h}:30</option>`;
    }
    times += `<option value="${TIME_END}:00">00:00 (Fim)</option>`;
    
    const startSelect = document.getElementById("form-start");
    const endSelect = document.getElementById("form-end");
    if(startSelect) startSelect.innerHTML = times;
    if(endSelect) endSelect.innerHTML = times;

    // --- GATILHOS DE SEGURANÇA ---
    // Se a lista de corretores chegar atrasada do Firebase, recarregamos
    // o botão automaticamente quando o usuário passar o mouse ou tocar nele.
    const brokerSelectView = document.getElementById("view-broker-select");
    if (brokerSelectView) {
        brokerSelectView.addEventListener("mouseenter", updateBrokerDropdowns);
        brokerSelectView.addEventListener("touchstart", updateBrokerDropdowns);
    }
}

// Nova função separada que injeta as opções nos Selects sem perder o que já estava selecionado
export function updateBrokerDropdowns() {
    if (!BROKERS || BROKERS.length === 0) return;

    // Cria apenas as opções dos corretores reais
    const formOpts = BROKERS.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
    
    // Atualiza o Select do Filtro da Tela (agora sem o "Todos os corretores")
    const brokerSelectView = document.getElementById("view-broker-select");
    if(brokerSelectView) {
        let currentVal = brokerSelectView.value;
        brokerSelectView.innerHTML = formOpts;
        
        // Se estava em "all" ou vazio, força a selecionar o primeiro corretor da lista
        if (!currentVal || currentVal === "all") {
            brokerSelectView.value = BROKERS[0].id;
        } else {
            brokerSelectView.value = currentVal; 
        }
    }

    // Atualiza o Select de Corretor dentro do Formulário/Modal
    const brokerSelectForm = document.getElementById("form-broker");
    if(brokerSelectForm) {
        const currentFormVal = brokerSelectForm.value;
        brokerSelectForm.innerHTML = formOpts;
        if(currentFormVal) brokerSelectForm.value = currentFormVal;
    }
}

function setupEventCheckboxLogic() {
    const chk = document.getElementById("form-is-event");
    if(!chk) return;

    chk.addEventListener("change", () => {
        const isEvent = chk.checked;
        const visitContainer = document.getElementById("visit-fields-container");
        const eventContainer = document.getElementById("event-fields-container");
        const shareSection = document.getElementById("share-section");
        
        // NOVO: Captura os blocos de Status
        const statusContainer = document.getElementById("status-container");
        const statusObs = document.getElementById("div-status-obs");

        if (isEvent) {
            // Se for evento, esconde visita, compartilhamento e status
            if (visitContainer) visitContainer.classList.add("hidden");
            if (shareSection) shareSection.classList.add("hidden");
            if (statusContainer) statusContainer.classList.add("hidden");
            if (statusObs) statusObs.classList.add("hidden");
            
            if (eventContainer) eventContainer.classList.remove("hidden");
            
            document.querySelectorAll(".property-address-input, .property-reference-input").forEach(inp => { inp.required = false; });
            document.querySelectorAll(".client-name-input").forEach(inp => {
                inp.required = false; inp.disabled = true;
            });
        } else {
            // Se for visita normal, mostra visita, compartilhamento e status principal
            if (visitContainer) visitContainer.classList.remove("hidden");
            if (shareSection) shareSection.classList.remove("hidden");
            if (statusContainer) statusContainer.classList.remove("hidden");
            
            // Regra para voltar a exibir a observação caso o status não seja 'agendada'
            const currentStatus = document.getElementById("form-status")?.value;
            if (statusObs && currentStatus !== "agendada") {
                statusObs.classList.remove("hidden");
            }
            
            if (eventContainer) eventContainer.classList.add("hidden");
            
            const firstRef = document.querySelector(".property-reference-input");
            const firstAddress = document.querySelector(".property-address-input");
            if (firstRef) firstRef.required = true;
            if (firstAddress) firstAddress.required = true;
            document.querySelectorAll(".client-name-input").forEach(inp => {
                inp.required = true; inp.disabled = false;
            });
        }
    });
}

function setupClientAddButton() {
    const btnAddClient = document.getElementById("btn-add-client");
    if(btnAddClient) {
        btnAddClient.addEventListener("click", () => {
            const container = document.getElementById("clients-container");
            // Ao clicar no botão, geramos a data atual e o nome do usuário logado
            const nowStr = new Date().toLocaleString("pt-BR");
            addClientRow(
                "", 
                "", 
                state.userProfile.email, 
                container.children.length, 
                true,
                state.userProfile.name, // Nome de quem clicou
                nowStr                  // Data de agora
            );
        });
    }
}

function setupSearch() {
    const searchInput = document.getElementById("global-search");
    const dropdown = document.getElementById("search-dropdown");
    const list = document.getElementById("search-results-list");
  
    if(!searchInput || !dropdown) return; 

    document.addEventListener('click', (e) => {
        const isClickInside = searchInput.contains(e.target) || dropdown.contains(e.target);
        if (!isClickInside) dropdown.classList.remove('active');
    });

    searchInput.addEventListener("input", (e) => {
        const rawTerm = searchInput.value || "";
        const term = rawTerm.toLowerCase().trim();
        
        if (!term) { dropdown.classList.remove("active"); return; }

        const highlightMatch = (text) => {
            if (!text) return "";
            const strText = String(text);
            const regex = new RegExp(`(${term})`, 'gi'); 
            return strText.replace(regex, '<mark style="background-color: #fef08a; color:#854d0e; padding:0 2px; border-radius:2px;">$1</mark>');
        };

        const results = state.appointments.filter(a => {
            if (a.isEvent) return (a.eventComment && a.eventComment.toLowerCase().includes(term));
            
            const properties = getPropertyList(a);
            const refMatch = properties.some(p => (p.reference && p.reference.toLowerCase().includes(term)));
            const addrMatch = properties.some(p => (p.propertyAddress && p.propertyAddress.toLowerCase().includes(term)));
            const consultantMatch = (a.createdByName && a.createdByName.toLowerCase().includes(term));
            
            const clientList = getClientList(a);
            const clientMatch = clientList.some(c => {
                const nameFound = (c.name && String(c.name).toLowerCase().includes(term));
                const cleanPhone = (c.phone || "").replace(/\D/g, "");
                const phoneFound = cleanPhone.includes(term) || (c.phone && c.phone.includes(term));
                return nameFound || phoneFound;
            });
            
            return refMatch || addrMatch || clientMatch || consultantMatch;
        });

        results.sort((a, b) => new Date(b.date) - new Date(a.date));
        list.innerHTML = "";
        
        if (results.length === 0) {
            list.innerHTML = "<div style='padding:12px; color:gray; text-align:center;'>Nenhum resultado encontrado.</div>";
        } else {
            results.forEach(res => {
                const div = document.createElement("div");
                div.className = "result-item";
                const dateParts = res.date.split("-");
                const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                
                if (res.isEvent) {
                    div.innerHTML = `
                        <div class="result-main-line">
                            <span style="color:#f97316;">EVENTO: ${highlightMatch(res.eventComment)}</span>
                            <span class="result-date">${dateFormatted}</span>
                        </div>`;
                } else {
                    const clientNamesHtml = getClientList(res).map(c => {
                        const name = c.name || "Sem Nome";
                        return highlightMatch(name);
                    }).join(", ");

                    const consultantName = res.createdByName || "Consultora";
                    const consultantHtml = highlightMatch(consultantName);

                    const firstProperty = getPropertyList(res)[0] || { reference: "", propertyAddress: "" };
                    const refHtml = highlightMatch(firstProperty.reference || "Sem Ref");
                    const addrHtml = highlightMatch(firstProperty.propertyAddress);

                    div.innerHTML = `
                    <div class="result-main-line">
                        <span class="result-ref">${refHtml}</span>
                        <span class="result-date">${dateFormatted}</span>
                    </div>
                    
                    <div class="result-sub" style="font-weight:600; color:#444;">
                        <i class="fas fa-user-tie" style="font-size:0.8em;"></i> ${consultantHtml}
                    </div>
                    
                    <div class="result-sub">${addrHtml}</div>
                    <div class="result-sub" style="color:#64748b;">${clientNamesHtml}</div>`;
                }
                
                div.onclick = () => {
                    dropdown.classList.remove("active");
                    searchInput.value = ""; 
                    const [y, m, d] = res.date.split("-").map(Number);
                    state.currentDate = new Date(y, m - 1, d);
                    window.setView('day'); 
                    setTimeout(() => {
                        const targetId = `time-marker-${res.startTime}`;
                        const el = document.getElementById(targetId);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 150); 
                    if(window.openModal) window.openModal(res);
                };
                list.appendChild(div);
            });
        }
        dropdown.classList.add("active");
    });
}

function setupGlobalViewFunctions() {
    window.setView = (view) => {
        state.currentView = view;
        document.querySelectorAll(".view-btn").forEach((b) => b.classList.remove("active"));
        document.getElementById(`btn-${view}`).classList.add("active");
        
        const brokerSel = document.getElementById("view-broker-select");
        if (view === "day") {
            brokerSel.classList.add("hidden");
        } else {
            brokerSel.classList.remove("hidden");
            updateBrokerDropdowns(); // <-- Força a atualização do DOM na hora!
        }
        updateHeaderDate();
        renderMain();
        if (view !== "month") scrollToBusinessHours();
    };

    window.changeDate = (delta) => {
        if (state.currentView === "day") state.currentDate.setDate(state.currentDate.getDate() + delta);
        if (state.currentView === "week") state.currentDate.setDate(state.currentDate.getDate() + delta * 7);
        if (state.currentView === "month") state.currentDate.setMonth(state.currentDate.getMonth() + delta);
        updateHeaderDate();
        renderMain();
    };

    window.changeBrokerFilter = () => {
        state.selectedBrokerId = document.getElementById("view-broker-select").value;
        renderMain();
    };
    
    window.closeModal = () => {
        document.getElementById("modal").classList.remove("open");
    };
}

// --- FUNÇÃO AJUSTADA PARA FLEXBOX E DADOS DE CADASTRO ---
function refreshClientRemoveButtons() {
    const container = document.getElementById("clients-container");
    if (!container) return;
    const rows = Array.from(container.querySelectorAll(".client-item-row"));
    rows.forEach((r) => {
        const btnWrap = r.querySelector(".remove-client-btn-container");
        if (!btnWrap) return;
        btnWrap.style.display = rows.length > 1 ? "flex" : "none";
    });
}

export function addClientRow(nameVal, phoneVal, addedByVal, index, rowEditable, addedByNameVal = "", addedAtVal = "") {
    const container = document.getElementById("clients-container");
    const row = document.createElement("div");
    row.className = "client-item-row";
    
    // Layout Flexbox: Garante que fiquem lado a lado e alinhados ao topo
    row.style.display = "flex";
    row.style.gap = "10px";
    row.style.alignItems = "flex-start";
    row.style.marginBottom = "10px";
    row.style.paddingBottom = "10px";
    row.style.borderBottom = "1px solid #eee";
    
    // Hidden inputs originais
    const hiddenAddedBy = document.createElement("input");
    hiddenAddedBy.type = "hidden"; hiddenAddedBy.className = "client-added-by"; hiddenAddedBy.value = addedByVal || state.userProfile.email; 
    row.appendChild(hiddenAddedBy);

    // --- NOVOS INPUTS HIDDEN (Nome e Data) ---
    const hiddenAddedByName = document.createElement("input");
    hiddenAddedByName.type = "hidden"; 
    hiddenAddedByName.className = "client-added-by-name";
    hiddenAddedByName.value = addedByNameVal || ""; 
    row.appendChild(hiddenAddedByName);

    const hiddenAddedAt = document.createElement("input");
    hiddenAddedAt.type = "hidden"; 
    hiddenAddedAt.className = "client-added-at";
    hiddenAddedAt.value = addedAtVal || ""; 
    row.appendChild(hiddenAddedAt);
    
    // --- COLUNA NOME ---
    const divName = document.createElement("div");
    divName.style.flex = "1"; // Ocupa metade
    
    const labelName = document.createElement("label");
    labelName.textContent = "Nome";
    // Estilos inline para garantir visual correto sem depender só do CSS externo
    labelName.style.display = "block";
    labelName.style.fontSize = "0.85rem";
    labelName.style.fontWeight = "600";
    labelName.style.marginBottom = "4px";

    const inputName = document.createElement("input");
    inputName.type = "text"; inputName.className = "form-control client-name-input";
    inputName.value = nameVal; inputName.required = true; inputName.disabled = !rowEditable;
    inputName.style.width = "100%";
    
    divName.appendChild(labelName); 
    divName.appendChild(inputName);

    // EXIBIÇÃO VISUAL: "Cadastrado por..."
    if (hiddenAddedByName.value && hiddenAddedAt.value) {
        const infoDiv = document.createElement("div");
        infoDiv.style.fontSize = "0.7rem";
        infoDiv.style.color = "#94a3b8"; 
        infoDiv.style.marginTop = "4px";
        infoDiv.style.fontStyle = "italic";
        infoDiv.style.lineHeight = "1.2";
        infoDiv.innerText = `Cadastrado por: ${hiddenAddedByName.value} em ${hiddenAddedAt.value}`;
        divName.appendChild(infoDiv);
    }

    // --- COLUNA TELEFONE ---
    const divPhone = document.createElement("div");
    divPhone.style.flex = "1"; // Ocupa metade
    
    const labelPhone = document.createElement("label");
    labelPhone.textContent = "Telefone";
    labelPhone.style.display = "block";
    labelPhone.style.fontSize = "0.85rem";
    labelPhone.style.fontWeight = "600";
    labelPhone.style.marginBottom = "4px";

    const inputPhone = document.createElement("input");
    inputPhone.type = "text"; inputPhone.className = "form-control client-phone-input";
    inputPhone.value = phoneVal; inputPhone.disabled = !rowEditable;
    inputPhone.style.width = "100%";
    inputPhone.addEventListener('input', function(e) { e.target.value = e.target.value.replace(/[^0-9+\-()\s]/g, ''); });
    
    divPhone.appendChild(labelPhone); 
    divPhone.appendChild(inputPhone);

    row.appendChild(divName); 
    row.appendChild(divPhone);

    // BOTÃO REMOVER
    if (rowEditable) {
        const btnContainer = document.createElement("div");
        btnContainer.className = "remove-client-btn-container";
        // Ajuste para alinhar verticalmente com os inputs (compensando o label)
        btnContainer.style.display = "flex";
        btnContainer.style.alignItems = "center";
        btnContainer.style.justifyContent = "center";
        btnContainer.style.paddingTop = "19px"; 

        const btnRem = document.createElement("button");
        btnRem.type = "button"; btnRem.className = "remove-client-btn";
        btnRem.innerHTML = "<i class='fas fa-trash'></i>";
        // Estilos para garantir que o botão fique bonito e limpo
       
        btnRem.style.height = "38px"; 

        btnRem.onclick = () => {
            row.remove();
            refreshClientRemoveButtons();
        };
        btnContainer.appendChild(btnRem);
        row.appendChild(btnContainer);
    }
    container.appendChild(row);
    refreshClientRemoveButtons();
}
export function addPropertyRow(referenceVal = "", addressVal = "", index = 0, rowEditable = true) {
    const container = document.getElementById("properties-container");
    if (!container) return;

    const row = document.createElement("div");
    row.className = "property-item-row";
    
    // --- Configuração do Flexbox da linha ---
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.gap = "10px";
    row.style.marginBottom = "10px";
    
    // --- CAMPO REFERÊNCIA ---
    const divRef = document.createElement("div");
    divRef.style.flex = "0 0 120px";
    const labelRef = document.createElement("label");
    labelRef.innerText = index === 0 ? "Ref." : `Ref. ${index + 1}`;
    labelRef.style.display = "block";
    labelRef.style.marginBottom = "4px";
    
    const inpRef = document.createElement("input");
    inpRef.type = "text";
    inpRef.className = "form-control property-reference-input";
    inpRef.value = referenceVal || "";
    inpRef.placeholder = "";
    inpRef.setAttribute("inputmode", "numeric");
    inpRef.oninput = function() {
        this.value = this.value.replace(/[^0-9]/g, "");
    };
    inpRef.disabled = !rowEditable;
    inpRef.style.width = "100%";
    
    divRef.appendChild(labelRef);
    divRef.appendChild(inpRef);

    // --- CAMPO ENDEREÇO ---
    const divAddress = document.createElement("div");
    divAddress.style.flex = "1";
    const labelAddress = document.createElement("label");
    labelAddress.innerText = "Imóvel / Endereço / Obs.";
    labelAddress.style.display = "block";
    labelAddress.style.marginBottom = "4px";
    
    const inpAddress = document.createElement("input");
    inpAddress.type = "text";
    inpAddress.className = "form-control property-address-input";
    inpAddress.value = addressVal || "";
    inpAddress.disabled = !rowEditable;
    inpAddress.style.width = "100%";
    
    divAddress.appendChild(labelAddress);
    divAddress.appendChild(inpAddress);

    // --- BOTÃO DE REMOVER (LIXEIRA) ---
    const btnContainer = document.createElement("div");
    btnContainer.className = "remove-btn-container"; 
    btnContainer.style.display = "flex";
    btnContainer.style.alignItems = "flex-end"; 

    const btnRemove = document.createElement("button");
    btnRemove.type = "button";
    btnRemove.className = "remove-property-btn";
    btnRemove.innerHTML = '<i class="fas fa-trash"></i>';
    btnRemove.title = "Remover imóvel";
    btnRemove.disabled = !rowEditable;
    btnRemove.style.height = "38px"; 

    btnRemove.onclick = () => {
        row.remove();
        const rows = Array.from(container.querySelectorAll('.property-item-row'));
        rows.forEach((r, idx) => {
            const refLabel = r.querySelector('label');
            if (refLabel) refLabel.innerText = idx === 0 ? 'Ref.' : `Ref. ${idx + 1}`;
            
            const rBtnContainer = r.querySelector('.remove-btn-container');
            if (rBtnContainer) {
                 rBtnContainer.style.display = rows.length === 1 ? "none" : "flex";
            }
        });
        
        const btnAddProperty = document.getElementById("btn-add-property");
        if (btnAddProperty && rows.length < 4) {
            btnAddProperty.style.display = ""; 
        }
    };

    btnContainer.appendChild(btnRemove);

    row.appendChild(divRef);
    row.appendChild(divAddress);
    row.appendChild(btnContainer);

    container.appendChild(row);

    const allRows = container.querySelectorAll('.property-item-row');
    allRows.forEach((r) => {
        const rBtnContainer = r.querySelector('.remove-btn-container');
        if (rBtnContainer) {
            rBtnContainer.style.display = allRows.length === 1 ? "none" : "flex";
        }
    });
}