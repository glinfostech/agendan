// config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getFirestore, 
    enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- CONFIGURAÇÃO ---
const firebaseConfig = {
  apiKey: "AIzaSyDlvSLcBHk_CD4Z8IRJMkyOg-TbCgXvwxE",
  authDomain: "agenda-nunes.firebaseapp.com",
  projectId: "agenda-nunes",
  storageBucket: "agenda-nunes.firebasestorage.app",
  messagingSenderId: "764774577796",
  appId: "1:764774577796:web:04cadabd23375c8b0c74d1",
  measurementId: "G-W6VS4CYYJP"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// REMOVIDO: export const auth = getAuth(app); -> Não usamos mais a auth nativa

// --- ATIVAÇÃO DA PERSISTÊNCIA (CACHE) ---
// Isso faz com que o F5 não conte como novas leituras para dados já baixados
enableIndexedDbPersistence(db)
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          console.log('Muitas abas abertas. Persistência habilitada em apenas uma.');
      } else if (err.code == 'unimplemented') {
          console.log('Navegador não suporta persistência.');
      }
  });

// --- DADOS E CONSTANTES DINÂMICOS ---
// Agora a lista de corretores começa vazia e será preenchida pelo app.js (Firebase)
export const BROKERS = [];

// Nova função que injeta os corretores do banco de dados na lista do sistema
export function setBrokers(newBrokers) {
    BROKERS.length = 0; // Limpa o array atual
    newBrokers.forEach(b => BROKERS.push(b)); // Adiciona os novos do banco
}

// Cores de fallback/legado (Pode manter sem problemas)
export const BROKER_COLORS = {
  "broker_lima": "#bae6fd",
  "broker_braga": "#fd9c9cff",
  "broker_davi": "#bbf7d0",
  "broker_carlos": "#ffa6f3ff",
  "broker_igor": "#fde047",
  "broker_externo": "#e5e7eb",
  "broker_chaves": "#fed7aa",
  "default": "#c7d2fe" 
};

export const TIME_START = 0;
export const TIME_END = 24;

// --- ESTADO GLOBAL (State) ---
export const state = {
    appointments: [],
    availableConsultants: [],
    userProfile: null,
    currentView: "day",
    currentDate: new Date(),
    selectedBrokerId: "all", // Iniciado como "all" (ou vazio) pois os corretores virão do banco
    appInitialized: false,
    unsubscribeSnapshot: null
};