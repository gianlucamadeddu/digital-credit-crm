// ============================================================
// impostazioni.js — Logica pannello Impostazioni (solo Admin)
// ============================================================

// --- Variabili globali ---
// NOTA: 'db' è già dichiarato in firebase-config.js, non lo ridichiariamo
let utenti = [];
let stati = [];
let campagne = [];
let consulentiAttivi = [];
let sortableStati = null;

// ============================================================
// INIZIALIZZAZIONE
// ============================================================

document.addEventListener('DOMContentLoaded', async function () {
  // Verifica autenticazione e permessi (solo Admin)
  const utente = getUtenteCorrente();
  if (!utente) {
    window.location.href = 'index.html';
    return;
  }
  if (utente.ruolo !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  // Mostra info utente nella sidebar
  const elNome = document.getElementById('sidebar-user-nome');
  const elRuolo = document.getElementById('sidebar-user-ruolo');
  if (elNome) elNome.textContent = utente.nome + ' ' + utente.cognome;
  if (elRuolo) elRuolo.textContent = utente.ruolo;

  // Firestore è già inizializzato da firebase-config.js (variabile globale 'db')

  // Inizializza tab
  inizializzaTab();

  // Inizializza eventi
  inizializzaEventi();

  // Carica dati tab attivo (utenti)
  await caricaUtenti();

  // Logout
  document.getElementById('btn-logout').addEventListener('click', function () {
    logout();
  });
});

// ============================================================
// GESTIONE TAB
// ============================================================

function inizializzaTab() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      // Rimuovi active da tutti
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function (tc) { tc.classList.remove('active'); });

      // Attiva il tab cliccato
      btn.classList.add('active');
      var tabId = btn.getAttribute('data-tab');
      document.getElementById('tab-' + tabId).classList.add('active');

      // Carica dati del tab
      switch (tabId) {
        case 'utenti':
          caricaUtenti();
          break;
        case 'stati':
          caricaStati();
          break;
        case 'campagne':
          caricaCampagne();
          break;
        case 'assegnazione':
          caricaAssegnazione();
          break;
      }
    });
  });
}

// ============================================================
// EVENTI (click bottoni, modali)
// ============================================================

function inizializzaEventi() {
  // --- Utenti ---
  document.getElementById('btn-nuovo-utente').addEventListener('click', apriModaleNuovoUtente);
  document.getElementById('chiudi-modale-utente').addEventListener('click', chiudiModaleUtente);
  document.getElementById('btn-annulla-utente').addEventListener('click', chiudiModaleUtente);
  document.getElementById('btn-conferma-utente').addEventListener('click', salvaUtente);

  // --- Reset password ---
  document.getElementById('chiudi-modale-reset').addEventListener('click', chiudiModaleReset);
  document.getElementById('btn-annulla-reset').addEventListener('click', chiudiModaleReset);
  document.getElementById('btn-conferma-reset').addEventListener('click', confermaResetPassword);

  // --- Stati ---
  document.getElementById('btn-nuovo-stato').addEventListener('click', apriModaleNuovoStato);
  document.getElementById('chiudi-modale-stato').addEventListener('click', chiudiModaleStato);
  document.getElementById('btn-annulla-stato').addEventListener('click', chiudiModaleStato);
  document.getElementById('btn-conferma-stato').addEventListener('click', salvaStato);

  // Elimina stato
  document.getElementById('chiudi-modale-elimina-stato').addEventListener('click', chiudiModaleEliminaStato);
  document.getElementById('btn-annulla-elimina-stato').addEventListener('click', chiudiModaleEliminaStato);
  document.getElementById('btn-conferma-elimina-stato').addEventListener('click', confermaEliminaStato);

  // --- Campagne ---
  document.getElementById('btn-nuova-campagna').addEventListener('click', apriModaleNuovaCampagna);
  document.getElementById('chiudi-modale-campagna').addEventListener('click', chiudiModaleCampagna);
  document.getElementById('btn-annulla-campagna').addEventListener('click', chiudiModaleCampagna);
  document.getElementById('btn-conferma-campagna').addEventListener('click', salvaCampagna);

  // --- Assegnazione ---
  document.getElementById('select-campagna-assegnazione').addEventListener('change', onCampagnaAssegnazioneChange);
  document.getElementById('btn-salva-distribuzione').addEventListener('click', salvaDistribuzione);

  // --- Conferma generica ---
  document.getElementById('chiudi-modale-conferma').addEventListener('click', chiudiModaleConferma);
  document.getElementById('btn-annulla-conferma').addEventListener('click', chiudiModaleConferma);

  // --- Color picker sync ---
  document.getElementById('stato-colore').addEventListener('input', function () {
    document.getElementById('stato-colore-hex').textContent = this.value.toUpperCase();
  });

  // Chiudi modali cliccando sull'overlay
  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    });
  });
}

// ============================================================
// UTILITY: SHA-256 hash
// ============================================================

async function hashPassword(password) {
  var encoder = new TextEncoder();
  var data = encoder.encode(password);
  var hashBuffer = await crypto.subtle.digest('SHA-256', data);
  var hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// ============================================================
// UTILITY: Toast
// ============================================================

function mostraToast(messaggio, tipo) {
  tipo = tipo || 'success';
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + tipo;

  var icona = '';
  if (tipo === 'success') {
    icona = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  } else if (tipo === 'error') {
    icona = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else {
    icona = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  toast.innerHTML = icona + '<span>' + messaggio + '</span>';
  container.appendChild(toast);

  // Animazione entrata
  setTimeout(function () { toast.classList.add('show'); }, 10);

  // Rimuovi dopo 3.5 secondi
  setTimeout(function () {
    toast.classList.remove('show');
    setTimeout(function () { toast.remove(); }, 300);
  }, 3500);
}

// ============================================================
// UTILITY: Badge ruolo
// ============================================================

function getBadgeRuolo(ruolo) {
  var classi = {
    admin: 'badge-admin',
    consulente: 'badge-consulente',
    backoffice: 'badge-bo'
  };
  var nomi = {
    admin: 'Admin',
    consulente: 'Consulente',
    backoffice: 'Back Office'
  };
  return '<span class="badge ' + (classi[ruolo] || '') + '">' + (nomi[ruolo] || ruolo) + '</span>';
}

// ============================================================
// UTILITY: Badge fonte campagna
// ============================================================

function getBadgeFonte(fonte) {
  var classi = {
    meta: 'badge-fonte-meta',
    google: 'badge-fonte-google',
    tiktok: 'badge-fonte-tiktok',
    landing: 'badge-fonte-landing',
    manuale: 'badge-fonte-manuale'
  };
  var nomi = {
    meta: 'Meta',
    google: 'Google',
    tiktok: 'TikTok',
    landing: 'Landing',
    manuale: 'Manuale'
  };
  return '<span class="badge ' + (classi[fonte] || '') + '">' + (nomi[fonte] || fonte) + '</span>';
}

// ============================================================
// TAB 1: GESTIONE UTENTI
// ============================================================

async function caricaUtenti() {
  try {
    var snapshot = await db.collection('utenti').orderBy('cognome').get();
    utenti = [];
    snapshot.forEach(function (doc) {
      utenti.push(Object.assign({ id: doc.id }, doc.data()));
    });
    renderUtenti();
  } catch (errore) {
    console.error('Errore caricamento utenti:', errore);
    mostraToast('Errore nel caricamento degli utenti', 'error');
  }
}

function renderUtenti() {
  var tbody = document.getElementById('tbody-utenti');
  var emptyState = document.getElementById('empty-utenti');

  if (utenti.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  var html = '';

  utenti.forEach(function (u) {
    html += '<tr class="fade-in">';
    html += '<td>' + escapeHtml(u.nome || '') + '</td>';
    html += '<td>' + escapeHtml(u.cognome || '') + '</td>';
    html += '<td><code>' + escapeHtml(u.username || '') + '</code></td>';
    html += '<td>' + escapeHtml(u.email || '') + '</td>';
    html += '<td>' + getBadgeRuolo(u.ruolo) + '</td>';
    html += '<td>' + (u.attivo !== false
      ? '<span class="badge badge-attivo">Attivo</span>'
      : '<span class="badge badge-disattivo">Disattivato</span>') + '</td>';
    html += '<td class="azioni-cell">';
    html += '<button class="btn-icon" title="Modifica" onclick="apriModaleModificaUtente(\'' + u.id + '\')">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    html += '</button>';
    html += '<button class="btn-icon" title="Reset Password" onclick="apriModaleResetPassword(\'' + u.id + '\')">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
    html += '</button>';
    html += '<button class="btn-icon ' + (u.attivo !== false ? 'btn-icon-danger' : 'btn-icon-success') + '" title="' + (u.attivo !== false ? 'Disattiva' : 'Attiva') + '" onclick="toggleAttivoUtente(\'' + u.id + '\')">';
    if (u.attivo !== false) {
      html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>';
    } else {
      html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    }
    html += '</button>';
    html += '</td>';
    html += '</tr>';
  });

  tbody.innerHTML = html;
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// --- Modale Nuovo Utente ---
function apriModaleNuovoUtente() {
  document.getElementById('modale-utente-titolo').textContent = 'Nuovo Utente';
  document.getElementById('btn-conferma-utente').textContent = 'Crea Utente';
  document.getElementById('form-utente').reset();
  document.getElementById('utente-id').value = '';
  document.getElementById('utente-password').setAttribute('required', 'required');
  document.getElementById('label-password').textContent = 'Password *';
  document.getElementById('hint-password').style.display = 'none';
  document.getElementById('utente-username').removeAttribute('readonly');
  document.getElementById('modale-utente').style.display = 'flex';
}

// --- Modale Modifica Utente ---
function apriModaleModificaUtente(utenteId) {
  var u = utenti.find(function (ut) { return ut.id === utenteId; });
  if (!u) return;

  document.getElementById('modale-utente-titolo').textContent = 'Modifica Utente';
  document.getElementById('btn-conferma-utente').textContent = 'Salva Modifiche';
  document.getElementById('utente-id').value = u.id;
  document.getElementById('utente-nome').value = u.nome || '';
  document.getElementById('utente-cognome').value = u.cognome || '';
  document.getElementById('utente-email').value = u.email || '';
  document.getElementById('utente-telefono').value = u.telefono || '';
  document.getElementById('utente-username').value = u.username || '';
  document.getElementById('utente-username').setAttribute('readonly', 'readonly');
  document.getElementById('utente-password').value = '';
  document.getElementById('utente-password').removeAttribute('required');
  document.getElementById('label-password').textContent = 'Password';
  document.getElementById('hint-password').style.display = 'block';
  document.getElementById('utente-ruolo').value = u.ruolo || '';
  document.getElementById('modale-utente').style.display = 'flex';
}

function chiudiModaleUtente() {
  document.getElementById('modale-utente').style.display = 'none';
}

// --- Salva utente (crea o modifica) ---
async function salvaUtente() {
  var id = document.getElementById('utente-id').value;
  var nome = document.getElementById('utente-nome').value.trim();
  var cognome = document.getElementById('utente-cognome').value.trim();
  var email = document.getElementById('utente-email').value.trim();
  var telefono = document.getElementById('utente-telefono').value.trim();
  var username = document.getElementById('utente-username').value.trim();
  var password = document.getElementById('utente-password').value;
  var ruolo = document.getElementById('utente-ruolo').value;

  // Validazione
  if (!nome || !cognome || !email || !username || !ruolo) {
    mostraToast('Compila tutti i campi obbligatori', 'error');
    return;
  }

  if (!id && !password) {
    mostraToast('La password è obbligatoria per i nuovi utenti', 'error');
    return;
  }

  if (password && password.length < 6) {
    mostraToast('La password deve avere almeno 6 caratteri', 'error');
    return;
  }

  try {
    if (!id) {
      // --- CREAZIONE ---
      // Verifica username univoco
      var check = await db.collection('utenti').where('username', '==', username).get();
      if (!check.empty) {
        mostraToast('Username già esistente. Scegline un altro.', 'error');
        return;
      }

      var hashedPw = await hashPassword(password);
      await db.collection('utenti').add({
        nome: nome,
        cognome: cognome,
        email: email,
        telefono: telefono,
        username: username,
        password: hashedPw,
        ruolo: ruolo,
        attivo: true,
        dataCreazione: firebase.firestore.FieldValue.serverTimestamp(),
        ultimoAccesso: null
      });

      mostraToast('Utente creato con successo', 'success');
    } else {
      // --- MODIFICA ---
      var datiAggiornati = {
        nome: nome,
        cognome: cognome,
        email: email,
        telefono: telefono,
        ruolo: ruolo
      };

      if (password) {
        datiAggiornati.password = await hashPassword(password);
      }

      await db.collection('utenti').doc(id).update(datiAggiornati);
      mostraToast('Utente aggiornato con successo', 'success');
    }

    chiudiModaleUtente();
    await caricaUtenti();
  } catch (errore) {
    console.error('Errore salvataggio utente:', errore);
    mostraToast('Errore nel salvataggio: ' + errore.message, 'error');
  }
}

// --- Reset Password ---
function apriModaleResetPassword(utenteId) {
  var u = utenti.find(function (ut) { return ut.id === utenteId; });
  if (!u) return;

  document.getElementById('reset-utente-id').value = u.id;
  document.getElementById('reset-password-messaggio').textContent =
    'Sei sicuro di voler resettare la password di ' + u.nome + ' ' + u.cognome + '?';
  document.getElementById('reset-nuova-password').value = '';
  document.getElementById('modale-reset-password').style.display = 'flex';
}

function chiudiModaleReset() {
  document.getElementById('modale-reset-password').style.display = 'none';
}

async function confermaResetPassword() {
  var utenteId = document.getElementById('reset-utente-id').value;
  var nuovaPassword = document.getElementById('reset-nuova-password').value;

  if (!nuovaPassword || nuovaPassword.length < 6) {
    mostraToast('La password deve avere almeno 6 caratteri', 'error');
    return;
  }

  try {
    var hashedPw = await hashPassword(nuovaPassword);
    await db.collection('utenti').doc(utenteId).update({ password: hashedPw });
    mostraToast('Password resettata con successo', 'success');
    chiudiModaleReset();
  } catch (errore) {
    console.error('Errore reset password:', errore);
    mostraToast('Errore nel reset password', 'error');
  }
}

// --- Toggle Attivo/Disattivo ---
async function toggleAttivoUtente(utenteId) {
  var u = utenti.find(function (ut) { return ut.id === utenteId; });
  if (!u) return;

  // Non permettere di disattivare se stessi
  var utenteCorrente = getUtenteCorrente();
  if (utenteCorrente && utenteCorrente.id === utenteId) {
    mostraToast('Non puoi disattivare il tuo stesso account', 'error');
    return;
  }

  try {
    var nuovoStato = u.attivo === false ? true : false;
    await db.collection('utenti').doc(utenteId).update({ attivo: nuovoStato });
    mostraToast(nuovoStato ? 'Utente riattivato' : 'Utente disattivato', 'success');
    await caricaUtenti();
  } catch (errore) {
    console.error('Errore toggle attivo:', errore);
    mostraToast('Errore nell\'aggiornamento', 'error');
  }
}

// ============================================================
// TAB 2: STATI LEAD
// ============================================================

async function caricaStati() {
  try {
    var snapshot = await db.collection('stati').orderBy('posizione').get();
    stati = [];
    snapshot.forEach(function (doc) {
      stati.push(Object.assign({ id: doc.id }, doc.data()));
    });
    renderStati();
  } catch (errore) {
    console.error('Errore caricamento stati:', errore);
    mostraToast('Errore nel caricamento degli stati', 'error');
  }
}

function renderStati() {
  var lista = document.getElementById('lista-stati');
  var emptyState = document.getElementById('empty-stati');

  if (stati.length === 0) {
    lista.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  var html = '';

  stati.forEach(function (s) {
    var faseLabel = {
      contatto: 'Contatto',
      analisi: 'Analisi',
      backoffice: 'Back Office',
      trattativa: 'Trattativa',
      preventivo: 'Preventivo',
      perfezionamento: 'Perfezionamento',
      chiusura: 'Chiusura'
    };

    html += '<div class="stato-item fade-in" data-id="' + s.id + '">';
    html += '<div class="stato-drag-handle">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
    html += '</div>';
    html += '<div class="stato-colore-dot" style="background-color: ' + (s.colore || '#ccc') + ';"></div>';
    html += '<div class="stato-info">';
    html += '<span class="stato-nome">' + escapeHtml(s.nome || s.id) + '</span>';
    html += '<span class="stato-fase">' + (faseLabel[s.fase] || s.fase || '—') + '</span>';
    html += '</div>';
    html += '<div class="stato-attivo">';
    html += '<label class="toggle-label">';
    html += '<input type="checkbox" class="toggle-input" ' + (s.attivo !== false ? 'checked' : '') + ' onchange="toggleAttivoStato(\'' + s.id + '\', this.checked)">';
    html += '<span class="toggle-slider"></span>';
    html += '</label>';
    html += '</div>';
    html += '<div class="stato-azioni">';
    html += '<button class="btn-icon" title="Modifica" onclick="apriModaleModificaStato(\'' + s.id + '\')">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    html += '</button>';
    html += '<button class="btn-icon btn-icon-danger" title="Elimina" onclick="apriModaleEliminaStato(\'' + s.id + '\')">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    html += '</button>';
    html += '</div>';
    html += '</div>';
  });

  lista.innerHTML = html;
  inizializzaSortableStati();
}

function inizializzaSortableStati() {
  var el = document.getElementById('lista-stati');
  if (sortableStati) {
    sortableStati.destroy();
  }

  sortableStati = new Sortable(el, {
    handle: '.stato-drag-handle',
    animation: 200,
    ghostClass: 'sortable-ghost',
    onEnd: async function () {
      // Aggiorna le posizioni in Firestore
      var items = el.querySelectorAll('.stato-item');
      var batch = db.batch();

      items.forEach(function (item, index) {
        var statoId = item.getAttribute('data-id');
        var ref = db.collection('stati').doc(statoId);
        batch.update(ref, { posizione: index + 1 });
      });

      try {
        await batch.commit();
        mostraToast('Ordine stati aggiornato', 'success');
      } catch (errore) {
        console.error('Errore aggiornamento ordine:', errore);
        mostraToast('Errore nell\'aggiornamento dell\'ordine', 'error');
      }
    }
  });
}

// --- Modale Nuovo Stato ---
function apriModaleNuovoStato() {
  document.getElementById('modale-stato-titolo').textContent = 'Nuovo Stato';
  document.getElementById('btn-conferma-stato').textContent = 'Crea Stato';
  document.getElementById('form-stato').reset();
  document.getElementById('stato-id-originale').value = '';
  document.getElementById('stato-colore').value = '#3B82F6';
  document.getElementById('stato-colore-hex').textContent = '#3B82F6';
  document.getElementById('modale-stato').style.display = 'flex';
}

// --- Modale Modifica Stato ---
function apriModaleModificaStato(statoId) {
  var s = stati.find(function (st) { return st.id === statoId; });
  if (!s) return;

  document.getElementById('modale-stato-titolo').textContent = 'Modifica Stato';
  document.getElementById('btn-conferma-stato').textContent = 'Salva Modifiche';
  document.getElementById('stato-id-originale').value = s.id;
  document.getElementById('stato-nome').value = s.nome || '';
  document.getElementById('stato-colore').value = s.colore || '#3B82F6';
  document.getElementById('stato-colore-hex').textContent = (s.colore || '#3B82F6').toUpperCase();
  document.getElementById('stato-fase').value = s.fase || '';
  document.getElementById('modale-stato').style.display = 'flex';
}

function chiudiModaleStato() {
  document.getElementById('modale-stato').style.display = 'none';
}

// --- Salva stato ---
async function salvaStato() {
  var idOriginale = document.getElementById('stato-id-originale').value;
  var nome = document.getElementById('stato-nome').value.trim();
  var colore = document.getElementById('stato-colore').value;
  var fase = document.getElementById('stato-fase').value;

  if (!nome || !fase) {
    mostraToast('Compila tutti i campi obbligatori', 'error');
    return;
  }

  // Genera ID dallo slug del nome
  var nuovoId = nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  try {
    if (!idOriginale) {
      // --- CREAZIONE ---
      var check = await db.collection('stati').doc(nuovoId).get();
      if (check.exists) {
        mostraToast('Esiste già uno stato con questo nome', 'error');
        return;
      }

      // Calcola posizione (ultimo + 1)
      var ultimaPosizione = stati.length > 0 ? Math.max.apply(null, stati.map(function (s) { return s.posizione || 0; })) : 0;

      await db.collection('stati').doc(nuovoId).set({
        nome: nome,
        fase: fase,
        colore: colore,
        posizione: ultimaPosizione + 1,
        attivo: true,
        transizioniConsentite: []
      });

      mostraToast('Stato creato con successo', 'success');
    } else {
      // --- MODIFICA ---
      await db.collection('stati').doc(idOriginale).update({
        nome: nome,
        colore: colore,
        fase: fase
      });

      mostraToast('Stato aggiornato con successo', 'success');
    }

    chiudiModaleStato();
    await caricaStati();
  } catch (errore) {
    console.error('Errore salvataggio stato:', errore);
    mostraToast('Errore nel salvataggio: ' + errore.message, 'error');
  }
}

// --- Toggle Attivo Stato ---
async function toggleAttivoStato(statoId, attivo) {
  try {
    await db.collection('stati').doc(statoId).update({ attivo: attivo });
    mostraToast(attivo ? 'Stato attivato' : 'Stato disattivato', 'success');
  } catch (errore) {
    console.error('Errore toggle stato:', errore);
    mostraToast('Errore nell\'aggiornamento', 'error');
  }
}

// --- Elimina Stato ---
function apriModaleEliminaStato(statoId) {
  var s = stati.find(function (st) { return st.id === statoId; });
  if (!s) return;

  document.getElementById('elimina-stato-id').value = s.id;
  document.getElementById('elimina-stato-nome').textContent = s.nome || s.id;
  document.getElementById('modale-elimina-stato').style.display = 'flex';
}

function chiudiModaleEliminaStato() {
  document.getElementById('modale-elimina-stato').style.display = 'none';
}

async function confermaEliminaStato() {
  var statoId = document.getElementById('elimina-stato-id').value;
  if (!statoId) return;

  try {
    // Sposta lead con questo stato a "nuovo"
    var leadSnapshot = await db.collection('lead').where('stato', '==', statoId).get();
    if (!leadSnapshot.empty) {
      var batch = db.batch();
      leadSnapshot.forEach(function (doc) {
        batch.update(doc.ref, { stato: 'nuovo', fase: 'contatto' });
      });
      await batch.commit();
    }

    // Elimina lo stato
    await db.collection('stati').doc(statoId).delete();
    mostraToast('Stato eliminato. I lead sono stati spostati a "Nuovo".', 'success');
    chiudiModaleEliminaStato();
    await caricaStati();
  } catch (errore) {
    console.error('Errore eliminazione stato:', errore);
    mostraToast('Errore nell\'eliminazione', 'error');
  }
}

// ============================================================
// TAB 3: CAMPAGNE
// ============================================================

async function caricaCampagne() {
  try {
    var snapshot = await db.collection('campagne').orderBy('dataCreazione', 'desc').get();
    campagne = [];
    snapshot.forEach(function (doc) {
      campagne.push(Object.assign({ id: doc.id }, doc.data()));
    });

    // Carica consulenti attivi per il riepilogo distribuzione
    var utentiSnap = await db.collection('utenti')
      .where('ruolo', '==', 'consulente')
      .where('attivo', '==', true)
      .get();
    consulentiAttivi = [];
    utentiSnap.forEach(function (doc) {
      consulentiAttivi.push(Object.assign({ id: doc.id }, doc.data()));
    });

    renderCampagne();
  } catch (errore) {
    console.error('Errore caricamento campagne:', errore);
    mostraToast('Errore nel caricamento delle campagne', 'error');
  }
}

function renderCampagne() {
  var container = document.getElementById('lista-campagne');
  var emptyState = document.getElementById('empty-campagne');

  if (campagne.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  var html = '';

  campagne.forEach(function (c) {
    // Genera URL webhook
    var webhookUrl = window.location.origin + '/webhook.html?campagna=' + c.id;

    // Riepilogo distribuzione
    var distribRiepilogo = '';
    if (c.distribuzione) {
      var parti = [];
      Object.keys(c.distribuzione).forEach(function (consId) {
        var cons = consulentiAttivi.find(function (u) { return u.id === consId; });
        var nomeCorto = cons ? cons.nome : consId.substring(0, 8);
        parti.push(nomeCorto + ' ' + c.distribuzione[consId] + '%');
      });
      distribRiepilogo = parti.join(', ') || 'Non configurata';
    } else {
      distribRiepilogo = 'Non configurata';
    }

    html += '<div class="card campagna-card fade-in">';
    html += '<div class="campagna-header">';
    html += '<div>';
    html += '<h3 class="campagna-nome">' + escapeHtml(c.nome || '') + '</h3>';
    html += '<div class="campagna-meta">';
    html += getBadgeFonte(c.fonte);
    html += (c.attiva !== false
      ? '<span class="badge badge-attivo">Attiva</span>'
      : '<span class="badge badge-disattivo">Disattivata</span>');
    html += '</div>';
    html += '</div>';
    html += '<div class="campagna-azioni-top">';
    html += '<button class="btn-icon" title="Modifica" onclick="apriModaleModificaCampagna(\'' + c.id + '\')">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    html += '</button>';
    html += '<button class="btn-icon ' + (c.attiva !== false ? 'btn-icon-danger' : 'btn-icon-success') + '" title="' + (c.attiva !== false ? 'Disattiva' : 'Attiva') + '" onclick="toggleAttivaCampagna(\'' + c.id + '\')">';
    if (c.attiva !== false) {
      html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>';
    } else {
      html += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    }
    html += '</button>';
    html += '</div>';
    html += '</div>';

    // Webhook URL
    html += '<div class="campagna-webhook">';
    html += '<label class="form-label" style="margin-bottom: 4px;">URL Webhook</label>';
    html += '<div class="webhook-url-row">';
    html += '<input type="text" class="form-input webhook-url-input" value="' + escapeHtml(webhookUrl) + '" readonly id="webhook-url-' + c.id + '">';
    html += '<button class="btn btn-secondary btn-sm" onclick="copiaWebhook(\'' + c.id + '\')" title="Copia URL">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    html += ' Copia';
    html += '</button>';
    html += '</div>';
    html += '</div>';

    // Distribuzione riepilogo
    html += '<div class="campagna-distribuzione">';
    html += '<label class="form-label" style="margin-bottom: 4px;">Distribuzione Lead</label>';
    html += '<p class="text-muted" style="font-size: var(--text-sm);">' + escapeHtml(distribRiepilogo) + '</p>';
    html += '</div>';

    // Bottone configura distribuzione
    html += '<div class="campagna-footer">';
    html += '<button class="btn btn-secondary" onclick="vaiAssegnazione(\'' + c.id + '\')">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    html += ' Configura Distribuzione';
    html += '</button>';
    html += '</div>';

    html += '</div>';
  });

  container.innerHTML = html;
}

function copiaWebhook(campagnaId) {
  var input = document.getElementById('webhook-url-' + campagnaId);
  if (input) {
    input.select();
    document.execCommand('copy');
    mostraToast('URL copiato negli appunti', 'success');
  }
}

function vaiAssegnazione(campagnaId) {
  // Passa al tab Assegnazione e preseleziona la campagna
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function (tc) { tc.classList.remove('active'); });

  document.querySelector('.tab-btn[data-tab="assegnazione"]').classList.add('active');
  document.getElementById('tab-assegnazione').classList.add('active');

  // Carica dati e preseleziona
  caricaAssegnazione().then(function () {
    document.getElementById('select-campagna-assegnazione').value = campagnaId;
    onCampagnaAssegnazioneChange();
  });
}

// --- Modale Nuova Campagna ---
function apriModaleNuovaCampagna() {
  document.getElementById('modale-campagna-titolo').textContent = 'Nuova Campagna';
  document.getElementById('btn-conferma-campagna').textContent = 'Crea Campagna';
  document.getElementById('form-campagna').reset();
  document.getElementById('campagna-id').value = '';
  document.getElementById('modale-campagna').style.display = 'flex';
}

// --- Modale Modifica Campagna ---
function apriModaleModificaCampagna(campagnaId) {
  var c = campagne.find(function (ca) { return ca.id === campagnaId; });
  if (!c) return;

  document.getElementById('modale-campagna-titolo').textContent = 'Modifica Campagna';
  document.getElementById('btn-conferma-campagna').textContent = 'Salva Modifiche';
  document.getElementById('campagna-id').value = c.id;
  document.getElementById('campagna-nome').value = c.nome || '';
  document.getElementById('campagna-fonte').value = c.fonte || '';
  document.getElementById('modale-campagna').style.display = 'flex';
}

function chiudiModaleCampagna() {
  document.getElementById('modale-campagna').style.display = 'none';
}

// --- Salva campagna ---
async function salvaCampagna() {
  var id = document.getElementById('campagna-id').value;
  var nome = document.getElementById('campagna-nome').value.trim();
  var fonte = document.getElementById('campagna-fonte').value;

  if (!nome || !fonte) {
    mostraToast('Compila tutti i campi obbligatori', 'error');
    return;
  }

  try {
    if (!id) {
      // --- CREAZIONE ---
      // Inizializza distribuzione e contatori vuoti
      var distribuzione = {};
      var contatori = {};

      consulentiAttivi.forEach(function (cons) {
        distribuzione[cons.id] = 0;
        contatori[cons.id] = 0;
      });

      await db.collection('campagne').add({
        nome: nome,
        fonte: fonte,
        attiva: true,
        distribuzione: distribuzione,
        contatori: contatori,
        dataCreazione: firebase.firestore.FieldValue.serverTimestamp()
      });

      mostraToast('Campagna creata con successo', 'success');
    } else {
      // --- MODIFICA ---
      await db.collection('campagne').doc(id).update({
        nome: nome,
        fonte: fonte
      });

      mostraToast('Campagna aggiornata con successo', 'success');
    }

    chiudiModaleCampagna();
    await caricaCampagne();
  } catch (errore) {
    console.error('Errore salvataggio campagna:', errore);
    mostraToast('Errore nel salvataggio: ' + errore.message, 'error');
  }
}

// --- Toggle Attiva/Disattiva Campagna ---
async function toggleAttivaCampagna(campagnaId) {
  var c = campagne.find(function (ca) { return ca.id === campagnaId; });
  if (!c) return;

  try {
    var nuovoStato = c.attiva === false ? true : false;
    await db.collection('campagne').doc(campagnaId).update({ attiva: nuovoStato });
    mostraToast(nuovoStato ? 'Campagna riattivata' : 'Campagna disattivata', 'success');
    await caricaCampagne();
  } catch (errore) {
    console.error('Errore toggle campagna:', errore);
    mostraToast('Errore nell\'aggiornamento', 'error');
  }
}

// ============================================================
// TAB 4: ASSEGNAZIONE LEAD
// ============================================================

async function caricaAssegnazione() {
  try {
    // Carica campagne
    var snapCamp = await db.collection('campagne').get();
    campagne = [];
    snapCamp.forEach(function (doc) {
      campagne.push(Object.assign({ id: doc.id }, doc.data()));
    });

    // Carica consulenti attivi
    var snapCons = await db.collection('utenti')
      .where('ruolo', '==', 'consulente')
      .where('attivo', '==', true)
      .get();
    consulentiAttivi = [];
    snapCons.forEach(function (doc) {
      consulentiAttivi.push(Object.assign({ id: doc.id }, doc.data()));
    });

    // Popola select campagne
    var select = document.getElementById('select-campagna-assegnazione');
    var valoreCorrente = select.value;
    select.innerHTML = '<option value="">— Scegli una campagna —</option>';
    campagne.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome + (c.attiva === false ? ' (disattivata)' : '');
      select.appendChild(opt);
    });

    // Ripristina selezione se c'era
    if (valoreCorrente) {
      select.value = valoreCorrente;
      onCampagnaAssegnazioneChange();
    }
  } catch (errore) {
    console.error('Errore caricamento assegnazione:', errore);
    mostraToast('Errore nel caricamento', 'error');
  }
}

function onCampagnaAssegnazioneChange() {
  var campagnaId = document.getElementById('select-campagna-assegnazione').value;
  var container = document.getElementById('assegnazione-container');
  var emptyState = document.getElementById('empty-assegnazione');

  if (!campagnaId) {
    container.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  container.style.display = 'block';
  emptyState.style.display = 'none';

  var campagna = campagne.find(function (c) { return c.id === campagnaId; });
  if (!campagna) return;

  renderConsulentiAssegnazione(campagna);
}

function renderConsulentiAssegnazione(campagna) {
  var container = document.getElementById('lista-consulenti-assegnazione');
  var html = '';

  consulentiAttivi.forEach(function (cons) {
    var percentuale = (campagna.distribuzione && campagna.distribuzione[cons.id]) || 0;
    var iniziali = (cons.nome ? cons.nome.charAt(0) : '') + (cons.cognome ? cons.cognome.charAt(0) : '');

    html += '<div class="card assegnazione-card fade-in" data-consulente-id="' + cons.id + '">';
    html += '<div class="assegnazione-header">';
    html += '<div class="assegnazione-avatar">' + iniziali.toUpperCase() + '</div>';
    html += '<div class="assegnazione-info">';
    html += '<span class="assegnazione-nome">' + escapeHtml(cons.nome + ' ' + cons.cognome) + '</span>';
    html += '<span class="assegnazione-email">' + escapeHtml(cons.email || '') + '</span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="assegnazione-slider-row">';
    html += '<input type="range" class="assegnazione-slider" min="0" max="100" value="' + percentuale + '" data-consulente-id="' + cons.id + '" oninput="onSliderChange(this)">';
    html += '<div class="assegnazione-input-wrap">';
    html += '<input type="number" class="form-input assegnazione-input" min="0" max="100" value="' + percentuale + '" data-consulente-id="' + cons.id + '" oninput="onInputChange(this)">';
    html += '<span class="assegnazione-percent">%</span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="assegnazione-escludi">';
    html += '<label class="toggle-label-inline">';
    html += '<input type="checkbox" class="escludi-checkbox" data-consulente-id="' + cons.id + '" onchange="onEscludiChange()">';
    html += '<span>Escludi temporaneamente (es. ferie)</span>';
    html += '</label>';
    html += '</div>';

    html += '</div>';
  });

  container.innerHTML = html;
  aggiornaDistribuzioneTotale();
}

function onSliderChange(slider) {
  var consId = slider.getAttribute('data-consulente-id');
  var input = document.querySelector('.assegnazione-input[data-consulente-id="' + consId + '"]');
  if (input) input.value = slider.value;
  aggiornaDistribuzioneTotale();
}

function onInputChange(input) {
  var val = parseInt(input.value) || 0;
  if (val < 0) val = 0;
  if (val > 100) val = 100;
  input.value = val;

  var consId = input.getAttribute('data-consulente-id');
  var slider = document.querySelector('.assegnazione-slider[data-consulente-id="' + consId + '"]');
  if (slider) slider.value = val;
  aggiornaDistribuzioneTotale();
}

function onEscludiChange() {
  aggiornaDistribuzioneTotale();
}

function aggiornaDistribuzioneTotale() {
  var totale = 0;
  var messaggioEl = document.getElementById('distribuzione-messaggio');
  var barraEl = document.getElementById('distribuzione-barra');
  var btnSalva = document.getElementById('btn-salva-distribuzione');

  // Calcola totale (solo consulenti non esclusi)
  var inputs = document.querySelectorAll('.assegnazione-input');
  var esclusi = [];

  inputs.forEach(function (input) {
    var consId = input.getAttribute('data-consulente-id');
    var checkbox = document.querySelector('.escludi-checkbox[data-consulente-id="' + consId + '"]');
    if (checkbox && checkbox.checked) {
      esclusi.push(consId);
      return;
    }
    totale += parseInt(input.value) || 0;
  });

  // Aggiorna barra
  var percentualeBarra = Math.min(totale, 100);
  barraEl.style.width = percentualeBarra + '%';

  if (totale === 100) {
    barraEl.classList.remove('barra-errore');
    barraEl.classList.add('barra-ok');
    messaggioEl.innerHTML = '✓ Distribuzione corretta (100%)';
    messaggioEl.className = 'distribuzione-messaggio messaggio-ok';
    btnSalva.disabled = false;
  } else {
    barraEl.classList.remove('barra-ok');
    barraEl.classList.add('barra-errore');
    messaggioEl.innerHTML = 'Il totale deve essere 100% (attualmente: ' + totale + '%)';
    messaggioEl.className = 'distribuzione-messaggio messaggio-errore';
    btnSalva.disabled = true;
  }

  // Nota per consulenti esclusi
  if (esclusi.length > 0) {
    var nomiEsclusi = esclusi.map(function (id) {
      var cons = consulentiAttivi.find(function (c) { return c.id === id; });
      return cons ? cons.nome : id;
    });
    messaggioEl.innerHTML += '<br><span class="text-muted" style="font-size: var(--text-sm);">' +
      nomiEsclusi.join(', ') + (esclusi.length === 1 ? ' è escluso' : ' sono esclusi') +
      '. La quota viene redistribuita automaticamente ai restanti.</span>';
  }
}

async function salvaDistribuzione() {
  var campagnaId = document.getElementById('select-campagna-assegnazione').value;
  if (!campagnaId) return;

  var distribuzione = {};
  var contatori = {};
  var inputs = document.querySelectorAll('.assegnazione-input');

  inputs.forEach(function (input) {
    var consId = input.getAttribute('data-consulente-id');
    var checkbox = document.querySelector('.escludi-checkbox[data-consulente-id="' + consId + '"]');
    var escluso = checkbox && checkbox.checked;
    distribuzione[consId] = escluso ? 0 : (parseInt(input.value) || 0);

    // Mantieni contatori esistenti o inizializza a 0
    var campagna = campagne.find(function (c) { return c.id === campagnaId; });
    contatori[consId] = (campagna && campagna.contatori && campagna.contatori[consId]) || 0;
  });

  try {
    await db.collection('campagne').doc(campagnaId).update({
      distribuzione: distribuzione,
      contatori: contatori
    });

    mostraToast('Distribuzione salvata con successo', 'success');
  } catch (errore) {
    console.error('Errore salvataggio distribuzione:', errore);
    mostraToast('Errore nel salvataggio', 'error');
  }
}

// --- Modale conferma generica ---
function chiudiModaleConferma() {
  document.getElementById('modale-conferma').style.display = 'none';
}

// ============================================================
// FUNZIONI GLOBALI (accessibili da onclick in HTML)
// ============================================================

// Le funzioni usate negli onclick devono essere globali.
// Sono già definite a livello di file, quindi accessibili.

// ============================================================
// UTILITY: getUtenteCorrente e logout (fallback se auth.js non caricato)
// ============================================================

if (typeof getUtenteCorrente !== 'function') {
  function getUtenteCorrente() {
    try {
      var dati = sessionStorage.getItem('utente');
      return dati ? JSON.parse(dati) : null;
    } catch (e) {
      return null;
    }
  }
}

if (typeof logout !== 'function') {
  function logout() {
    sessionStorage.removeItem('utente');
    window.location.href = 'index.html';
  }
}
