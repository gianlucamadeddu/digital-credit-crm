// ============================================
// Firebase Config - Digital Credit CRM
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyDld3qTWe5tgyL2vzI6NPU9GiGUDlQwnHY",
  authDomain: "digital-credit-crm.firebaseapp.com",
  projectId: "digital-credit-crm",
  storageBucket: "digital-credit-crm.firebasestorage.app",
  messagingSenderId: "112506542200",
  appId: "1:112506542200:web:e55e3b3b10372eb55cb58d"
};

// Inizializza Firebase
firebase.initializeApp(firebaseConfig);

// Riferimenti globali
const db = firebase.firestore();
const storage = firebase.storage();

// Log di conferma (rimuovere in produzione)
console.log("✅ Firebase inizializzato correttamente");
