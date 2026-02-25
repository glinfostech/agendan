// appointments-actions.js
import { db, state, BROKERS } from "./config.js";
import { checkOverlap, showDialog } from "./utils.js";
import { 
    doc, addDoc, updateDoc, collection, writeBatch
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { isTimeLocked } from "./appointments-core.js";

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
}

function normalizeOwnerEmail(value, fallback = "") {
    return String(value || fallback || "").trim().toLowerCase();
}

function protectRowsByOwnership(oldRows, incomingRows, userEmail, userName, canManageAll) {
    const myEmail = normalizeOwnerEmail(userEmail);
    const oldList = Array.isArray(oldRows) ? oldRows : [];
    const incomingList = Array.isArray(incomingRows) ? incomingRows : [];

    if (canManageAll) {
        return incomingList.map(row => {
            return {
                ...row,
                addedBy: row.addedBy || userEmail,
                addedByName: row.addedByName || userName,
                addedAt: row.addedAt || new Date().toLocaleString("pt-BR")
            };
        });
    }

    const editableIncomingRows = incomingList.filter((row) => {
        const owner = normalizeOwnerEmail(row?.addedBy, myEmail);
        return owner === myEmail;
    }).map(row => {
        return {
            ...row,
            addedBy: row.addedBy || userEmail,
            addedByName: row.addedByName || userName,
            addedAt: row.addedAt || new Date().toLocaleString("pt-BR")
        };
    });

    const protectedRows = oldList.filter((row) => {
        const owner = normalizeOwnerEmail(row?.addedBy);
        return owner && owner !== myEmail;
    });

    const combinedRows = [...protectedRows, ...editableIncomingRows];

    combinedRows.sort((a, b) => {
        const parseDate = (dateStr) => {
            if (!dateStr) return 0;
            const match = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})[,\s]+(\d{2}):(\d{2}):(\d{2})/);
            if (match) {
                return new Date(match[3], match[2]-1, match[1], match[4], match[5], match[6]).getTime();
            }
            return 0;
        };
        return parseDate(a.addedAt) - parseDate(b.addedAt);
    });

    return combinedRows;
}

// --- AÇÃO: SALVAR AGENDAMENTO ---
export async function saveAppointmentAction(formData) {
    const id = formData.id;
    const isNew = !id;
    const role = normalizeRole(state.userProfile.role);
    const isAdmin = role === "admin";
    const isMaster = role === "master";
    const canManageAll = isAdmin || isMaster;
    
    let oldAppt = null;
    if (!isNew) {
        oldAppt = state.appointments.find(a => a.id === id);
        if (!oldAppt) throw new Error("Erro: Visita original não encontrada.");
    }

    const amICreator = isNew ? true : (oldAppt.createdBy === state.userProfile.email);
    const amIShared = !isNew && Array.isArray(oldAppt.sharedWith) && oldAppt.sharedWith.includes(state.userProfile.email);

    let isLocked = false;
    if (!isNew) {
        isLocked = isTimeLocked(oldAppt.date, oldAppt.startTime);
    }

    const canSaveAny = isNew ? true : (canManageAll || amICreator || amIShared);
    if (!canSaveAny) {
        throw new Error("Ação Bloqueada: você não tem permissão para alterar este agendamento.");
    }

    const canEditStatus = isNew ? true : (amICreator || canManageAll);

    if (isLocked && !canEditStatus) {
        throw new Error("Ação Bloqueada: este agendamento está fora do horário permitido para edição.");
    }

    let finalOwnerEmail = isNew ? state.userProfile.email : oldAppt.createdBy;
    let finalOwnerName = isNew ? state.userProfile.name : oldAppt.createdByName;

    if (canManageAll && formData.adminSelectedOwner) {
        finalOwnerEmail = formData.adminSelectedOwner;
        const consultantObj = state.availableConsultants ? state.availableConsultants.find(c => c.email === finalOwnerEmail) : null;
        finalOwnerName = consultantObj ? consultantObj.name : (finalOwnerEmail === oldAppt?.createdBy ? oldAppt.createdByName : finalOwnerEmail);
    }

    const linkedConsultantEmail = String(formData.linkedConsultantEmail || finalOwnerEmail || "").trim();
    const linkedConsultantObj = state.availableConsultants ? state.availableConsultants.find(c => c.email === linkedConsultantEmail) : null;
    const linkedConsultantName = linkedConsultantObj ? linkedConsultantObj.name : (linkedConsultantEmail === finalOwnerEmail ? finalOwnerName : linkedConsultantEmail);

    const nowIso = new Date().toISOString();

    const appointmentData = {
        brokerId: formData.brokerId,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        isEvent: formData.isEvent,
        
        status: formData.status || "agendada",
        statusObservation: formData.statusObservation || "",
        isRented: formData.isRented || false, 

        eventComment: formData.eventComment || "",
        properties: formData.properties || [],
        reference: formData.reference || "",
        propertyAddress: formData.propertyAddress || "",
        clients: formData.clients || [],
        sharedWith: formData.sharedWith || [],

        linkedConsultantEmail,
        linkedConsultantName,
        
        createdBy: finalOwnerEmail,
        createdByName: finalOwnerName,
        
        updatedAt: nowIso,
        updatedBy: state.userProfile.email,
        isEdited: !isNew,
        editedAt: !isNew ? nowIso : null
    };

    if (!isNew && isLocked) {
        appointmentData.brokerId = oldAppt.brokerId;
        appointmentData.date = oldAppt.date;
        appointmentData.startTime = oldAppt.startTime;
        appointmentData.endTime = oldAppt.endTime;
        appointmentData.isEvent = oldAppt.isEvent;
        appointmentData.eventComment = oldAppt.eventComment || "";
        appointmentData.properties = oldAppt.properties || [];
        appointmentData.reference = oldAppt.reference || "";
        appointmentData.propertyAddress = oldAppt.propertyAddress || "";
        appointmentData.clients = oldAppt.clients || [];
        appointmentData.sharedWith = oldAppt.sharedWith || [];
        appointmentData.linkedConsultantEmail = oldAppt.linkedConsultantEmail || oldAppt.createdBy || "";
        appointmentData.linkedConsultantName = oldAppt.linkedConsultantName || oldAppt.createdByName || "";
        appointmentData.createdBy = oldAppt.createdBy;
        appointmentData.createdByName = oldAppt.createdByName;
    } else if (!isNew && !canManageAll) {
        const amICreator = (oldAppt.createdBy === state.userProfile.email);
        if (!amICreator) {
            appointmentData.sharedWith = oldAppt.sharedWith || [];
        }
        appointmentData.clients = protectRowsByOwnership(
            oldAppt.clients, appointmentData.clients, state.userProfile.email, state.userProfile.name, canManageAll
        );
    }

    if (isNew) {
        appointmentData.createdAt = nowIso;
        appointmentData.isEdited = false;
        appointmentData.editedAt = null;
        if (!formData.isEvent) {
            const conflict = checkOverlap(appointmentData.brokerId, appointmentData.date, appointmentData.startTime, appointmentData.endTime, null, appointmentData.isEvent);
            if (conflict) throw new Error("Já existe um agendamento ativo neste horário para este corretor.");
        }
    } else {
        if (!formData.isEvent) {
            const conflict = checkOverlap(appointmentData.brokerId, appointmentData.date, appointmentData.startTime, appointmentData.endTime, id, appointmentData.isEvent);
            if (conflict) throw new Error("Já existe um agendamento ativo neste horário para este corretor.");
        }
    }

    // --- REGISTRO DE HISTÓRICO (Audit Log) E COMPARAÇÃO PARA O WHATSAPP ---
    let detectedChanges = [];
    if (!isNew) {
        const historyLog = oldAppt.history ? [...oldAppt.history] : [];
        detectedChanges = detectChanges(oldAppt, appointmentData);
        
        if (detectedChanges.length > 0) {
            historyLog.push({
                date: new Date().toLocaleString("pt-BR"),
                user: state.userProfile.name,
                action: detectedChanges.join("; ")
            });
            appointmentData.history = historyLog;
        } else {
             appointmentData.history = historyLog;
        }
    } else {
        appointmentData.history = [{
            date: new Date().toLocaleString("pt-BR"),
            user: state.userProfile.name,
            action: "Criação do Agendamento"
        }];
    }

    // --- SALVAR NO FIRESTORE ---
    const isRecurrent = (isNew && canManageAll && formData.recurrence && formData.recurrence.days && formData.recurrence.days.length > 0 && formData.recurrence.endDate);

    try {
        if (isRecurrent) {
            const batch = writeBatch(db);
            const generatedDates = generateRecurrenceDates(formData.date, formData.recurrence.endDate, formData.recurrence.days);
            if (generatedDates.length === 0) throw new Error("Nenhuma data gerada para a recorrência selecionada.");

            generatedDates.forEach(dateStr => {
                const ref = doc(collection(db, "appointments"));
                const clone = { ...appointmentData, date: dateStr, isEdited: false, editedAt: null };
                batch.set(ref, clone);
            });
            await batch.commit();

            const firstRecurringAppt = { ...appointmentData, date: generatedDates[0], isEdited: false, editedAt: null };
            return {
                message: `${generatedDates.length} agendamentos criados com recorrência!`,
                actionType: "create",
                appointment: firstRecurringAppt
            };
        }

        if (isNew) {
            const createdRef = await addDoc(collection(db, "appointments"), appointmentData);
            return {
                message: "Agendamento salvo com sucesso!",
                actionType: "create",
                appointment: { id: createdRef.id, ...appointmentData }
            };
        }

        await updateDoc(doc(db, "appointments", id), appointmentData);
        
        // --- NOVO: LÓGICA DO POPUP DO WHATSAPP COM FILTRO (CORRIGIDO) ---
        // Se NÃO for um agendamento novo, NÃO for um evento, e houver mudanças:
        if (!isNew && !appointmentData.isEvent && detectedChanges && detectedChanges.length > 0) {
            const oldStatus = String(oldAppt?.status || "").trim().toLowerCase();
            const newStatus = String(appointmentData?.status || "").trim().toLowerCase();
            const becameCanceled =
                (newStatus === "cancelada" || newStatus === "cancelado") &&
                !(oldStatus === "cancelada" || oldStatus === "cancelado");

            if (becameCanceled) {
                await promptBrokerNotification("cancel", appointmentData, []);
            } else {
                // Lista de textos que NÃO devem acionar o aviso ao corretor
                const ignorePrefixes = ["Status:", "Obs. Status:", "Imóvel Alugado:", "Partilhado com:"];

                // Filtra as mudanças, mantendo apenas as relevantes para o corretor
                const notifyChanges = detectedChanges.filter(changeMsg => {
                    return !ignorePrefixes.some(prefix => changeMsg.startsWith(prefix));
                });

                // Só abre a pergunta do WhatsApp se sobrou alguma mudança relevante
                if (notifyChanges.length > 0) {
                    await promptBrokerNotification("edit", appointmentData, notifyChanges);
                }
            }
        }

        return {
            message: "Agendamento salvo com sucesso!",
            actionType: "update",
            appointment: { id, ...appointmentData }
        };
    } catch (error) {
        console.error("Erro ao salvar:", error);
        throw new Error("Falha ao se comunicar com o banco de dados.");
    }
}

// --- AÇÃO: DELETAR AGENDAMENTO (Segurança Reforçada) ---
export async function deleteAppointmentAction(appt) {
    // Verifica o papel do usuário logado
    const role = String(state.userProfile?.role || "").trim().toLowerCase();
    const canManageAll = (role === "admin" || role === "master");

    if (!canManageAll) {
        throw new Error("Ação Bloqueada: Apenas Administradores ou Master podem excluir agendamentos.");
    }

    try {
        await updateDoc(doc(db, "appointments", appt.id), {
            deletedAt: new Date().toISOString(),
            deletedBy: state.userProfile?.email || "unknown"
        });

        return true;
    } catch (err) {
        console.error("Erro ao deletar:", err);
        throw err;
    }
}

// --- LÓGICA DO POPUP DO WHATSAPP ---
async function promptBrokerNotification(actionType, apptData, changes) {
    const broker = BROKERS.find(b => b.id === apptData.brokerId);
    if (!broker) return; // Corretor não encontrado

    let phone = broker.phone || broker.telefone || "";
    phone = phone.replace(/\D/g, "");
    if (!phone) return; // Sem telefone válido

    // Adiciona DDI do Brasil caso o formato esteja num padrão normal (10/11 dígitos sem DDI)
    if (phone.length === 10 || phone.length === 11) {
        phone = "55" + phone;
    }

    const apptDate = apptData.date.split('-').reverse().join('/');
    let msg = `Olá ${broker.name}, `;
    
    if (actionType === "delete" || actionType === "cancel") {
        msg += `a visita do dia *${apptDate}* às *${apptData.startTime}* foi *CANCELADA/EXCLUÍDA* no sistema.\n\n`;
    } else {
        msg += `a visita do dia *${apptDate}* às *${apptData.startTime}* foi *ALTERADA* no sistema.\n\n`;
        msg += `*O que mudou:*\n- ${changes.join("\n- ")}\n\n`;
    }
    
    const whatsUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    
    const userWantsToNotify = await showDialog(
        "Notificar Corretor?", 
        `Deseja avisar o corretor ${broker.name} via WhatsApp sobre essa ${actionType === 'delete' ? 'exclusão' : (actionType === 'cancel' ? 'cancelamento' : 'alteração')}?`,
        [
            { text: "Apenas salvar/excluir", value: false, class: "btn-secondary" },
            { text: "Sim, enviar WhatsApp", value: true, class: "btn-confirm" }
        ]
    );

    if (userWantsToNotify) {
        window.open(whatsUrl, "_blank");
    }
}

// --- FUNÇÕES DE APOIO ---
function detectChanges(oldAppt, newData) {
    const changes = [];
    const fields = {
        brokerId: "Corretor",
        date: "Data",
        startTime: "Início",
        endTime: "Fim",
        status: "Status",
        statusObservation: "Obs. Status",
        isRented: "Imóvel Alugado", 
        createdBy: "Responsável"
    };

    const getName = (idOrEmail) => {
        if (!idOrEmail) return null;
        let person = BROKERS.find(b => b.id === idOrEmail || b.email === idOrEmail);
        if (person && person.name) return person.name;
        if (state.availableConsultants) {
            person = state.availableConsultants.find(c => c.id === idOrEmail || c.email === idOrEmail);
            if (person && person.name) return person.name;
        }
        if (state.users) {
            person = state.users.find(u => u.id === idOrEmail || u.email === idOrEmail);
            if (person && person.name) return person.name;
        }
        return idOrEmail; 
    };
    
    for (let key in fields) {
        let oldVal = oldAppt[key];
        let newVal = newData[key];
        
        if (key === "brokerId") {
            if (oldVal !== newVal) {
                const oldName = getName(oldVal) || "Nenhum";
                const newName = getName(newVal) || "Nenhum";
                changes.push(`Corretor: de '${oldName}' para '${newName}'`);
            }
        } else if (key === "createdBy") {
            if (oldVal !== newVal) {
                 const oldOwner = oldAppt.createdByName || getName(oldVal) || "Nenhum";
                 const newOwner = newData.createdByName || getName(newVal) || "Nenhum";
                 changes.push(`Responsável: de '${oldOwner}' para '${newOwner}'`);
            }
        } else if (key === "isRented") {
            const oldRented = oldVal ? "Sim" : "Não";
            const newRented = newVal ? "Sim" : "Não";
            if (oldRented !== newRented) {
                changes.push(`Imóvel Alugado: de '${oldRented}' para '${newRented}'`);
            }
        } else {
            let oldStr = String(oldVal || "").trim() || "Vazio";
            let newStr = String(newVal || "").trim() || "Vazio";
            if (oldStr !== newStr) {
                changes.push(`${fields[key]}: de '${oldStr}' para '${newStr}'`);
            }
        }
    }
    
    const formatProps = (props) => {
        if (!props || props.length === 0) return "Nenhum";
        return props.map(p => {
            const ref = p.reference ? `Ref: ${p.reference}` : "";
            const end = p.propertyAddress ? `End: ${p.propertyAddress}` : "";
            const separator = (ref && end) ? " - " : "";
            return `[${ref}${separator}${end}]`;
        }).join(", ");
    };
    
    const oldPropsStr = formatProps(oldAppt.properties);
    const newPropsStr = formatProps(newData.properties);
    if (oldPropsStr !== newPropsStr) {
        changes.push(`Imóveis: de '${oldPropsStr}' para '${newPropsStr}'`);
    }

    const formatClients = (clients) => {
        if (!clients || clients.length === 0) return "Nenhum";
        return clients.map(c => c.name?.trim() || "Sem Nome").join(", ");
    };
    
    const oldClientsStr = formatClients(oldAppt.clients);
    const newClientsStr = formatClients(newData.clients);
    if (oldClientsStr !== newClientsStr) {
         changes.push(`Clientes: de '${oldClientsStr}' para '${newClientsStr}'`);
    }

    const formatShared = (sharedList) => {
        if (!sharedList || sharedList.length === 0) return "Ninguém";
        return sharedList.map(email => getName(email)).join(", ");
    };
    
    const oldSharedStr = formatShared(oldAppt.sharedWith);
    const newSharedStr = formatShared(newData.sharedWith);
    if (oldSharedStr !== newSharedStr) {
        changes.push(`Partilhado com: de '${oldSharedStr}' para '${newSharedStr}'`);
    }

    return changes;
}

function generateRecurrenceDates(startDateStr, endDateStr, daysOfWeekArray) {
    const dates = [];
    let current = new Date(startDateStr + "T12:00:00"); 
    const end = new Date(endDateStr + "T12:00:00");
    
    while (current <= end) {
        if (daysOfWeekArray.includes(current.getDay())) {
            dates.push(current.toISOString().split("T")[0]);
        }
        current.setDate(current.getDate() + 1);
    }
    return dates;
}