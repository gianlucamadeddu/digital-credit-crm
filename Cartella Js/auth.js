// ============================================
// Auth - Sistema di Autenticazione Custom
// Digital Credit CRM
// ============================================

// Chiave sessionStorage per i dati utente
const SESSION_KEY = 'digitalcredit_utente';

// --- CREDENZIALI ADMIN HARDCODED ---
const ADMIN_HARDCODED = {
  username: 'admin',
  password: 'luca1975',
  id: 'admin',
  nome: 'Admin',
  cognome: 'Digital Credit',
  email: 'admin@digitalcredit.it',
  telefono: '',
  ruolo: 'admin'
};

// --- LOGIN ---
// Verifica credenziali e salva sessione
async function login(username, password) {
  try {
    var usernameNorm = username.trim().toLowerCase();
    
    // 1. Controlla prima le credenziali Admin hardcoded
    if (usernameNorm === ADMIN_HARDCODED.username && password === ADMIN_HARDCODED.password) {
      var datiSessione = {
        id: ADMIN_HARDCODED.id,
        username: ADMIN_HARDCODED.username,
        nome: ADMIN_HARDCODED.nome,
        cognome: ADMIN_HARDCODED.cognome,
        email: ADMIN_HARDCODED.email,
        telefono: ADMIN_HARDCODED.telefono,
        ruolo: ADMIN_HARDCODED.ruolo,
        nomeCompleto: ADMIN_HARDCODED.nome + ' ' + ADMIN_HARDCODED.cognome
      };
      
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(datiSessione));
      logDebug('Auth', 'Login Admin hardcoded riuscito');
      return { successo: true, utente: datiSessione };
    }
    
    // 2. Per tutti gli altri utenti → cerca in Firestore
    var passwordHash = await hashSHA256(password);
    
    var snapshot = await db.collection('utenti')
      .where('username', '==', usernameNorm)
      .where('attivo', '==', true)
      .limit(1)
      .get();
    
    // Utente non trovato
    if (snapshot.empty) {
      return { successo: false, errore: 'Credenziali non valide' };
    }
    
    var doc = snapshot.docs[0];
    var utente = doc.data();
    
    // Verifica password
    if (utente.password !== passwordHash) {
      return { successo: false, errore: 'Credenziali non valide' };
    }
    
    // Prepara dati sessione (NO password)
    var datiSessione = {
      id: doc.id,
      username: utente.username,
      nome: utente.nome,
      cognome: utente.cognome,
      email: utente.email || '',
      telefono: utente.telefono || '',
      ruolo: utente.ruolo,
      nomeCompleto: utente.nome + ' ' + utente.cognome
    };
    
    // Salva in sessionStorage
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(datiSessione));
    
    // Aggiorna ultimo accesso in Firestore
    await db.collection('utenti').doc(doc.id).update({
      ultimoAccesso: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    logDebug('Auth', 'Login riuscito per:', datiSessione.nomeCompleto);
    
    return { successo: true, utente: datiSessione };
    
  } catch (errore) {
    console.error('Errore durante il login:', errore);
    return { successo: false, errore: 'Errore di connessione. Riprova.' };
  }
}

// --- LOGOUT ---
// Pulisce la sessione e reindirizza al login
function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  logDebug('Auth', 'Logout effettuato');
  window.location.href = 'index.html';
}

// --- UTENTE CORRENTE ---
// Ritorna i dati dell'utente dalla sessione, o null
function getUtenteCorrente() {
  const dati = sessionStorage.getItem(SESSION_KEY);
  if (!dati) return null;
  
  try {
    return JSON.parse(dati);
  } catch (e) {
    console.error('Errore parsing sessione:', e);
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

// --- VERIFICA PERMESSI ---
// Controlla se l'utente corrente ha uno dei ruoli consentiti
function verificaPermessi(ruoliConsentiti) {
  const utente = getUtenteCorrente();
  if (!utente) return false;
  return ruoliConsentiti.includes(utente.ruolo);
}

// --- PROTEGGI PAGINA ---
// Reindirizza al login se non autorizzato
// Chiamare all'inizio di ogni pagina protetta
function proteggPagina(ruoliConsentiti) {
  const utente = getUtenteCorrente();
  
  // Non loggato → login
  if (!utente) {
    window.location.href = 'index.html';
    return null;
  }
  
  // Ruolo non autorizzato → dashboard con errore
  if (ruoliConsentiti && !ruoliConsentiti.includes(utente.ruolo)) {
    mostraToast('Non hai i permessi per accedere a questa pagina', 'error');
    window.location.href = 'dashboard.html';
    return null;
  }
  
  return utente;
}

// --- SETUP HEADER UTENTE ---
// Popola header con nome utente, ruolo e bottone logout
function setupHeaderUtente() {
  const utente = getUtenteCorrente();
  if (!utente) return;
  
  // Nome utente nell'header
  const elNome = document.getElementById('header-nome-utente');
  if (elNome) {
    elNome.textContent = utente.nomeCompleto;
  }
  
  // Ruolo nell'header
  const elRuolo = document.getElementById('header-ruolo');
  if (elRuolo) {
    const ruoliLabel = {
      admin: 'Amministratore',
      consulente: 'Consulente',
      backoffice: 'Back Office'
    };
    elRuolo.textContent = ruoliLabel[utente.ruolo] || utente.ruolo;
  }
  
  // Iniziali avatar
  const elAvatar = document.getElementById('header-avatar');
  if (elAvatar) {
    elAvatar.textContent = (utente.nome[0] + utente.cognome[0]).toUpperCase();
  }
  
  // Bottone logout
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function() {
      mostraModale(
        'Conferma Logout',
        'Sei sicuro di voler uscire?',
        logout,
        'Esci',
        'Annulla'
      );
    });
  }
  
  // Gestione menu sidebar per ruolo
  gestisciMenuPerRuolo(utente.ruolo);
}

// --- MENU PER RUOLO ---
// Mostra/nasconde voci di menu in base al ruolo
function gestisciMenuPerRuolo(ruolo) {
  // Nascondi voci solo admin
  const vociAdmin = document.querySelectorAll('[data-ruolo="admin"]');
  vociAdmin.forEach(el => {
    if (ruolo !== 'admin') el.style.display = 'none';
  });
  
  // Nascondi voci solo backoffice
  const vociBO = document.querySelectorAll('[data-ruolo="backoffice"]');
  vociBO.forEach(el => {
    if (ruolo !== 'backoffice' && ruolo !== 'admin') el.style.display = 'none';
  });
  
  // Nascondi voci solo consulente
  const vociConsulente = document.querySelectorAll('[data-ruolo="consulente"]');
  vociConsulente.forEach(el => {
    if (ruolo !== 'consulente' && ruolo !== 'admin') el.style.display = 'none';
  });
}
