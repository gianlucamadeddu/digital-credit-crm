// ============================================
// kanban.js — Logica Kanban Board Lead
// Digital Credit CRM
// ============================================

// Riferimenti globali
var utenteCorrente = null;
var statiList = [];       // Array stati ordinati
var leadList = [];        // Array lead correnti
var consulentiList = [];  // Array consulenti (per filtro e assegnazione)
var sortableInstances = []; // Istanze SortableJS

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
    var menuImp = document.getElementById('menu-impostazioni');
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
  var nomeEl = document.getElementById('user-nome');
  var ruoloEl = document.getElementById('user-ruolo');
  var avatarEl = document.getElementById('user-avatar');

  if (nomeEl) nomeEl.textContent = utenteCorrente.nome + ' ' + utenteCorrente.cognome;
  if (ruoloEl) {
    var ruoliLabel = { admin: 'Amministratore', consulente: 'Consulente', backoffice: 'Back Office' };
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
    var snapshot = await db.collection('stati')
      .where('attivo', '==', true)
      .orderBy('posizione', 'asc')
      .get();

    statiList = [];
    snapshot.forEach(function(doc) {
      statiList.push({ id: doc.id, nome: doc.data().nome, fase: doc.data().fase, colore: doc.data().colore, posizione: doc.data().posizione, attivo: doc.data().attivo, transizioniConsentite: doc.data().transizioniConsentite });
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
    var snapshot = await db.collection('utenti')
      .where('ruolo', '==', 'consulente')
      .where('attivo', '==', true)
      .get();

    consulentiList = [];
    snapshot.forEach(function(doc) {
      consulentiList.push({ id: doc.id, nome: doc.data().nome, cognome: doc.data().cognome });
    });

    // Popola select filtro consulente
    var selectFiltro = document.getElementById('filtro-consulente');
    consulentiList.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome + ' ' + c.cognome;
      selectFiltro.appendChild(opt);
    });

    // Popola select assegnazione nel form nuovo lead
    var selectAssegna = document.getElementById('nuovo-consulente');
    consulentiList.forEach(function(c) {
      var opt = document.createElement('option');
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
    var query = db.collection('lead');

    // Filtro per ruolo
    if (utenteCorrente.ruolo === 'consulente') {
      query = query.where('consulenteId', '==', utenteCorrente.id);
    } else if (utenteCorrente.ruolo === 'backoffice') {
      query = query.where('fase', '==', 'backoffice');
    }

    var snapshot = await query.get();

    leadList = [];
    snapshot.forEach(function(doc) {
      var data = doc.data();
      data.id = doc.id;
      leadList.push(data);
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
  var periodo = document.getElementById('filtro-periodo').value;
  if (periodo === 'tutto') return leads;

  var now = new Date();
  var dataInizio;

  if (periodo === 'mese') {
    dataInizio = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (periodo === 'trimestre') {
    dataInizio = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  }

  return leads.filter(function(lead) {
    if (!lead.dataCreazione) return true;
    var dataLead = lead.dataCreazione.toDate ? lead.dataCreazione.toDate() : new Date(lead.dataCreazione);
    return dataLead >= dataInizio;
  });
}

function applicaFiltroConsulente(leads) {
  var selectEl = document.getElementById('filtro-consulente');
  var consulenteId = selectEl ? selectEl.value : null;
  if (!consulenteId || consulenteId === 'tutti') return leads;
  return leads.filter(function(l) { return l.consulenteId === consulenteId; });
}

// ============================================
// RENDERIZZA KANBAN BOARD
// ============================================

function renderizzaKanban() {
  var board = document.getElementById('kanban-board');
  board.innerHTML = '';

  // Distruggi istanze SortableJS precedenti
  sortableInstances.forEach(function(s) { s.destroy(); });
  sortableInstances = [];

  statiList.forEach(function(stato) {
    // Conta lead in questo stato
    var leadInStato = leadList.filter(function(l) { return l.stato === stato.id; });

    // Crea colonna
    var colonna = document.createElement('div');
    colonna.className = 'kanban-column';
    colonna.dataset.statoId = stato.id;

    // Header colonna
    var header = document.createElement('div');
    header.className = 'kanban-column-header';
    header.innerHTML =
      '<div class="kanban-column-title">' +
        '<span class="kanban-column-dot" style="background:' + stato.colore + ';"></span>' +
        '<span>' + stato.nome + '</span>' +
        '<span class="kanban-column-count">(' + leadInStato.length + ')</span>' +
      '</div>';

    // Container card (sortable)
    var cardContainer = document.createElement('div');
    cardContainer.className = 'kanban-cards';
    cardContainer.dataset.statoId = stato.id;

    // Genera le card
    leadInStato.forEach(function(lead) {
      var card = creaCardLead(lead, stato.colore);
      cardContainer.appendChild(card);
    });

    // Empty state
    if (leadInStato.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'kanban-empty';
      empty.textContent = 'Nessun lead';
      cardContainer.appendChild(empty);
    }

    colonna.appendChild(header);
    colonna.appendChild(cardContainer);
    board.appendChild(colonna);

    // Inizializza SortableJS su questo container
    var sortable = new Sortable(cardContainer, {
      group: 'kanban',
      animation: 200,
      ghostClass: 'kanban-card-ghost',
      chosenClass: 'kanban-card-chosen',
      dragClass: 'kanban-card-drag',
      filter: '.kanban-empty',
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
  var card = document.createElement('div');
  card.className = 'kanban-card';
  card.dataset.leadId = lead.id;
  card.style.borderLeftColor = coloreStato;

  // Formatta data
  var dataCreazione = '';
  if (lead.dataCreazione) {
    var d = lead.dataCreazione.toDate ? lead.dataCreazione.toDate() : new Date(lead.dataCreazione);
    dataCreazione = formattaDataBreve(d);
  }

  // Auto richiesta
  var autoHtml = '';
  if (lead.autoRichiesta) {
    autoHtml =
      '<div class="kanban-card-auto">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2"/><path d="M10 17H14"/></svg>' +
        lead.autoRichiesta +
      '</div>';
  }

  // Badge priorità alta
  var prioritaHtml = '';
  if (lead.priorita === 'alta') {
    prioritaHtml = '<span class="badge badge-priority-high">Alta</span>';
  }

  card.innerHTML =
    '<div class="kanban-card-top">' +
      '<span class="kanban-card-name">' + (lead.nome || '') + ' ' + (lead.cognome || '') + '</span>' +
      prioritaHtml +
    '</div>' +
    autoHtml +
    '<div class="kanban-card-bottom">' +
      '<span class="kanban-card-date">' + dataCreazione + '</span>' +
    '</div>';

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
  var cardEl = evt.item;
  var leadId = cardEl.dataset.leadId;
  var nuovoStatoId = evt.to.dataset.statoId;
  var vecchioStatoId = evt.from.dataset.statoId;

  // Se non è cambiato stato, non fare nulla
  if (nuovoStatoId === vecchioStatoId) return;

  // Trova il lead nei dati
  var lead = null;
  for (var i = 0; i < leadList.length; i++) {
    if (leadList[i].id === leadId) { lead = leadList[i]; break; }
  }
  if (!lead) return;

  // Trova la fase del nuovo stato
  var nuovoStato = null;
  for (var j = 0; j < statiList.length; j++) {
    if (statiList[j].id === nuovoStatoId) { nuovoStato = statiList[j]; break; }
  }
  var nuovaFase = nuovoStato ? nuovoStato.fase : lead.fase;

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
    var emptyEl = evt.to.querySelector('.kanban-empty');
    if (emptyEl) emptyEl.remove();

    // 6. Aggiungi empty state alla colonna di origine se vuota
    var cardsOrigine = evt.from.querySelectorAll('.kanban-card');
    if (cardsOrigine.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'kanban-empty';
      empty.textContent = 'Nessun lead';
      evt.from.appendChild(empty);
    }

    // 7. Notifica toast
    var nomeStatoNuovo = nuovoStato ? nuovoStato.nome : nuovoStatoId;
    mostraToast('Stato aggiornato a "' + nomeStatoNuovo + '"', 'success');

  } catch (error) {
    console.log('Errore aggiornamento stato:', error);
    mostraToast("Errore nell'aggiornamento dello stato", 'error');
    // Ricarica la board per tornare allo stato corretto
    await caricaEFiltraLead();
  }
}

// ============================================
// AGGIORNA CONTEGGI COLONNE
// ============================================

function aggiornaConteggiColonne() {
  var colonne = document.querySelectorAll('.kanban-column');
  colonne.forEach(function(col) {
    var count = col.querySelectorAll('.kanban-card').length;
    var countEl = col.querySelector('.kanban-column-count');
    if (countEl) countEl.textContent = '(' + count + ')';
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
  document.getElementById('form-nuovo-lead').reset();
}

async function salvaLead() {
  var nome = document.getElementById('nuovo-nome').value.trim();
  var cognome = document.getElementById('nuovo-cognome').value.trim();
  var telefono = document.getElementById('nuovo-telefono').value.trim();
  var email = document.getElementById('nuovo-email').value.trim();
  var autoRichiesta = document.getElementById('nuovo-auto').value.trim();
  var priorita = document.getElementById('nuovo-priorita').value;

  // Validazione
  if (!nome || !cognome || !telefono) {
    mostraToast('Compila i campi obbligatori: Nome, Cognome, Telefono', 'error');
    return;
  }

  // Determina consulente
  var consulenteId = '';
  if (utenteCorrente.ruolo === 'admin') {
    consulenteId = document.getElementById('nuovo-consulente').value || '';
  } else if (utenteCorrente.ruolo === 'consulente') {
    consulenteId = utenteCorrente.id;
  }

  // Disabilita bottone
  var btnSalva = document.getElementById('btn-salva-lead');
  btnSalva.disabled = true;
  btnSalva.textContent = 'Salvataggio...';

  try {
    var nuovoLead = {
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

    var docRef = await db.collection('lead').add(nuovoLead);

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
    btnSalva.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      ' Salva Lead';
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
  var filtroConsulente = document.getElementById('filtro-consulente');
  if (filtroConsulente) {
    filtroConsulente.addEventListener('change', function () {
      caricaEFiltraLead();
    });
  }

  // Logout
  var btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function (e) {
      e.preventDefault();
      logout();
    });
  }
}

// ============================================
// UTILITY: Formattazione data breve
// ============================================

function formattaDataBreve(data) {
  if (!data) return '';
  var mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var d = new Date(data);
  return d.getDate() + ' ' + mesi[d.getMonth()];
}

// ============================================
// TOAST NOTIFICHE
// ============================================

function mostraToast(messaggio, tipo) {
  tipo = tipo || 'info';
  var container = document.getElementById('toast-container');
  if (!container) return;

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

  toast.innerHTML =
    '<span class="toast-icon">' + icona + '</span>' +
    '<span class="toast-message">' + messaggio + '</span>';

  container.appendChild(toast);

  setTimeout(function() { toast.classList.add('toast-visible'); }, 10);

  setTimeout(function() {
    toast.classList.remove('toast-visible');
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}
