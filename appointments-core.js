import { state, BROKERS } from "./config.js";
import { showDialog, getPropertyList } from "./utils.js";

function normalizeValue(v) {
    return String(v || "").trim().toLowerCase();
}

function normalizePhone(phone) {
    // Mantém apenas os números digitados, removendo espaços, traços, parênteses ou o sinal de +
    let cleanPhone = String(phone || "").replace(/\D/g, "");
    return cleanPhone;
}

function getBrokerByIdOrName(brokerId, brokerName) {
    const idNorm = normalizeValue(brokerId);
    const nameNorm = normalizeValue(brokerName);

    return BROKERS.find((b) => {
        const brokerIdNorm = normalizeValue(b.id || b.docId || b.email);
        const brokerNameNorm = normalizeValue(b.name);
        if (idNorm && brokerIdNorm === idNorm) return true;
        if (nameNorm && brokerNameNorm === nameNorm) return true;
        return false;
    }) || null;
}

export function isTimeLocked(dateStr, timeStr) {
    if (!dateStr || !timeStr) return false;
    const now = new Date();
    const [y, m, d] = dateStr.split("-").map(Number);
    const [h, min] = timeStr.split(":").map(Number);
    const apptDate = new Date(y, m - 1, d, h, min);
    return apptDate < new Date(now.getTime() - 60000);
}

export function getLockMessage() {
    return "Horário passado. Contate o admin para alterar.";
}

export function getConsultantName(email) {
    if (!email) return "";
    if (state.availableConsultants) {
        const found = state.availableConsultants.find((c) => c.email === email);
        if (found) return found.name;
    }
    return email.split("@")[0].charAt(0).toUpperCase() + email.split("@")[0].slice(1);
}

export async function sendWhatsapp(name, phone, appt, brokerName, actionType = "create") {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
        return showDialog("Erro", "Telefone do corretor não encontrado no perfil.");
    }

    const dateParts = String(appt.date || "").split("-");
    const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : appt.date;
    const firstProperty = getPropertyList(appt)[0] || { reference: appt.reference || "", propertyAddress: appt.propertyAddress || "" };

    let msg = "";
    if (actionType === "delete") {
        msg = `*VISITA EXCLUÍDA*\nOlá ${brokerName}, um agendamento foi excluído:\n📅 Data: ${formattedDate}\n⏰ Hora: ${appt.startTime}\n📍 Endereço: ${firstProperty.propertyAddress}\n👤 Cliente: ${name}`;
    } else {
        msg = `*NOVA VISITA AGENDADA*\nOlá ${brokerName}, um novo agendamento foi criado:\n📅 Data: ${formattedDate}\n⏰ Hora: ${appt.startTime}\n📍 Endereço: ${firstProperty.propertyAddress}\n👤 Cliente: ${name}`;
    }

    if (firstProperty.reference) msg += `\nRef: ${firstProperty.reference}`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
}

export function createWhatsappButton(appt, brokerName, getClients = null) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-whatsapp";
    btn.innerHTML = `<i class="fab fa-whatsapp"></i> WhatsApp`;

    btn.onclick = async () => {
        const clientsSource = typeof getClients === "function" ? getClients() : getClientList(appt);
        const clients = Array.isArray(clientsSource) ? clientsSource : [];

        const clientsWithPhone = clients
            .map((c) => ({
                name: String(c?.name || "Cliente").trim() || "Cliente",
                phone: String(c?.phone || "").trim()
            }))
            .filter((c) => normalizePhone(c.phone));

        if (clientsWithPhone.length === 0) {
            await showDialog("Aviso", "Nenhum telefone de cliente foi cadastrado neste agendamento.");
            return;
        }

        const uniqueClients = [];
        const seenPhones = new Set();
        clientsWithPhone.forEach((c) => {
            const phoneKey = normalizePhone(c.phone);
            if (!seenPhones.has(phoneKey)) {
                seenPhones.add(phoneKey);
                uniqueClients.push(c);
            }
        });

        const selectedClient = await showDialog(
            "Escolher telefone do cliente",
            "Selecione um cliente deste agendamento para abrir o WhatsApp:",
            [
                ...uniqueClients.map((c) => ({
                    text: `${c.name} - ${c.phone}`,
                    value: c,
                    class: "btn-confirm"
                })),
                {
                    text: "Sair",
                    value: null,
                    class: "btn-cancel"
                }
            ]
        );

        if (!selectedClient) return;

        const cleanPhone = normalizePhone(selectedClient.phone);
        const dateParts = String(appt.date || "").split("-");
        const firstProperty = getPropertyList(appt)[0] || { reference: appt.reference || "", propertyAddress: appt.propertyAddress || "" };
        const msg = `Olá ${selectedClient.name}, estou entrando em contato para confirmar sua visita no imóvel da rua ${firstProperty.propertyAddress} (Ref: ${firstProperty.reference || ""}) com o corretor ${brokerName} no dia ${dateParts[2]}/${dateParts[1]} às ${appt.startTime}.`;

        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
    };
    return btn;
}

export async function handleBrokerNotification(brokerId, brokerName, actionType, appointmentData) {
    try {
        if (!appointmentData || appointmentData.isEvent) return;
        if (!brokerId) return;
        if (!["create", "delete"].includes(actionType)) return;

        const broker = getBrokerByIdOrName(brokerId, brokerName);
        const resolvedBrokerName = broker?.name || brokerName || "Corretor";
        const brokerPhone = broker?.phone || "";

        if (!brokerPhone) {
            await showDialog("Aviso", `O corretor ${resolvedBrokerName} não possui telefone cadastrado no perfil.`);
            return;
        }

        const clients = Array.isArray(appointmentData.clients) ? appointmentData.clients : [];
        const firstClient = clients.find((c) => String(c?.name || "").trim()) || { name: "Cliente" };

        const promptByAction = {
            create: `Deseja enviar mensagem no WhatsApp para ${resolvedBrokerName} informando que o agendamento foi criado?`,
            delete: `Deseja enviar mensagem no WhatsApp para ${resolvedBrokerName} informando que o agendamento foi excluído?`
        };

        const shouldSend = await showDialog(
            "Enviar notificação ao corretor",
            promptByAction[actionType],
            [
                { text: "Não enviar", value: false, class: "btn-cancel" },
                { text: "Enviar", value: true, class: "btn-confirm" }
            ]
        );

        if (!shouldSend) return;

        await sendWhatsapp(firstClient.name, brokerPhone, appointmentData, resolvedBrokerName, actionType);
    } catch (e) {
        console.error("Erro na notificação (ignorado para não travar):", e);
    }
}
