import { showDialog } from "./utils.js";
// Importa UI
import { 
    openAppointmentModal, 
    getFormDataFromUI 
} from "./appointments-ui.js";

// Importa Actions
import { 
    saveAppointmentAction, 
    deleteAppointmentAction 
} from "./appointments-actions.js";
import { handleBrokerNotification } from "./appointments-core.js";

export function setupAppointmentLogic() {
    // Liga a função global window.openModal à UI, injetando a lógica de Deletar
    window.openModal = (appt, defaults) => {
        openAppointmentModal(appt, defaults, handleDeleteRequest);
    };

    setupFormSubmit();
    setupModalOutsideClick();
}

// --- HANDLER: FECHAR AO CLICAR FORA ---
function setupModalOutsideClick() {
    const modal = document.getElementById("modal");
    if (modal) {
        modal.addEventListener("mousedown", (e) => {
            if (e.target === modal) {
                if (window.closeModal) {
                    window.closeModal();
                } else {
                    modal.classList.remove("open");
                }
            }
        });
    }
}

// --- HANDLER: SUBMIT DO FORMULÁRIO ---
function setupFormSubmit() {
    const form = document.getElementById("form-visit");
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const btnSave = document.getElementById("btn-save");
        if (btnSave.disabled) return; 
        btnSave.disabled = true;

        try {
            // 1. Pede os dados para a UI
            const formData = getFormDataFromUI();
            
            // 2. Manda a Action salvar (A action valida e persiste)
            const saveResult = await saveAppointmentAction(formData);

            if (saveResult && saveResult.appointment) {
                // FECHA O MODAL PRIMEIRO (alivia o navegador)
                if(window.closeModal) window.closeModal();
                else document.getElementById("modal").classList.remove("open");

                // DÁ UM "RESPIRO" DE 300ms PARA O NAVEGADOR RENDERIZAR O renderMain() DO FIRESTORE
                setTimeout(async () => {
                    await handleBrokerNotification(
                        saveResult.appointment.brokerId,
                        null,
                        saveResult.actionType || (formData.id ? "update" : "create"),
                        saveResult.appointment
                    );
                }, 300); // 300 milissegundos já são suficientes para tirar o lag
                
            } else {
                if(window.closeModal) window.closeModal();
                else document.getElementById("modal").classList.remove("open");
            } // <-- 1. FALTAVA FECHAR O BLOCO 'ELSE' AQUI
            
        } catch (err) { // <-- 2. FALTAVA FECHAR O BLOCO 'TRY' ANTES DO CATCH AQUI
            console.error(err);
            await showDialog("Atenção", err.message);
        } finally {
            btnSave.disabled = false;
        }
    };
}

// --- HANDLER: REQUISIÇÃO DE EXCLUSÃO ---
// Essa função é passada como callback para a UI
async function handleDeleteRequest(appt) {
    try {
        const success = await deleteAppointmentAction(appt);
        if (success) {
            await handleBrokerNotification(appt?.brokerId, null, "delete", appt);
            if(window.closeModal) window.closeModal();
            else document.getElementById("modal").classList.remove("open");
        }
    } catch (err) {
        console.error(err);
        await showDialog("Erro", err?.message || "Falha ao excluir o agendamento.");
    }
}