// ============================================
// Utils - Funzioni Utility Condivise
// Digital Credit CRM
// ============================================

// --- HASH SHA-256 ---
// Converte una stringa in hash SHA-256 (per password)
async function hashSHA256(testo) {
  const encoder = new TextEncoder();
  const data = encoder.encode(testo);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- FORMATTAZIONE DATE ---
// Formatta un Timestamp Firestore o Date in formato italiano
function formattaData(timestamp, includiOra = false) {
  if (!timestamp) return '—';
  
  let data;
  if (timestamp.toDate) {
    data = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    data = timestamp;
  } else {
    data = new Date(timestamp);
  }
  
  const opzioni = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  };
  
  if (includiOra) {
    opzioni.hour = '2-digit';
    opzioni.minute = '2-digit';
  }
  
  return data.toLocaleDateString('it-IT', opzioni);
}

// Formatta data relativa (es. "2 ore fa", "ieri")
function formattaDataRelativa(timestamp) {
  if (!timestamp) return '—';
  
  let data;
  if (timestamp.toDate) {
    data = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    data = timestamp;
  } else {
    data = new Date(timestamp);
  }
  
  const ora = new Date();
  const diff = ora - data;
  const minuti = Math.floor(diff / 60000);
  const ore = Math.floor(diff / 3600000);
  const giorni = Math.floor(diff / 86400000);
  
  if (minuti < 1) return 'Adesso';
  if (minuti < 60) return minuti + ' min fa';
  if (ore < 24) return ore + (ore === 1 ? ' ora fa' : ' ore fa');
  if (giorni < 7) return giorni + (giorni === 1 ? ' giorno fa' : ' giorni fa');
  
  return formattaData(data);
}

// --- NOTIFICHE TOAST ---
// Mostra una notifica toast (sostituto di alert())
function mostraToast(messaggio, tipo = 'info', durata = 3000) {
  // tipo: 'success' | 'error' | 'warning' | 'info'
  
  // Crea container se non esiste
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  
  // Crea toast
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + tipo;
  
  // Icona per tipo
  const icone = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icone[tipo] || icone.info}</span>
    <span class="toast-message">${messaggio}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  
  container.appendChild(toast);
  
  // Animazione entrata
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });
  
  // Rimozione automatica
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, durata);
}

// --- MODALE ---
// Mostra una modale di conferma (sostituto di confirm())
function mostraModale(titolo, messaggio, onConferma, testoConferma = 'Conferma', testoCancella = 'Annulla') {
  // Rimuovi modale precedente se esiste
  const vecchiaModale = document.getElementById('modale-overlay');
  if (vecchiaModale) vecchiaModale.remove();
  
  const overlay = document.createElement('div');
  overlay.id = 'modale-overlay';
  overlay.className = 'modale-overlay';
  
  overlay.innerHTML = `
    <div class="modale">
      <div class="modale-header">
        <h3 class="modale-titolo">${titolo}</h3>
        <button class="modale-close" id="modale-close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modale-body">
        <p>${messaggio}</p>
      </div>
      <div class="modale-footer">
        <button class="btn btn-secondary" id="modale-cancel-btn">${testoCancella}</button>
        <button class="btn btn-primary" id="modale-confirm-btn">${testoConferma}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Animazione entrata
  requestAnimationFrame(() => {
    overlay.classList.add('modale-visible');
  });
  
  // Funzione chiudi
  function chiudiModale() {
    overlay.classList.remove('modale-visible');
    setTimeout(() => overlay.remove(), 300);
  }
  
  // Eventi
  document.getElementById('modale-close-btn').addEventListener('click', chiudiModale);
  document.getElementById('modale-cancel-btn').addEventListener('click', chiudiModale);
  document.getElementById('modale-confirm-btn').addEventListener('click', function() {
    chiudiModale();
    if (onConferma) onConferma();
  });
  
  // Chiudi cliccando fuori
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) chiudiModale();
  });
}

// --- LOADING SPINNER ---
// Mostra/nasconde spinner di caricamento
function mostraLoading(container) {
  if (typeof container === 'string') {
    container = document.getElementById(container);
  }
  if (!container) return;
  
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.innerHTML = `
    <div class="spinner"></div>
    <span>Caricamento...</span>
  `;
  container.appendChild(spinner);
}

function nascondiLoading(container) {
  if (typeof container === 'string') {
    container = document.getElementById(container);
  }
  if (!container) return;
  
  const spinner = container.querySelector('.loading-spinner');
  if (spinner) spinner.remove();
}

// --- VALIDAZIONE ---
// Validazione email
function validaEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// Validazione telefono italiano
function validaTelefono(telefono) {
  const regex = /^(\+39)?\s?3\d{2}\s?\d{6,7}$/;
  return regex.test(telefono.replace(/\s/g, ''));
}

// --- SANITIZZAZIONE ---
// Previene XSS escapando HTML
function escapeHtml(testo) {
  if (!testo) return '';
  const div = document.createElement('div');
  div.textContent = testo;
  return div.innerHTML;
}

// --- DEBOUNCE ---
// Per ricerche e input frequenti
function debounce(func, attesa = 300) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), attesa);
  };
}

// --- URL PARAMS ---
// Legge un parametro dall'URL
function getUrlParam(nome) {
  const params = new URLSearchParams(window.location.search);
  return params.get(nome);
}

// --- EMPTY STATE ---
// Mostra messaggio quando una lista è vuota
function mostraEmptyState(container, icona, messaggio) {
  if (typeof container === 'string') {
    container = document.getElementById(container);
  }
  if (!container) return;
  
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icona}</div>
      <p class="empty-state-text">${messaggio}</p>
    </div>
  `;
}

// Log utility (rimuovere in produzione)
function logDebug(contesto, ...args) {
  console.log(`[${contesto}]`, ...args);
}

// ============================================
// AGGIUNGI QUESTO IN FONDO AL TUO utils.js
// ============================================

/**
 * Inizializza la sidebar: evidenzia la pagina corrente,
 * mostra/nasconde voci menu in base al ruolo utente
 */
function inizializzaSidebar() {
  var utente = getUtenteCorrente();
  if (!utente) return;

  // 1. Evidenzia la voce di menu della pagina corrente
  var paginaCorrente = window.location.pathname.split('/').pop() || 'dashboard.html';
  var menuItems = document.querySelectorAll('.sidebar-item');
  menuItems.forEach(function(item) {
    var href = item.getAttribute('href');
    if (href && href === paginaCorrente) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // 2. Mostra/nascondi voci in base al ruolo
  var ruolo = utente.ruolo;

  // Sezione admin (impostazioni, report, backoffice)
  var sectionAdmin = document.getElementById('section-admin');
  var menuImpostazioni = document.getElementById('menu-impostazioni');
  var menuReport = document.getElementById('menu-report');
  var menuBackoffice = document.getElementById('menu-backoffice');

  if (ruolo === 'admin') {
    if (sectionAdmin) sectionAdmin.style.display = '';
    if (menuImpostazioni) menuImpostazioni.style.display = '';
    if (menuReport) menuReport.style.display = '';
    if (menuBackoffice) menuBackoffice.style.display = '';
  } else if (ruolo === 'backoffice') {
    if (sectionAdmin) sectionAdmin.style.display = '';
    if (menuImpostazioni) menuImpostazioni.style.display = 'none';
    if (menuReport) menuReport.style.display = '';
    if (menuBackoffice) menuBackoffice.style.display = '';
  } else {
    // consulente — nasconde tutto
    if (sectionAdmin) sectionAdmin.style.display = 'none';
    if (menuImpostazioni) menuImpostazioni.style.display = 'none';
    if (menuReport) menuReport.style.display = 'none';
    if (menuBackoffice) menuBackoffice.style.display = 'none';
  }

  // 3. Carica contatore comunicazioni non lette
  var badgeCom = document.getElementById('badge-comunicazioni');
  if (badgeCom && typeof db !== 'undefined') {
    db.collection('comunicazioni').get().then(function(snapshot) {
      var nonLette = 0;
      snapshot.forEach(function(doc) {
        var data = doc.data();
        if (!data.lettoDa || !data.lettoDa.includes(utente.id)) {
          nonLette++;
        }
      });
      if (nonLette > 0) {
        badgeCom.textContent = nonLette;
        badgeCom.style.display = '';
      } else {
        badgeCom.style.display = 'none';
      }
    }).catch(function() {
      badgeCom.style.display = 'none';
    });
  }

  // 4. Mostra nome utente nel footer sidebar (se presente)
  var userInfo = document.getElementById('sidebar-user-info');
  if (userInfo) {
    userInfo.textContent = utente.nome + ' ' + utente.cognome;
  }
}
