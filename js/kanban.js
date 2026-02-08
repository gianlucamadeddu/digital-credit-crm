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
var modalitaSelezione = false; // Modalità selezione multipla
var leadSelezionati = [];      // ID lead selezionati

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

  // Chiudi menu contestuale cliccando fuori
  document.addEventListener('click', function () {
    chiudiTuttiMenu();
  });
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

    header.style.background = stato.colore + '18';
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
      filter: '.kanban-empty,.kanban-card-menu-btn,.kanban-card-menu,.kanban-card-checkbox',
      preventOnFilter: false,
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

  // Checkbox per selezione multipla (nascosta di default)
  var checkboxHtml =
    '<input type="checkbox" class="kanban-card-checkbox" data-lead-id="' + lead.id + '" ' +
    'style="display:' + (modalitaSelezione ? 'block' : 'none') + ';" ' +
    (leadSelezionati.indexOf(lead.id) >= 0 ? 'checked' : '') + '>';

  // Bottone 3 puntini (menu contestuale)
  var menuBtnHtml =
    '<button class="kanban-card-menu-btn" data-lead-id="' + lead.id + '" title="Azioni">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>' +
    '</button>';

  // Menu dropdown
  var menuHtml =
    '<div class="kanban-card-menu" id="menu-' + lead.id + '">' +
      '<div class="kanban-card-menu-item" data-azione="dettaglio" data-lead-id="' + lead.id + '">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
        ' Apri dettaglio' +
      '</div>' +
      '<div class="kanban-card-menu-item menu-item-danger" data-azione="elimina" data-lead-id="' + lead.id + '">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>' +
        ' Elimina' +
      '</div>' +
    '</div>';

  card.innerHTML =
    checkboxHtml +
    '<div class="kanban-card-top">' +
      '<span class="kanban-card-name">' + (lead.nome || '') + ' ' + (lead.cognome || '') + '</span>' +
      '<div class="kanban-card-top-right">' +
        prioritaHtml +
        menuBtnHtml +
      '</div>' +
    '</div>' +
    autoHtml +
    '<div class="kanban-card-bottom">' +
      '<span class="kanban-card-date">' + dataCreazione + '</span>' +
    '</div>' +
    menuHtml;

  // Event: bottone 3 puntini
  var menuBtn = card.querySelector('.kanban-card-menu-btn');
  menuBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    chiudiTuttiMenu();
    var menu = document.getElementById('menu-' + lead.id);
    if (menu) menu.classList.toggle('menu-visible');
  });

  // Event: voci del menu
  var menuItems = card.querySelectorAll('.kanban-card-menu-item');
  menuItems.forEach(function(item) {
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      var azione = this.dataset.azione;
      var id = this.dataset.leadId;
      chiudiTuttiMenu();

      if (azione === 'dettaglio') {
        window.location.href = 'lead-dettaglio.html?id=' + id;
      } else if (azione === 'elimina') {
        apriModaleConfermaElimina([id]);
      }
    });
  });

  // Event: checkbox
  var checkbox = card.querySelector('.kanban-card-checkbox');
  checkbox.addEventListener('click', function (e) {
    e.stopPropagation();
  });
  checkbox.addEventListener('change', function (e) {
    var id = this.dataset.leadId;
    if (this.checked) {
      if (leadSelezionati.indexOf(id) < 0) leadSelezionati.push(id);
    } else {
      leadSelezionati = leadSelezionati.filter(function(s) { return s !== id; });
    }
    aggiornaBarraSelezione();
  });

  // Clic per aprire dettaglio (solo se non in modalità selezione)
  card.addEventListener('click', function (e) {
    // Non navigare se clicco su menu, checkbox o bottoni
    if (e.target.closest('.kanban-card-menu-btn') || e.target.closest('.kanban-card-menu') || e.target.closest('.kanban-card-checkbox')) return;

    if (modalitaSelezione) {
      // In modalità selezione, clicca per selezionare/deselezionare
      var cb = card.querySelector('.kanban-card-checkbox');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    } else {
      window.location.href = 'lead-dettaglio.html?id=' + lead.id;
    }
  });

  return card;
}

// ============================================
// MENU CONTESTUALE: Chiudi tutti
// ============================================

function chiudiTuttiMenu() {
  var menus = document.querySelectorAll('.kanban-card-menu.menu-visible');
  menus.forEach(function(m) { m.classList.remove('menu-visible'); });
}

// ============================================
// MODALITÀ SELEZIONE MULTIPLA
// ============================================

function attivaModalitaSelezione() {
  modalitaSelezione = true;
  leadSelezionati = [];

  // Mostra tutte le checkbox
  var checkboxes = document.querySelectorAll('.kanban-card-checkbox');
  checkboxes.forEach(function(cb) {
    cb.style.display = 'block';
    cb.checked = false;
  });

  // Mostra barra selezione
  document.getElementById('barra-selezione').style.display = 'flex';

  // Aggiorna testo
  aggiornaBarraSelezione();
}

function disattivaModalitaSelezione() {
  modalitaSelezione = false;
  leadSelezionati = [];

  // Nascondi tutte le checkbox
  var checkboxes = document.querySelectorAll('.kanban-card-checkbox');
  checkboxes.forEach(function(cb) {
    cb.style.display = 'none';
    cb.checked = false;
  });

  // Nascondi barra selezione
  document.getElementById('barra-selezione').style.display = 'none';
}

function selezionaTutti() {
  leadSelezionati = [];
  var checkboxes = document.querySelectorAll('.kanban-card-checkbox');
  checkboxes.forEach(function(cb) {
    cb.checked = true;
    leadSelezionati.push(cb.dataset.leadId);
  });
  aggiornaBarraSelezione();
}

function deselezionaTutti() {
  leadSelezionati = [];
  var checkboxes = document.querySelectorAll('.kanban-card-checkbox');
  checkboxes.forEach(function(cb) {
    cb.checked = false;
  });
  aggiornaBarraSelezione();
}

function aggiornaBarraSelezione() {
  var testo = document.getElementById('selezione-conteggio');
  if (testo) {
    if (leadSelezionati.length === 0) {
      testo.textContent = 'Nessun lead selezionato';
    } else if (leadSelezionati.length === 1) {
      testo.textContent = '1 lead selezionato';
    } else {
      testo.textContent = leadSelezionati.length + ' lead selezionati';
    }
  }

  // Abilita/disabilita bottone elimina
  var btnElimina = document.getElementById('btn-elimina-selezionati');
  if (btnElimina) {
    btnElimina.disabled = leadSelezionati.length === 0;
  }
}

// ============================================
// ELIMINAZIONE LEAD
// ============================================

function apriModaleConfermaElimina(leadIds) {
  var modal = document.getElementById('modal-conferma-elimina');
  var testo = document.getElementById('elimina-testo-conferma');

  if (leadIds.length === 1) {
    // Trova nome del lead
    var lead = null;
    for (var i = 0; i < leadList.length; i++) {
      if (leadList[i].id === leadIds[0]) { lead = leadList[i]; break; }
    }
    var nomeLead = lead ? (lead.nome + ' ' + lead.cognome) : 'questo lead';
    testo.innerHTML = 'Sei sicuro di voler eliminare <strong>' + nomeLead + '</strong>?<br><span style="color:#6B7280;font-size:0.8rem;">Verranno eliminati anche timeline, documenti e richieste BO associati.</span>';
  } else {
    testo.innerHTML = 'Sei sicuro di voler eliminare <strong>' + leadIds.length + ' lead</strong>?<br><span style="color:#6B7280;font-size:0.8rem;">Verranno eliminati anche timeline, documenti e richieste BO associati.</span>';
  }

  // Salva gli ID da eliminare sul bottone conferma
  document.getElementById('btn-conferma-elimina').dataset.leadIds = JSON.stringify(leadIds);

  modal.style.display = 'flex';
}

function chiudiModaleConfermaElimina() {
  document.getElementById('modal-conferma-elimina').style.display = 'none';
}

async function eliminaLeadConfermato() {
  var btn = document.getElementById('btn-conferma-elimina');
  var leadIds = JSON.parse(btn.dataset.leadIds || '[]');

  if (leadIds.length === 0) return;

  // Disabilita bottone
  btn.disabled = true;
  btn.textContent = 'Eliminazione...';

  var eliminati = 0;
  var errori = 0;

  for (var i = 0; i < leadIds.length; i++) {
    try {
      await eliminaLeadCompleto(leadIds[i]);
      eliminati++;
    } catch (error) {
      console.log('Errore eliminazione lead ' + leadIds[i] + ':', error);
      errori++;
    }
  }

  // Chiudi modale
  chiudiModaleConfermaElimina();

  // Ripristina bottone
  btn.disabled = false;
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
    ' Elimina';

  // Disattiva modalità selezione
  if (modalitaSelezione) disattivaModalitaSelezione();

  // Mostra risultato
  if (errori === 0) {
    if (eliminati === 1) {
      mostraToast('Lead eliminato con successo', 'success');
    } else {
      mostraToast(eliminati + ' lead eliminati con successo', 'success');
    }
  } else {
    mostraToast('Eliminati ' + eliminati + ' lead, ' + errori + ' errori', 'warning');
  }

  // Ricarica board
  await caricaEFiltraLead();
}

// Elimina un lead e tutte le sue subcollection
async function eliminaLeadCompleto(leadId) {
  var leadRef = db.collection('lead').doc(leadId);

  // 1. Elimina subcollection timeline
  var timelineSnap = await leadRef.collection('timeline').get();
  var batch1 = db.batch();
  timelineSnap.forEach(function(doc) { batch1.delete(doc.ref); });
  if (!timelineSnap.empty) await batch1.commit();

  // 2. Elimina subcollection documenti
  var docSnap = await leadRef.collection('documenti').get();
  var batch2 = db.batch();
  docSnap.forEach(function(doc) { batch2.delete(doc.ref); });
  if (!docSnap.empty) await batch2.commit();

  // 3. Elimina subcollection richiesteBO
  var boSnap = await leadRef.collection('richiesteBO').get();
  var batch3 = db.batch();
  boSnap.forEach(function(doc) { batch3.delete(doc.ref); });
  if (!boSnap.empty) await batch3.commit();

  // 4. Elimina il documento lead
  await leadRef.delete();
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

  if (!nome || !cognome || !telefono) {
    mostraToast('Compila i campi obbligatori: Nome, Cognome, Telefono', 'error');
    return;
  }

  var consulenteId = '';
  if (utenteCorrente.ruolo === 'admin') {
    consulenteId = document.getElementById('nuovo-consulente').value || '';
  } else if (utenteCorrente.ruolo === 'consulente') {
    consulenteId = utenteCorrente.id;
  }

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

  // Chiudi modale nuovo lead
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

  // --- SELEZIONE MULTIPLA ---
  document.getElementById('btn-modalita-selezione').addEventListener('click', function () {
    if (modalitaSelezione) {
      disattivaModalitaSelezione();
    } else {
      attivaModalitaSelezione();
    }
  });

  document.getElementById('btn-seleziona-tutti').addEventListener('click', selezionaTutti);
  document.getElementById('btn-deseleziona-tutti').addEventListener('click', deselezionaTutti);
  document.getElementById('btn-annulla-selezione').addEventListener('click', disattivaModalitaSelezione);

  document.getElementById('btn-elimina-selezionati').addEventListener('click', function () {
    if (leadSelezionati.length > 0) {
      apriModaleConfermaElimina(leadSelezionati);
    }
  });

  // --- MODALE CONFERMA ELIMINA ---
  document.getElementById('btn-conferma-elimina').addEventListener('click', eliminaLeadConfermato);
  document.getElementById('btn-annulla-elimina').addEventListener('click', chiudiModaleConfermaElimina);
  document.getElementById('modal-conferma-elimina').addEventListener('click', function (e) {
    if (e.target === this) chiudiModaleConfermaElimina();
  });
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
