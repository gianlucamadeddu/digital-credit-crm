// ============================================
// kanban.js — Logica Kanban Board Lead
// Digital Credit CRM
// ============================================

// Riferimenti globali
let utenteCorrente = null;
let statiList = [];       // Array stati ordinati
let leadList = [];        // Array lead correnti
let consulentiList = [];  // Array consulenti (per filtro e assegnazione)
let sortableInstances = []; // Istanze SortableJS

// ============================================
// INIZIALIZZAZIONE
// ============================================

document.addEventListener('DOMContentLoaded', async function () {
  // Verifica autenticazione
  utenteCorrente = getUtenteCorrente();
  if (!utenteCorrente) {
    window.location.href = 'index.html';
    return;
  }

  // Aggiorna info utente nella sidebar
  aggiornaInfoUtente();

  // Nascondi menu impostazioni se non admin
  if (utenteCorrente.ruolo !== 'admin') {
    const menuImp = document.getElementById('menu-impostazioni');
    if (menuImp) menuImp.style.display = 'none';
  }

  // Mostra filtro consulente solo per admin e backoffice
  if (utenteCorrente.ruolo === 'admin' || utenteCorrente.ruolo === 'backoffice') {
    document.getElementById('filtro-consulente-wrapper').style.display = 'block';
    await caricaConsulenti();
  }

  // Mostra campo assegnazione consulente nel form solo per admin
  if (utenteCorrente.ruolo === 'admin') {
    document.getElementById('assegna-consulente-wrapper').style.display = 'block';
  }

  // Carica stati e lead
  await caricaStati();
  await caricaEFiltraLead();

  // Event listeners
  inizializzaEventListeners();
});

// ============================================
// INFO UTENTE SIDEBAR
// ============================================

function aggiornaInfoUtente() {
  const nomeEl = document.getElementById('user-nome');
  const ruoloEl = document.getElementById('user-ruolo');
  const avatarEl = document.getElementById('user-avatar');

  if (nomeEl) nomeEl.textContent = utenteCorrente.nome + ' ' + utenteCorrente.cognome;
  if (ruoloEl) {
    const ruoliLabel = { admin: 'Amministratore', consulente: 'Consulente', backoffice: 'Back Office' };
    ruoloEl.textContent = ruoliLabel[utenteCorrente.ruolo] || utenteCorrente.ruolo;
  }
  if (avatarEl) {
    avatarEl.textContent = (utenteCorrente.nome || 'U').charAt(0).toUpperCase();
  }
}

// ============================================
// CARICA STATI DA FIRESTORE
// ============================================

async function caricaStati() {
  try {
    const snapshot = await db.collection('stati')
      .where('attivo', '==', true)
      .orderBy('posizione', 'asc')
      .get();

    statiList = [];
    snapshot.forEach(doc => {
      statiList.push({ id: doc.id, ...doc.data() });
    });

    if (statiList.length === 0) {
      mostraToast('Nessuno stato trovato. Crea gli stati nel database.', 'error');
    }
  } catch (error) {
    console.log('Errore caricamento stati:', error);
    mostraToast('Errore nel caricamento degli stati', 'error');
  }
}

// ============================================
// CARICA CONSULENTI (per filtro e assegnazione)
// ============================================

async function caricaConsulenti() {
  try {
    const snapshot = await db.collection('utenti')
      .where('ruolo', '==', 'consulente')
      .where('attivo', '==', true)
      .get();

    consulentiList = [];
    snapshot.forEach(doc => {
      consulentiList.push({ id: doc.id, ...doc.data() });
    });

    // Popola select filtro consulente
    const selectFiltro = document.getElementById('filtro-consulente');
    consulentiList.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome + ' ' + c.cognome;
      selectFiltro.appendChild(opt);
    });

    // Popola select assegnazione nel form nuovo lead
    const selectAssegna = document.getElementById('nuovo-consulente');
    consulentiList.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome + ' ' + c.cognome;
      selectAssegna.appendChild(opt);
    });

  } catch (error) {
    console.log('Errore caricamento consulenti:', error);
  }
}

// ============================================
// CARICA E FILTRA LEAD
// ============================================

async function caricaEFiltraLead() {
  try {
    let query = db.collection('lead');

    // Filtro per ruolo
    if (utenteCorrente.ruolo === 'consulente') {
      query = query.where('consulenteId', '==', utenteCorrente.id);
    } else if (utenteCorrente.ruolo === 'backoffice') {
      query = query.where('fase', '==', 'backoffice');
    }

    const snapshot = await query.get();

    leadList = [];
    snapshot.forEach(doc => {
      leadList.push({ id: doc.id, ...doc.data() });
    });

    // Applica filtro periodo lato client
    leadList = applicaFiltroPeriodo(leadList);

    // Applica filtro consulente lato client (solo per admin/bo)
    leadList = applicaFiltroConsulente(leadList);

    // Renderizza la board
    renderizzaKanban();

  } catch (error) {
    console.log('Errore caricamento lead:', error);
    mostraToast('Errore nel caricamento dei lead', 'error');
  }
}

function applicaFiltroPeriodo(leads) {
  const periodo = document.getElementById('filtro-periodo').value;
  if (periodo === 'tutto') return leads;

  const now = new Date();
  let dataInizio;

  if (periodo === 'mese') {
    dataInizio = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (periodo === 'trimestre') {
    dataInizio = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  }

  return leads.filter(lead => {
    if (!lead.dataCreazione) return true;
    const dataLead = lead.dataCreazione.toDate ? lead.dataCreazione.toDate() : new Date(lead.dataCreazione);
    return dataLead >= dataInizio;
  });
}

function applicaFiltroConsulente(leads) {
  const consulenteId = document.getElementById('filtro-consulente')?.value;
  if (!consulenteId || consulenteId === 'tutti') return leads;
  return leads.filter(l => l.consulenteId === consulenteId);
}

// ============================================
// RENDERIZZA KANBAN BOARD
// ============================================

function renderizzaKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';

  // Distruggi istanze SortableJS precedenti
  sortableInstances.forEach(s => s.destroy());
  sortableInstances = [];

  statiList.forEach(stato => {
    // Conta lead in questo stato
    const leadInStato = leadList.filter(l => l.stato === stato.id);

    // Crea colonna
    const colonna = document.createElement('div');
    colonna.className = 'kanban-column';
    colonna.dataset.statoId = stato.id;

    // Header colonna
    const header = document.createElement('div');
    header.className = 'kanban-column-header';
    header.innerHTML = `
      <div class="kanban-column-title">
        <span class="kanban-column-dot" style="background:${stato.colore};"></span>
        <span>${stato.nome}</span>
        <span class="kanban-column-count">(${leadInStato.length})</span>
      </div>
    `;

    // Container card (sortable)
    const cardContainer = document.createElement('div');
    cardContainer.className = 'kanban-cards';
    cardContainer.dataset.statoId = stato.id;

    // Genera le card
    leadInStato.forEach(lead => {
      const card = creaCardLead(lead, stato.colore);
      cardContainer.appendChild(card);
    });

    // Empty state
    if (leadInStato.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty';
      empty.textContent = 'Nessun lead';
      cardContainer.appendChild(empty);
    }

    colonna.appendChild(header);
    colonna.appendChild(cardContainer);
    board.appendChild(colonna);

    // Inizializza SortableJS su questo container
    const sortable = new Sortable(cardContainer, {
      group: 'kanban',
      animation: 200,
      ghostClass: 'kanban-card-ghost',
      chosenClass: 'kanban-card-chosen',
      dragClass: 'kanban-card-drag',
      filter: '.kanban-empty',  // Non trascinare l'empty state
      onEnd: function (evt) {
        gestisciDrop(evt);
      }
    });

    sortableInstances.push(sortable);
  });
}

// ============================================
// CREA CARD LEAD
// ============================================

function creaCardLead(lead, coloreStato) {
  const card = document.createElement('div');
  card.className = 'kanban-card';
  card.dataset.leadId = lead.id;
  card.style.borderLeftColor = coloreStato;

  // Formatta data
  const dataCreazione = lead.dataCreazione
    ? formattaDataBreve(lead.dataCreazione.toDate ? lead.dataCreazione.toDate() : new Date(lead.dataCreazione))
    : '';

  // Auto richiesta
  const autoHtml = lead.autoRichiesta
    ? `<div class="kanban-card-auto">
         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2"/><path d="M10 17H14"/></svg>
         ${lead.autoRichiesta}
       </div>`
    : '';

  // Badge priorità alta
  const prioritaHtml = lead.priorita === 'alta'
    ? '<span class="badge badge-priority-high">Alta</span>'
    : '';

  card.innerHTML = `
    <div class="kanban-card-top">
      <span class="kanban-card-name">${lead.nome || ''} ${lead.cognome || ''}</span>
      ${prioritaHtml}
    </div>
    ${autoHtml}
    <div class="kanban-card-bottom">
      <span class="kanban-card-date">${dataCreazione}</span>
    </div>
  `;

  // Clic per aprire dettaglio
  card.addEventListener('click', function () {
    window.location.href = 'lead-dettaglio.html?id=' + lead.id;
  });

  return card;
}

// ============================================
// GESTISCI DROP (DRAG & DROP)
// ============================================

async function gestisciDrop(evt) {
  const cardEl = evt.item;
  const leadId = cardEl.dataset.leadId;
  const nuovoStatoId = evt.to.dataset.statoId;
  const vecchioStatoId = evt.from.dataset.statoId;

  // Se non è cambiato stato, non fare nulla
  if (nuovoStatoId === vecchioStatoId) return;

  // Trova il lead nei dati
  const lead = leadList.find(l => l.id === leadId);
  if (!lead) return;

  // Trova la fase del nuovo stato
  const nuovoStato = statiList.find(s => s.id === nuovoStatoId);
  const nuovaFase = nuovoStato ? nuovoStato.fase : lead.fase;

  try {
    // 1. Aggiorna lead in Firestore
    await db.collection('lead').doc(leadId).update({
      stato: nuovoStatoId,
      fase: nuovaFase,
      dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 2. Crea voce timeline
    await db.collection('lead').doc(leadId).collection('timeline').add({
      tipo: 'cambio_stato',
      statoOld: vecchioStatoId,
      statoNew: nuovoStatoId,
      autoreId: utenteCorrente.id,
      autoreNome: utenteCorrente.nome + ' ' + utenteCorrente.cognome,
      nota: '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 3. Aggiorna dati locali
    lead.stato = nuovoStatoId;
    lead.fase = nuovaFase;

    // 4. Aggiorna conteggi colonne
    aggiornaConteggiColonne();

    // 5. Rimuovi empty state dalla colonna di destinazione se presente
    const emptyEl = evt.to.querySelector('.kanban-empty');
    if (emptyEl) emptyEl.remove();

    // 6. Aggiungi empty state alla colonna di origine se vuota
    const cardsOrigine = evt.from.querySelectorAll('.kanban-card');
    if (cardsOrigine.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty';
      empty.textContent = 'Nessun lead';
      evt.from.appendChild(empty);
    }

    // 7. Notifica toast
    const nomeStatoNuovo = nuovoStato ? nuovoStato.nome : nuovoStatoId;
    mostraToast(`Stato aggiornato a "${nomeStatoNuovo}"`, 'success');

  } catch (error) {
    console.log('Errore aggiornamento stato:', error);
    mostraToast('Errore nell\'aggiornamento dello stato', 'error');
    // Ricarica la board per tornare allo stato corretto
    await caricaEFiltraLead();
  }
}

// ============================================
// AGGIORNA CONTEGGI COLONNE
// ============================================

function aggiornaConteggiColonne() {
  document.querySelectorAll('.kanban-column').forEach(col => {
    const statoId = col.dataset.statoId;
    const count = col.querySelectorAll('.kanban-card').length;
    const countEl = col.querySelector('.kanban-column-count');
    if (countEl) countEl.textContent = `(${count})`;
  });
}

// ============================================
// MODALE NUOVO LEAD
// ============================================

function apriModaleNuovoLead() {
  document.getElementById('modal-nuovo-lead').style.display = 'flex';
  document.getElementById('nuovo-nome').focus();
}

function chiudiModaleNuovoLead() {
  document.getElementById('modal-nuovo-lead').style.display = 'none';
  // Reset form
  document.getElementById('form-nuovo-lead').reset();
}

async function salvaLead() {
  const nome = document.getElementById('nuovo-nome').value.trim();
  const cognome = document.getElementById('nuovo-cognome').value.trim();
  const telefono = document.getElementById('nuovo-telefono').value.trim();
  const email = document.getElementById('nuovo-email').value.trim();
  const autoRichiesta = document.getElementById('nuovo-auto').value.trim();
  const priorita = document.getElementById('nuovo-priorita').value;

  // Validazione
  if (!nome || !cognome || !telefono) {
    mostraToast('Compila i campi obbligatori: Nome, Cognome, Telefono', 'error');
    return;
  }

  // Determina consulente
  let consulenteId = '';
  if (utenteCorrente.ruolo === 'admin') {
    consulenteId = document.getElementById('nuovo-consulente').value || '';
  } else if (utenteCorrente.ruolo === 'consulente') {
    consulenteId = utenteCorrente.id;
  }

  // Disabilita bottone
  const btnSalva = document.getElementById('btn-salva-lead');
  btnSalva.disabled = true;
  btnSalva.textContent = 'Salvataggio...';

  try {
    const nuovoLead = {
      nome: nome,
      cognome: cognome,
      telefono: telefono,
      email: email,
      provincia: '',
      fonte: 'manuale',
      campagna: '',
      consulenteId: consulenteId,
      stato: 'nuovo',
      fase: 'contatto',
      priorita: priorita,
      tipoCliente: 'privato',
      autoRichiesta: autoRichiesta,
      budgetMensile: '',
      durataDesiderata: null,
      kmAnnui: null,
      tempiDesiderati: '',
      noteEsigenza: '',
      tags: [],
      dataCreazione: firebase.firestore.FieldValue.serverTimestamp(),
      dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp(),
      dataChiusura: null
    };

    const docRef = await db.collection('lead').add(nuovoLead);

    // Crea voce timeline
    await db.collection('lead').doc(docRef.id).collection('timeline').add({
      tipo: 'cambio_stato',
      statoOld: '',
      statoNew: 'nuovo',
      autoreId: utenteCorrente.id,
      autoreNome: utenteCorrente.nome + ' ' + utenteCorrente.cognome,
      nota: 'Lead creato manualmente',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    mostraToast('Lead creato con successo!', 'success');
    chiudiModaleNuovoLead();

    // Ricarica board
    await caricaEFiltraLead();

  } catch (error) {
    console.log('Errore creazione lead:', error);
    mostraToast('Errore nella creazione del lead', 'error');
  } finally {
    btnSalva.disabled = false;
    btnSalva.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Salva Lead
    `;
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

function inizializzaEventListeners() {
  // Bottone nuovo lead
  document.getElementById('btn-nuovo-lead').addEventListener('click', apriModaleNuovoLead);

  // Chiudi modale
  document.getElementById('btn-chiudi-modale').addEventListener('click', chiudiModaleNuovoLead);
  document.getElementById('btn-annulla-lead').addEventListener('click', chiudiModaleNuovoLead);

  // Salva lead
  document.getElementById('btn-salva-lead').addEventListener('click', salvaLead);

  // Chiudi modale cliccando fuori
  document.getElementById('modal-nuovo-lead').addEventListener('click', function (e) {
    if (e.target === this) chiudiModaleNuovoLead();
  });

  // Invio nel form
  document.getElementById('form-nuovo-lead').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      salvaLead();
    }
  });

  // Filtro periodo
  document.getElementById('filtro-periodo').addEventListener('change', function () {
    caricaEFiltraLead();
  });

  // Filtro consulente
  const filtroConsulente = document.getElementById('filtro-consulente');
  if (filtroConsulente) {
    filtroConsulente.addEventListener('change', function () {
      caricaEFiltraLead();
    });
  }

  // Logout
  document.getElementById('btn-logout').addEventListener('click', function (e) {
    e.preventDefault();
    logout();
  });
}

// ============================================
// UTILITY: Formattazione data breve
// ============================================

function formattaDataBreve(data) {
  if (!data) return '';
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const d = new Date(data);
  return d.getDate() + ' ' + mesi[d.getMonth()];
}

// ============================================
// TOAST NOTIFICHE
// ============================================

function mostraToast(messaggio, tipo = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + tipo;

  // Icona in base al tipo
  let icona = '';
  if (tipo === 'success') {
    icona = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  } else if (tipo === 'error') {
    icona = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else {
    icona = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  toast.innerHTML = `
    <span class="toast-icon">${icona}</span>
    <span class="toast-message">${messaggio}</span>
  `;

  container.appendChild(toast);

  // Animazione entrata
  setTimeout(() => toast.classList.add('toast-visible'), 10);

  // Rimuovi dopo 3 secondi
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

