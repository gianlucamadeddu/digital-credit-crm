// ============================================
// lead.js — Logica Elenco Lead + Dettaglio Lead
// ============================================

// Usa db e storage già dichiarati in firebase-config.js
// Stato elenco
var tuttiLead = [];
var leadFiltrati = [];
var paginaCorrente = 1;
var leadPerPagina = 20;
var ordinamento = { campo: 'dataCreazione', direzione: 'desc' };
var statiMap = {};       // id -> { nome, colore, fase, ... }
var consulentiMap = {};  // id -> { nome, cognome, ... }

// Stato dettaglio
var leadCorrente = null;
var leadCorrenteId = null;
var contrattoCorrente = null;
var templateSelezionato = null;


// ============================================
// INIZIALIZZAZIONE ELENCO LEAD
// ============================================

async function inizializzaElencoLead() {
  try {
    // Carica stati e consulenti per i filtri
    await Promise.all([
      caricaStati(),
      caricaConsulenti()
    ]);

    // Popola filtri
    popolaFiltroStati();
    popolaFiltroConsulenti();
    popolaSelectConsulentiModale();

    // Mostra filtro consulente solo per Admin e BO
    var utente = getUtenteCorrente();
    if (utente && (utente.ruolo === 'admin' || utente.ruolo === 'backoffice')) {
      document.getElementById('filtro-consulente').style.display = '';
    }

    // Event listener per filtri
    document.getElementById('filtro-periodo').addEventListener('change', function() {
      // Mostra/nascondi campi data personalizzate
      var dateGroup = document.getElementById('date-range-group');
      if (this.value === 'personalizzato') {
        dateGroup.style.display = 'inline-flex';
      } else {
        dateGroup.style.display = 'none';
        applicaFiltri();
      }
    });
    document.getElementById('filtro-stato').addEventListener('change', applicaFiltri);
    document.getElementById('filtro-consulente').addEventListener('change', applicaFiltri);

    // Event listener per date personalizzate
    var filtroDaDa = document.getElementById('filtro-data-da');
    var filtroDataA = document.getElementById('filtro-data-a');
    if (filtroDaDa) filtroDaDa.addEventListener('change', applicaFiltri);
    if (filtroDataA) filtroDataA.addEventListener('change', applicaFiltri);

    // Debounce per ricerca testo
    var timerRicerca = null;
    document.getElementById('ricerca-testo').addEventListener('input', function() {
      clearTimeout(timerRicerca);
      timerRicerca = setTimeout(applicaFiltri, 300);
    });

    // Event listener per ordinamento colonne
    document.querySelectorAll('.sortable').forEach(function(th) {
      th.addEventListener('click', function() {
        var campo = this.getAttribute('data-campo');
        if (ordinamento.campo === campo) {
          ordinamento.direzione = ordinamento.direzione === 'asc' ? 'desc' : 'asc';
        } else {
          ordinamento.campo = campo;
          ordinamento.direzione = 'asc';
        }
        aggiornaFrecciaOrdinamento();
        ordinaERenderizza();
      });
    });

    // Carica tutti i lead
    await caricaLead();

  } catch (errore) {
    console.error('Errore inizializzazione elenco:', errore);
    mostraToast('Errore nel caricamento dei lead', 'error');
  }
}


// ============================================
// CARICAMENTO DATI BASE
// ============================================

async function caricaStati() {
  var snapshot = await db.collection('stati').orderBy('posizione').get();
  statiMap = {};
  snapshot.forEach(function(doc) {
    statiMap[doc.id] = doc.data();
    statiMap[doc.id].id = doc.id;
  });
}

async function caricaConsulenti() {
  var snapshot = await db.collection('utenti').where('ruolo', '==', 'consulente').where('attivo', '==', true).get();
  consulentiMap = {};
  snapshot.forEach(function(doc) {
    var dati = doc.data();
    consulentiMap[doc.id] = dati;
    consulentiMap[doc.id].id = doc.id;
  });
}


// ============================================
// CARICAMENTO LEAD
// ============================================

async function caricaLead() {
  var utente = getUtenteCorrente();
  if (!utente) return;

  document.getElementById('loading-state').style.display = '';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('paginazione').style.display = 'none';
  document.getElementById('tbody-lead').innerHTML = '';

  try {
    var query = db.collection('lead').orderBy('dataCreazione', 'desc');

    // Filtro per ruolo
    if (utente.ruolo === 'consulente') {
      query = db.collection('lead')
        .where('consulenteId', '==', utente.id)
        .orderBy('dataCreazione', 'desc');
    } else if (utente.ruolo === 'backoffice') {
      query = db.collection('lead')
        .where('fase', '==', 'backoffice')
        .orderBy('dataCreazione', 'desc');
    }

    var snapshot = await query.get();
    tuttiLead = [];

    snapshot.forEach(function(doc) {
      var lead = doc.data();
      lead.id = doc.id;
      // Aggiungi nome consulente per visualizzazione
      if (lead.consulenteId && consulentiMap[lead.consulenteId]) {
        lead.consulenteNome = consulentiMap[lead.consulenteId].nome + ' ' + consulentiMap[lead.consulenteId].cognome;
      } else {
        lead.consulenteNome = '—';
      }
      tuttiLead.push(lead);
    });

    applicaFiltri();

  } catch (errore) {
    console.error('Errore caricamento lead:', errore);
    mostraToast('Errore nel caricamento dei lead', 'error');
    document.getElementById('loading-state').style.display = 'none';
  }
}


// ============================================
// FILTRI E ORDINAMENTO
// ============================================

function applicaFiltri() {
  var filtroPeriodo = document.getElementById('filtro-periodo').value;
  var filtroStato = document.getElementById('filtro-stato').value;
  var filtroConsulente = document.getElementById('filtro-consulente').value;
  var ricerca = document.getElementById('ricerca-testo').value.toLowerCase().trim();

  leadFiltrati = tuttiLead.filter(function(lead) {
    // Filtro periodo
    if (filtroPeriodo !== 'tutti') {
      var dataLead = lead.dataCreazione ? lead.dataCreazione.toDate() : new Date(0);
      var ora = new Date();
      var inizio;
      var fine = null;

      if (filtroPeriodo === 'personalizzato') {
        // Date personalizzate
        var valDa = document.getElementById('filtro-data-da').value;
        var valA = document.getElementById('filtro-data-a').value;
        if (valDa) {
          inizio = new Date(valDa);
          inizio.setHours(0, 0, 0, 0);
        } else {
          inizio = null;
        }
        if (valA) {
          fine = new Date(valA);
          fine.setHours(23, 59, 59, 999);
        }
        if (inizio && dataLead < inizio) return false;
        if (fine && dataLead > fine) return false;
      } else {
        switch (filtroPeriodo) {
          case 'oggi':
            inizio = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate());
            break;
          case 'settimana':
            inizio = new Date(ora);
            inizio.setDate(ora.getDate() - ora.getDay());
            inizio.setHours(0, 0, 0, 0);
            break;
          case 'mese':
            inizio = new Date(ora.getFullYear(), ora.getMonth(), 1);
            break;
          case 'trimestre':
            inizio = new Date(ora);
            inizio.setMonth(ora.getMonth() - 3);
            break;
          case 'anno':
            inizio = new Date(ora.getFullYear(), 0, 1);
            break;
        }
        if (dataLead < inizio) return false;
      }
    }

    // Filtro stato
    if (filtroStato !== 'tutti' && lead.stato !== filtroStato) return false;

    // Filtro consulente
    if (filtroConsulente !== 'tutti' && lead.consulenteId !== filtroConsulente) return false;

    // Ricerca testo
    if (ricerca) {
      var nomeCompleto = ((lead.nome || '') + ' ' + (lead.cognome || '')).toLowerCase();
      var telefono = (lead.telefono || '').toLowerCase();
      var email = (lead.email || '').toLowerCase();
      if (
        nomeCompleto.indexOf(ricerca) === -1 &&
        telefono.indexOf(ricerca) === -1 &&
        email.indexOf(ricerca) === -1
      ) {
        return false;
      }
    }

    return true;
  });

  paginaCorrente = 1;
  ordinaERenderizza();
}

function ordinaERenderizza() {
  // Ordina
  leadFiltrati.sort(function(a, b) {
    var valA = a[ordinamento.campo];
    var valB = b[ordinamento.campo];

    // Gestisci Timestamp Firebase
    if (valA && typeof valA.toDate === 'function') valA = valA.toDate().getTime();
    if (valB && typeof valB.toDate === 'function') valB = valB.toDate().getTime();

    // Gestisci null/undefined
    if (valA == null) valA = '';
    if (valB == null) valB = '';

    // Confronto stringa
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    var risultato = 0;
    if (valA < valB) risultato = -1;
    if (valA > valB) risultato = 1;

    return ordinamento.direzione === 'asc' ? risultato : -risultato;
  });

  renderizzaTabella();
  renderizzaPaginazione();
}

function aggiornaFrecciaOrdinamento() {
  document.querySelectorAll('.sortable').forEach(function(th) {
    var arrow = th.querySelector('.sort-arrow');
    if (th.getAttribute('data-campo') === ordinamento.campo) {
      arrow.textContent = ordinamento.direzione === 'asc' ? ' ↑' : ' ↓';
      th.classList.add('sorted');
    } else {
      arrow.textContent = '';
      th.classList.remove('sorted');
    }
  });
}


// ============================================
// RENDERING TABELLA
// ============================================

function renderizzaTabella() {
  var tbody = document.getElementById('tbody-lead');
  var loadingState = document.getElementById('loading-state');
  var emptyState = document.getElementById('empty-state');

  loadingState.style.display = 'none';

  if (leadFiltrati.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = '';
    document.getElementById('paginazione').style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';

  // Calcola indici pagina
  var inizio = (paginaCorrente - 1) * leadPerPagina;
  var fine = Math.min(inizio + leadPerPagina, leadFiltrati.length);
  var leadPagina = leadFiltrati.slice(inizio, fine);

  var html = '';
  leadPagina.forEach(function(lead) {
    var statoInfo = statiMap[lead.stato] || { nome: lead.stato || '—', colore: '#999' };
    var badgeClass = getBadgeClass(lead.stato);
    var dataStr = lead.dataCreazione ? formattaData(lead.dataCreazione.toDate()) : '—';
    var telefonoClean = (lead.telefono || '').replace(/\s/g, '');

    html += '<tr class="fade-in" onclick="apriDettaglio(\'' + lead.id + '\')" style="cursor:pointer;">';
    html += '  <td class="td-nome">';
    html += '    <span class="lead-nome-link">' + escapeHtml((lead.nome || '') + ' ' + (lead.cognome || '')) + '</span>';
    if (lead.autoRichiesta) {
      html += '    <span class="lead-auto-sub">' + escapeHtml(lead.autoRichiesta) + '</span>';
    }
    html += '  </td>';
    html += '  <td><a href="tel:' + telefonoClean + '" class="link-action" onclick="event.stopPropagation();">' + escapeHtml(lead.telefono || '—') + '</a></td>';
    html += '  <td><a href="mailto:' + escapeHtml(lead.email || '') + '" class="link-action" onclick="event.stopPropagation();">' + escapeHtml(lead.email || '—') + '</a></td>';
    html += '  <td><span class="badge ' + badgeClass + '">' + escapeHtml(statoInfo.nome) + '</span></td>';
    html += '  <td>' + escapeHtml(lead.consulenteNome || '—') + '</td>';
    html += '  <td>' + dataStr + '</td>';
    html += '  <td class="td-azioni">';
    html += '    <div class="azioni-row" onclick="event.stopPropagation();">';
    if (telefonoClean) {
      html += '    <a href="https://wa.me/39' + telefonoClean + '" target="_blank" class="btn-icon-action btn-wa" title="WhatsApp">';
      html += '      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
      html += '    </a>';
    }
    if (lead.email) {
      html += '    <a href="mailto:' + escapeHtml(lead.email) + '" class="btn-icon-action btn-email" title="Email">';
      html += '      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
      html += '    </a>';
    }
    html += '      <a href="lead-dettaglio.html?id=' + lead.id + '" class="btn-icon-action btn-dettaglio" title="Dettaglio">';
    html += '        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    html += '      </a>';
    html += '    </div>';
    html += '  </td>';
    html += '</tr>';
  });

  tbody.innerHTML = html;
}


// ============================================
// PAGINAZIONE
// ============================================

function renderizzaPaginazione() {
  if (leadFiltrati.length === 0) {
    document.getElementById('paginazione').style.display = 'none';
    return;
  }

  document.getElementById('paginazione').style.display = '';

  var totalePagine = Math.ceil(leadFiltrati.length / leadPerPagina);
  var inizio = (paginaCorrente - 1) * leadPerPagina + 1;
  var fine = Math.min(paginaCorrente * leadPerPagina, leadFiltrati.length);

  document.getElementById('pagination-info').textContent =
    'Mostrando ' + inizio + '-' + fine + ' di ' + leadFiltrati.length + ' lead';

  document.getElementById('btn-prev').disabled = (paginaCorrente <= 1);
  document.getElementById('btn-next').disabled = (paginaCorrente >= totalePagine);

  // Genera numeri pagina
  var pagesHtml = '';
  var maxPagineVisibili = 5;
  var inizioPag = Math.max(1, paginaCorrente - Math.floor(maxPagineVisibili / 2));
  var finePag = Math.min(totalePagine, inizioPag + maxPagineVisibili - 1);
  inizioPag = Math.max(1, finePag - maxPagineVisibili + 1);

  if (inizioPag > 1) {
    pagesHtml += '<button class="btn btn-sm btn-page" onclick="vaiAPagina(1)">1</button>';
    if (inizioPag > 2) pagesHtml += '<span class="pagination-dots">...</span>';
  }

  for (var i = inizioPag; i <= finePag; i++) {
    var activeClass = i === paginaCorrente ? ' btn-page-active' : '';
    pagesHtml += '<button class="btn btn-sm btn-page' + activeClass + '" onclick="vaiAPagina(' + i + ')">' + i + '</button>';
  }

  if (finePag < totalePagine) {
    if (finePag < totalePagine - 1) pagesHtml += '<span class="pagination-dots">...</span>';
    pagesHtml += '<button class="btn btn-sm btn-page" onclick="vaiAPagina(' + totalePagine + ')">' + totalePagine + '</button>';
  }

  document.getElementById('pagination-pages').innerHTML = pagesHtml;
}

function vaiAPagina(num) {
  paginaCorrente = num;
  renderizzaTabella();
  renderizzaPaginazione();
  // Scroll in alto
  document.querySelector('.table-wrapper').scrollTop = 0;
}

function paginaPrecedente() {
  if (paginaCorrente > 1) {
    vaiAPagina(paginaCorrente - 1);
  }
}

function paginaSuccessiva() {
  var totalePagine = Math.ceil(leadFiltrati.length / leadPerPagina);
  if (paginaCorrente < totalePagine) {
    vaiAPagina(paginaCorrente + 1);
  }
}


// ============================================
// POPOLA FILTRI
// ============================================

function popolaFiltroStati() {
  var select = document.getElementById('filtro-stato');
  if (!select) return;
  var html = '<option value="tutti">Tutti gli stati</option>';
  // Ordina stati per posizione
  var statiOrdinati = Object.values(statiMap).sort(function(a, b) { return a.posizione - b.posizione; });
  statiOrdinati.forEach(function(stato) {
    if (stato.attivo !== false) {
      html += '<option value="' + stato.id + '">' + escapeHtml(stato.nome) + '</option>';
    }
  });
  select.innerHTML = html;
}

function popolaFiltroConsulenti() {
  var select = document.getElementById('filtro-consulente');
  if (!select) return;
  var html = '<option value="tutti">Tutti i consulenti</option>';
  Object.values(consulentiMap).forEach(function(c) {
    html += '<option value="' + c.id + '">' + escapeHtml(c.nome + ' ' + c.cognome) + '</option>';
  });
  select.innerHTML = html;
}

function popolaSelectConsulentiModale() {
  var select = document.getElementById('nuovo-consulente');
  if (!select) return;
  var utente = getUtenteCorrente();
  var html = '';

  if (utente && utente.ruolo === 'consulente') {
    // Consulente può assegnare solo a sé stesso
    html += '<option value="' + utente.id + '">' + escapeHtml(utente.nome + ' ' + utente.cognome) + '</option>';
  } else {
    html += '<option value="">Seleziona consulente...</option>';
    Object.values(consulentiMap).forEach(function(c) {
      html += '<option value="' + c.id + '">' + escapeHtml(c.nome + ' ' + c.cognome) + '</option>';
    });
  }
  select.innerHTML = html;
}


// ============================================
// NAVIGAZIONE
// ============================================

function apriDettaglio(id) {
  window.location.href = 'lead-dettaglio.html?id=' + id;
}


// ============================================
// NUOVO LEAD (Modale)
// ============================================

function apriModaleNuovoLead() {
  document.getElementById('modale-nuovo-lead').style.display = 'flex';
  document.getElementById('nuovo-nome').focus();
}

function chiudiModaleNuovoLead() {
  document.getElementById('modale-nuovo-lead').style.display = 'none';
  // Reset form
  ['nuovo-nome', 'nuovo-cognome', 'nuovo-telefono', 'nuovo-email', 'nuovo-provincia', 'nuovo-auto', 'nuovo-note'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('nuovo-fonte').value = 'manuale';
}

async function salvaNuovoLead() {
  var nome = document.getElementById('nuovo-nome').value.trim();
  var cognome = document.getElementById('nuovo-cognome').value.trim();
  var telefono = document.getElementById('nuovo-telefono').value.trim();

  if (!nome || !cognome || !telefono) {
    mostraToast('Compila i campi obbligatori (Nome, Cognome, Telefono)', 'error');
    return;
  }

  var utente = getUtenteCorrente();
  var consulenteId = document.getElementById('nuovo-consulente').value;

  // Se il consulente non seleziona nessuno, assegna a sé stesso
  if (!consulenteId && utente.ruolo === 'consulente') {
    consulenteId = utente.id;
  }

  // Trova il primo stato (posizione più bassa)
  var primoStato = Object.values(statiMap).sort(function(a, b) { return a.posizione - b.posizione; })[0];

  var nuovoLead = {
    nome: nome,
    cognome: cognome,
    telefono: telefono,
    email: document.getElementById('nuovo-email').value.trim(),
    provincia: document.getElementById('nuovo-provincia').value.trim(),
    fonte: document.getElementById('nuovo-fonte').value,
    campagna: '',
    consulenteId: consulenteId || '',
    stato: primoStato ? primoStato.id : 'nuovo',
    fase: primoStato ? primoStato.fase : 'contatto',
    priorita: 'media',
    tipoCliente: 'privato',
    autoRichiesta: document.getElementById('nuovo-auto').value.trim(),
    budgetMensile: '',
    durataDesiderata: null,
    kmAnnui: null,
    tempiDesiderati: '',
    noteEsigenza: document.getElementById('nuovo-note').value.trim(),
    tags: [],
    dataCreazione: firebase.firestore.FieldValue.serverTimestamp(),
    dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp(),
    dataChiusura: null
  };

  try {
    var docRef = await db.collection('lead').add(nuovoLead);

    // Crea voce timeline
    await db.collection('lead').doc(docRef.id).collection('timeline').add({
      tipo: 'cambio_stato',
      statoOld: '',
      statoNew: nuovoLead.stato,
      autoreId: utente.id,
      autoreNome: utente.nome + ' ' + utente.cognome,
      nota: 'Lead creato manualmente',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    mostraToast('Lead creato con successo!', 'success');
    chiudiModaleNuovoLead();

    // Ricarica lista
    await caricaLead();

  } catch (errore) {
    console.error('Errore creazione lead:', errore);
    mostraToast('Errore nella creazione del lead', 'error');
  }
}


// ============================================
// INIZIALIZZAZIONE DETTAGLIO LEAD
// ============================================

async function inizializzaDettaglioLead() {
  // Leggi ID dal URL
  var params = new URLSearchParams(window.location.search);
  leadCorrenteId = params.get('id');

  if (!leadCorrenteId) {
    mostraToast('ID lead non trovato', 'error');
    setTimeout(function() { window.location.href = 'lead-elenco.html'; }, 1500);
    return;
  }

  // Controlla se arriva da Kanban o Elenco per il bottone "Torna"
  var referrer = document.referrer;
  var btnTorna = document.getElementById('btn-torna');
  if (btnTorna && referrer && referrer.indexOf('lead-kanban') !== -1) {
    btnTorna.href = 'lead-kanban.html';
    btnTorna.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Torna alla Kanban';
  }

  try {
    await Promise.all([
      caricaStati(),
      caricaConsulenti()
    ]);

    await caricaDettaglioLead();
    await Promise.all([
      caricaTimeline(),
      caricaDocumenti(),
      caricaRichiesteBO(),
      caricaContrattoLead()
    ]);

    // Se Admin, mostra select riassegnazione
    var utente = getUtenteCorrente();
    if (utente && utente.ruolo === 'admin') {
      document.getElementById('box-riassegna').style.display = '';
      popolaSelectRiassegna();
    }

  } catch (errore) {
    console.error('Errore inizializzazione dettaglio:', errore);
    mostraToast('Errore nel caricamento del lead', 'error');
  }
}


// ============================================
// CARICAMENTO DETTAGLIO LEAD
// ============================================

async function caricaDettaglioLead() {
  var doc = await db.collection('lead').doc(leadCorrenteId).get();

  if (!doc.exists) {
    mostraToast('Lead non trovato', 'error');
    setTimeout(function() { window.location.href = 'lead-elenco.html'; }, 1500);
    return;
  }

  leadCorrente = doc.data();
  leadCorrente.id = doc.id;

  // Aggiorna header
  var nomeCompleto = (leadCorrente.nome || '') + ' ' + (leadCorrente.cognome || '');
  document.getElementById('dettaglio-nome-cliente').textContent = nomeCompleto;
  document.title = nomeCompleto + ' - Digital Credit';

  // Badge stato
  var statoInfo = statiMap[leadCorrente.stato] || { nome: leadCorrente.stato, colore: '#999' };
  var badgeEl = document.getElementById('dettaglio-badge-stato');
  badgeEl.textContent = statoInfo.nome;
  badgeEl.className = 'badge ' + getBadgeClass(leadCorrente.stato);

  // Mostra tab contratto se stato = venduto
  if (leadCorrente.stato === 'venduto' || leadCorrente.stato === 'contratto_firmato') {
    document.getElementById('tab-contratto-btn').style.display = '';
  }

  // Popola tab Anagrafica
  document.getElementById('det-nome').value = leadCorrente.nome || '';
  document.getElementById('det-cognome').value = leadCorrente.cognome || '';
  document.getElementById('det-telefono').value = leadCorrente.telefono || '';
  document.getElementById('det-email').value = leadCorrente.email || '';
  document.getElementById('det-provincia').value = leadCorrente.provincia || '';
  document.getElementById('det-fonte').value = leadCorrente.fonte || 'manuale';
  document.getElementById('det-priorita').value = leadCorrente.priorita || 'media';
  document.getElementById('det-data-creazione').value =
    leadCorrente.dataCreazione ? formattaDataOra(leadCorrente.dataCreazione.toDate()) : '—';

  // Popola tab Esigenza
  document.getElementById('det-tipo-cliente').value = leadCorrente.tipoCliente || 'privato';
  document.getElementById('det-auto-richiesta').value = leadCorrente.autoRichiesta || '';
  document.getElementById('det-budget').value = leadCorrente.budgetMensile || '';
  document.getElementById('det-durata').value = leadCorrente.durataDesiderata || '';
  document.getElementById('det-km-annui').value = leadCorrente.kmAnnui || '';
  document.getElementById('det-tempi').value = leadCorrente.tempiDesiderati || '';
  document.getElementById('det-note-esigenza').value = leadCorrente.noteEsigenza || '';

  // Popola select cambio stato
  popolaSelectStati();

  // Popola info consulente
  var consulenteNome = '—';
  if (leadCorrente.consulenteId && consulentiMap[leadCorrente.consulenteId]) {
    var c = consulentiMap[leadCorrente.consulenteId];
    consulenteNome = c.nome + ' ' + c.cognome;
  }
  document.getElementById('det-consulente-nome').textContent = consulenteNome;
}


// ============================================
// SELECT STATI (con transizioni consentite)
// ============================================

function popolaSelectStati() {
  var select = document.getElementById('det-cambio-stato');
  if (!select || !leadCorrente) return;

  var statoCorrente = statiMap[leadCorrente.stato];
  var html = '<option value="" disabled selected>Stato: ' +
    (statoCorrente ? statoCorrente.nome : leadCorrente.stato) + '</option>';

  // Mostra tutti gli stati come possibili transizioni
  // ma evidenzia quelli consentiti
  var statiOrdinati = Object.values(statiMap).sort(function(a, b) { return a.posizione - b.posizione; });
  var transizioniConsentite = statoCorrente && statoCorrente.transizioniConsentite ? statoCorrente.transizioniConsentite : [];

  statiOrdinati.forEach(function(stato) {
    if (stato.id !== leadCorrente.stato && stato.attivo !== false) {
      var consentito = transizioniConsentite.indexOf(stato.id) !== -1;
      html += '<option value="' + stato.id + '"';
      if (!consentito) html += ' class="stato-non-consentito"';
      html += '>' + stato.nome;
      if (!consentito) html += ' ⚠';
      html += '</option>';
    }
  });

  select.innerHTML = html;
}


// ============================================
// CAMBIO STATO LEAD
// ============================================

async function cambiaStatoLead() {
  var select = document.getElementById('det-cambio-stato');
  var nuovoStato = select.value;
  if (!nuovoStato || !leadCorrente) return;

  var statoVecchio = leadCorrente.stato;
  var statoCorrente = statiMap[statoVecchio];
  var transizioniConsentite = statoCorrente && statoCorrente.transizioniConsentite ? statoCorrente.transizioniConsentite : [];

  // Controlla se transizione è consentita
  if (transizioniConsentite.length > 0 && transizioniConsentite.indexOf(nuovoStato) === -1) {
    if (!confirm('Questa transizione non è consigliata. Vuoi procedere comunque?')) {
      select.value = '';
      return;
    }
  }

  var utente = getUtenteCorrente();
  var nuovoStatoInfo = statiMap[nuovoStato];

  try {
    // Aggiorna lead
    var updateData = {
      stato: nuovoStato,
      fase: nuovoStatoInfo ? nuovoStatoInfo.fase : leadCorrente.fase,
      dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Se stato = venduto/perso, salva data chiusura
    if (nuovoStato === 'venduto' || nuovoStato === 'perso' || nuovoStato === 'contratto_firmato') {
      updateData.dataChiusura = firebase.firestore.FieldValue.serverTimestamp();
    }

    await db.collection('lead').doc(leadCorrenteId).update(updateData);

    // Crea voce timeline
    await db.collection('lead').doc(leadCorrenteId).collection('timeline').add({
      tipo: 'cambio_stato',
      statoOld: statoVecchio,
      statoNew: nuovoStato,
      autoreId: utente.id,
      autoreNome: utente.nome + ' ' + utente.cognome,
      nota: '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    mostraToast('Stato aggiornato con successo!', 'success');

    // Aggiorna stato locale
    leadCorrente.stato = nuovoStato;
    leadCorrente.fase = updateData.fase;

    // Aggiorna UI
    var statoInfo = statiMap[nuovoStato] || { nome: nuovoStato };
    var badgeEl = document.getElementById('dettaglio-badge-stato');
    badgeEl.textContent = statoInfo.nome;
    badgeEl.className = 'badge ' + getBadgeClass(nuovoStato);

    // Mostra tab contratto se venduto
    if (nuovoStato === 'venduto' || nuovoStato === 'contratto_firmato') {
      document.getElementById('tab-contratto-btn').style.display = '';
    }

    popolaSelectStati();
    await caricaTimeline();

  } catch (errore) {
    console.error('Errore cambio stato:', errore);
    mostraToast('Errore nel cambio stato', 'error');
  }
}


// ============================================
// SALVATAGGIO DATI
// ============================================

async function salvaAnagrafica() {
  if (!leadCorrenteId) return;

  var utente = getUtenteCorrente();

  try {
    await db.collection('lead').doc(leadCorrenteId).update({
      nome: document.getElementById('det-nome').value.trim(),
      cognome: document.getElementById('det-cognome').value.trim(),
      telefono: document.getElementById('det-telefono').value.trim(),
      email: document.getElementById('det-email').value.trim(),
      provincia: document.getElementById('det-provincia').value.trim(),
      fonte: document.getElementById('det-fonte').value,
      priorita: document.getElementById('det-priorita').value,
      dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Aggiorna header
    var nomeCompleto = document.getElementById('det-nome').value.trim() + ' ' + document.getElementById('det-cognome').value.trim();
    document.getElementById('dettaglio-nome-cliente').textContent = nomeCompleto;

    mostraToast('Anagrafica salvata con successo!', 'success');
  } catch (errore) {
    console.error('Errore salvataggio anagrafica:', errore);
    mostraToast('Errore nel salvataggio', 'error');
  }
}

async function salvaEsigenza() {
  if (!leadCorrenteId) return;

  try {
    var durataVal = document.getElementById('det-durata').value;
    var kmVal = document.getElementById('det-km-annui').value;

    await db.collection('lead').doc(leadCorrenteId).update({
      tipoCliente: document.getElementById('det-tipo-cliente').value,
      autoRichiesta: document.getElementById('det-auto-richiesta').value.trim(),
      budgetMensile: document.getElementById('det-budget').value.trim(),
      durataDesiderata: durataVal ? parseInt(durataVal) : null,
      kmAnnui: kmVal ? parseInt(kmVal) : null,
      tempiDesiderati: document.getElementById('det-tempi').value,
      noteEsigenza: document.getElementById('det-note-esigenza').value.trim(),
      dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp()
    });

    mostraToast('Esigenza salvata con successo!', 'success');
  } catch (errore) {
    console.error('Errore salvataggio esigenza:', errore);
    mostraToast('Errore nel salvataggio', 'error');
  }
}


// ============================================
// TIMELINE
// ============================================

async function caricaTimeline() {
  var container = document.getElementById('timeline-list');
  var emptyEl = document.getElementById('timeline-empty');
  var loadingEl = document.getElementById('timeline-loading');

  if (loadingEl) loadingEl.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  try {
    var snapshot = await db.collection('lead').doc(leadCorrenteId)
      .collection('timeline')
      .orderBy('timestamp', 'desc')
      .get();

    if (loadingEl) loadingEl.style.display = 'none';

    if (snapshot.empty) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    var html = '';
    snapshot.forEach(function(doc) {
      var evento = doc.data();
      var dataStr = evento.timestamp ? formattaDataOra(evento.timestamp.toDate()) : '—';
      var icona = '';
      var coloreIcona = '';
      var titolo = '';
      var dettaglio = '';

      switch (evento.tipo) {
        case 'cambio_stato':
          icona = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
          coloreIcona = 'blue';
          var nomeVecchio = evento.statoOld && statiMap[evento.statoOld] ? statiMap[evento.statoOld].nome : (evento.statoOld || '—');
          var nomeNuovo = statiMap[evento.statoNew] ? statiMap[evento.statoNew].nome : evento.statoNew;
          titolo = 'Stato cambiato da <strong>' + escapeHtml(nomeVecchio) + '</strong> a <strong>' + escapeHtml(nomeNuovo) + '</strong>';
          break;
        case 'nota':
          icona = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
          coloreIcona = 'green';
          titolo = 'Nota aggiunta';
          dettaglio = evento.nota || '';
          break;
        // >>> AGGIUNTA: case chiamata <<<
        case 'chiamata':
          icona = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
          coloreIcona = 'blue';
          titolo = 'Chiamata effettuata';
          dettaglio = evento.nota || '';
          break;
        // >>> AGGIUNTA: case risposta_bo <<<
        case 'risposta_bo':
          icona = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
          coloreIcona = 'purple';
          titolo = 'Risposta Back Office';
          dettaglio = evento.nota || '';
          break;
        case 'documento':
          icona = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
          coloreIcona = 'yellow';
          titolo = 'Documento caricato: <strong>' + escapeHtml(evento.nota || '') + '</strong>';
          break;
        case 'richiesta_bo':
          icona = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
          coloreIcona = 'purple';
          titolo = 'Richiesta ' + escapeHtml(evento.nota || 'BO') + ' inviata';
          break;
        default:
          icona = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
          coloreIcona = 'gray';
          titolo = evento.tipo || 'Evento';
      }

      html += '<div class="timeline-item fade-in">';
      html += '  <div class="timeline-icon ' + coloreIcona + '">' + icona + '</div>';
      html += '  <div class="timeline-content">';
      html += '    <div class="timeline-header">';
      html += '      <span class="timeline-title">' + titolo + '</span>';
      html += '      <span class="timeline-meta">' + escapeHtml(evento.autoreNome || '') + ' — ' + dataStr + '</span>';
      html += '    </div>';
      if (dettaglio) {
        html += '    <div class="timeline-detail">' + escapeHtml(dettaglio) + '</div>';
      }
      html += '  </div>';
      html += '</div>';
    });

    container.innerHTML = html;

  } catch (errore) {
    console.error('Errore caricamento timeline:', errore);
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

async function aggiungiNota() {
  var textarea = document.getElementById('timeline-nota');
  var testo = textarea.value.trim();
  if (!testo) {
    mostraToast('Scrivi una nota prima di aggiungerla', 'error');
    return;
  }

  var utente = getUtenteCorrente();

  try {
    await db.collection('lead').doc(leadCorrenteId).collection('timeline').add({
      tipo: 'nota',
      autoreId: utente.id,
      autoreNome: utente.nome + ' ' + utente.cognome,
      nota: testo,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Aggiorna data ultima modifica del lead
    await db.collection('lead').doc(leadCorrenteId).update({
      dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp()
    });

    textarea.value = '';
    mostraToast('Nota aggiunta!', 'success');
    await caricaTimeline();

  } catch (errore) {
    console.error('Errore aggiunta nota:', errore);
    mostraToast('Errore nell\'aggiunta della nota', 'error');
  }
}


// ============================================
// DOCUMENTI
// ============================================

async function caricaDocumenti() {
  var container = document.getElementById('documenti-list');
  var emptyEl = document.getElementById('documenti-empty');
  var loadingEl = document.getElementById('documenti-loading');

  if (loadingEl) loadingEl.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  try {
    var snapshot = await db.collection('lead').doc(leadCorrenteId)
      .collection('documenti')
      .orderBy('dataCaricamento', 'desc')
      .get();

    if (loadingEl) loadingEl.style.display = 'none';

    if (snapshot.empty) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    var utente = getUtenteCorrente();
    var html = '';

    snapshot.forEach(function(doc) {
      var documento = doc.data();
      var dataStr = documento.dataCaricamento ? formattaData(documento.dataCaricamento.toDate()) : '—';
      var tipoLabel = getTipoDocumentoLabel(documento.tipo);
      var puoEliminare = (utente.ruolo === 'admin' || documento.caricatoDa === utente.id);

      html += '<div class="documento-item fade-in">';
      html += '  <div class="documento-info">';
      html += '    <svg class="documento-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      html += '    <div>';
      html += '      <a href="' + escapeHtml(documento.url || '#') + '" target="_blank" class="documento-nome">' + escapeHtml(documento.nome) + '</a>';
      html += '      <div class="documento-meta">' + escapeHtml(tipoLabel) + ' — ' + dataStr + '</div>';
      html += '    </div>';
      html += '  </div>';
      if (puoEliminare) {
        html += '  <button class="btn-icon btn-danger-icon" onclick="eliminaDocumento(\'' + doc.id + '\')" title="Elimina">';
        html += '    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        html += '  </button>';
      }
      html += '</div>';
    });

    container.innerHTML = html;

  } catch (errore) {
    console.error('Errore caricamento documenti:', errore);
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function getTipoDocumentoLabel(tipo) {
  var labels = {
    'documento_identita': "Documento d'identità",
    'codice_fiscale': 'Codice Fiscale',
    'busta_paga': 'Busta Paga',
    'altro': 'Altro'
  };
  return labels[tipo] || tipo || 'Altro';
}

function apriModaleUpload() {
  document.getElementById('modale-upload').style.display = 'flex';
}

function chiudiModaleUpload() {
  document.getElementById('modale-upload').style.display = 'none';
  document.getElementById('upload-file').value = '';
  document.getElementById('upload-tipo').value = 'documento_identita';
  document.getElementById('upload-progress').style.display = 'none';
}

async function caricaDocumento() {
  var fileInput = document.getElementById('upload-file');
  var file = fileInput.files[0];
  if (!file) {
    mostraToast('Seleziona un file da caricare', 'error');
    return;
  }

  var tipo = document.getElementById('upload-tipo').value;
  var utente = getUtenteCorrente();

  // Mostra progress
  document.getElementById('upload-progress').style.display = '';

  try {
    // Crea riferimento in Firebase Storage
    var timestamp = Date.now();
    var nomeFile = timestamp + '_' + file.name;
    var storageRef = storage.ref('lead/' + leadCorrenteId + '/' + nomeFile);

    // Upload con tracking progresso
    var uploadTask = storageRef.put(file);

    uploadTask.on('state_changed',
      function(snapshot) {
        var progresso = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        document.getElementById('progress-fill').style.width = progresso + '%';
        document.getElementById('progress-text').textContent = progresso + '%';
      },
      function(errore) {
        console.error('Errore upload:', errore);
        mostraToast('Errore nel caricamento del file', 'error');
        document.getElementById('upload-progress').style.display = 'none';
      },
      async function() {
        // Upload completato
        var url = await uploadTask.snapshot.ref.getDownloadURL();

        // Salva in subcollection documenti
        await db.collection('lead').doc(leadCorrenteId).collection('documenti').add({
          nome: file.name,
          url: url,
          tipo: tipo,
          caricatoDa: utente.id,
          dataCaricamento: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Crea voce timeline
        await db.collection('lead').doc(leadCorrenteId).collection('timeline').add({
          tipo: 'documento',
          autoreId: utente.id,
          autoreNome: utente.nome + ' ' + utente.cognome,
          nota: file.name,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        mostraToast('Documento caricato con successo!', 'success');
        chiudiModaleUpload();
        await caricaDocumenti();
        await caricaTimeline();
      }
    );

  } catch (errore) {
    console.error('Errore caricamento documento:', errore);
    mostraToast('Errore nel caricamento', 'error');
    document.getElementById('upload-progress').style.display = 'none';
  }
}

async function eliminaDocumento(docId) {
  if (!confirm('Sei sicuro di voler eliminare questo documento?')) return;

  try {
    await db.collection('lead').doc(leadCorrenteId).collection('documenti').doc(docId).delete();
    mostraToast('Documento eliminato', 'success');
    await caricaDocumenti();
  } catch (errore) {
    console.error('Errore eliminazione documento:', errore);
    mostraToast('Errore nell\'eliminazione', 'error');
  }
}


// ============================================
// CONTRATTO
// ============================================

async function caricaContrattoLead() {
  try {
    var snapshot = await db.collection('contratti')
      .where('leadId', '==', leadCorrenteId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      var doc = snapshot.docs[0];
      contrattoCorrente = doc.data();
      contrattoCorrente.id = doc.id;
      popolaCampiContratto();
    }
  } catch (errore) {
    console.error('Errore caricamento contratto:', errore);
  }
}

function popolaCampiContratto() {
  if (!contrattoCorrente) return;

  document.getElementById('con-marca').value = contrattoCorrente.marca || '';
  document.getElementById('con-modello').value = contrattoCorrente.modello || '';
  document.getElementById('con-allestimento').value = contrattoCorrente.allestimento || '';
  document.getElementById('con-rata').value = contrattoCorrente.rataMensile || '';
  document.getElementById('con-durata').value = contrattoCorrente.durataMesi || '';
  document.getElementById('con-km').value = contrattoCorrente.kmAnnuiInclusi || '';
  document.getElementById('con-anticipo').value = contrattoCorrente.anticipo || '';
  document.getElementById('con-provvigione').value = contrattoCorrente.provvigioneConsulente || '';
  document.getElementById('con-fornitore').value = contrattoCorrente.fornitoreNLT || '';
  document.getElementById('con-numero').value = contrattoCorrente.numeroContratto || '';
  document.getElementById('con-note').value = contrattoCorrente.note || '';

  if (contrattoCorrente.dataFirma) {
    document.getElementById('con-data-firma').value = timestampToDateInput(contrattoCorrente.dataFirma);
  }
  if (contrattoCorrente.dataConsegnaPrevista) {
    document.getElementById('con-data-consegna').value = timestampToDateInput(contrattoCorrente.dataConsegnaPrevista);
  }
}

async function salvaContratto() {
  if (!leadCorrenteId) return;

  var utente = getUtenteCorrente();
  var datiContratto = {
    leadId: leadCorrenteId,
    consulenteId: leadCorrente.consulenteId || '',
    marca: document.getElementById('con-marca').value.trim(),
    modello: document.getElementById('con-modello').value.trim(),
    allestimento: document.getElementById('con-allestimento').value.trim(),
    rataMensile: parseFloat(document.getElementById('con-rata').value) || 0,
    durataMesi: parseInt(document.getElementById('con-durata').value) || 0,
    kmAnnuiInclusi: parseInt(document.getElementById('con-km').value) || 0,
    anticipo: parseFloat(document.getElementById('con-anticipo').value) || 0,
    provvigioneConsulente: parseFloat(document.getElementById('con-provvigione').value) || 0,
    fornitoreNLT: document.getElementById('con-fornitore').value.trim(),
    numeroContratto: document.getElementById('con-numero').value.trim(),
    note: document.getElementById('con-note').value.trim(),
    dataConsegnaEffettiva: null
  };

  // Date
  var dataFirmaVal = document.getElementById('con-data-firma').value;
  datiContratto.dataFirma = dataFirmaVal ? firebase.firestore.Timestamp.fromDate(new Date(dataFirmaVal)) : null;

  var dataConsegnaVal = document.getElementById('con-data-consegna').value;
  datiContratto.dataConsegnaPrevista = dataConsegnaVal ? firebase.firestore.Timestamp.fromDate(new Date(dataConsegnaVal)) : null;

  try {
    if (contrattoCorrente && contrattoCorrente.id) {
      // Aggiorna contratto esistente
      await db.collection('contratti').doc(contrattoCorrente.id).update(datiContratto);
    } else {
      // Crea nuovo contratto
      var docRef = await db.collection('contratti').add(datiContratto);
      contrattoCorrente = datiContratto;
      contrattoCorrente.id = docRef.id;
    }

    mostraToast('Contratto salvato con successo!', 'success');
  } catch (errore) {
    console.error('Errore salvataggio contratto:', errore);
    mostraToast('Errore nel salvataggio del contratto', 'error');
  }
}


// ============================================
// RICHIESTE BACK OFFICE
// ============================================

async function caricaRichiesteBO() {
  var container = document.getElementById('richieste-bo-list');
  var emptyEl = document.getElementById('richieste-bo-empty');

  try {
    var snapshot = await db.collection('lead').doc(leadCorrenteId)
      .collection('richiesteBO')
      .orderBy('dataRichiesta', 'desc')
      .get();

    if (snapshot.empty) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    var html = '';
    snapshot.forEach(function(doc) {
      var richiesta = doc.data();
      var dataStr = richiesta.dataRichiesta ? formattaData(richiesta.dataRichiesta.toDate()) : '—';
      var tipoLabel = richiesta.tipo === 'preventivo' ? 'Preventivo' :
                      richiesta.tipo === 'consulenza' ? 'Consulenza' : 'Fattibilità';
      var statoLabel = richiesta.stato === 'in_attesa' ? 'In attesa' :
                       richiesta.stato === 'in_lavorazione' ? 'In lavorazione' : 'Completata';
      var statoBadge = richiesta.stato === 'completata' ? 'badge-won' :
                       richiesta.stato === 'in_lavorazione' ? 'badge-working' : 'badge-contact';

      html += '<div class="richiesta-bo-item">';
      html += '  <div class="richiesta-bo-header">';
      html += '    <span class="richiesta-bo-tipo">' + escapeHtml(tipoLabel) + '</span>';
      html += '    <span class="badge ' + statoBadge + '">' + escapeHtml(statoLabel) + '</span>';
      html += '  </div>';
      html += '  <span class="richiesta-bo-data">' + dataStr + '</span>';
      if (richiesta.rispostaBO) {
        html += '  <div class="richiesta-bo-risposta">' + escapeHtml(richiesta.rispostaBO) + '</div>';
      }
      html += '</div>';
    });

    container.innerHTML = html;

  } catch (errore) {
    console.error('Errore caricamento richieste BO:', errore);
  }
}

function apriModaleRichiestaBO() {
  document.getElementById('modale-richiesta-bo').style.display = 'flex';
}

function chiudiModaleRichiestaBO() {
  document.getElementById('modale-richiesta-bo').style.display = 'none';
  document.getElementById('richiesta-bo-tipo').value = 'preventivo';
  document.getElementById('richiesta-bo-nota').value = '';
}

async function inviaRichiestaBO() {
  var tipo = document.getElementById('richiesta-bo-tipo').value;
  var nota = document.getElementById('richiesta-bo-nota').value.trim();

  if (!nota) {
    mostraToast('Inserisci una nota per la richiesta', 'error');
    return;
  }

  var utente = getUtenteCorrente();

  try {
    await db.collection('lead').doc(leadCorrenteId).collection('richiesteBO').add({
      tipo: tipo,
      stato: 'in_attesa',
      richiedenteId: utente.id,
      richiedenteNome: utente.nome + ' ' + utente.cognome,
      nota: nota,
      dataRichiesta: firebase.firestore.FieldValue.serverTimestamp(),
      rispostaBO: '',
      gestoreBOId: '',
      gestoreBONome: '',
      dataRisposta: null
    });

    // Crea voce timeline
    var tipoLabel = tipo === 'preventivo' ? 'preventivo' :
                    tipo === 'consulenza' ? 'consulenza' : 'fattibilità';

    await db.collection('lead').doc(leadCorrenteId).collection('timeline').add({
      tipo: 'richiesta_bo',
      autoreId: utente.id,
      autoreNome: utente.nome + ' ' + utente.cognome,
      nota: tipoLabel,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    mostraToast('Richiesta inviata al Back Office!', 'success');
    chiudiModaleRichiestaBO();
    await caricaRichiesteBO();
    await caricaTimeline();

  } catch (errore) {
    console.error('Errore invio richiesta BO:', errore);
    mostraToast('Errore nell\'invio della richiesta', 'error');
  }
}


// ============================================
// RIASSEGNAZIONE CONSULENTE
// ============================================

function popolaSelectRiassegna() {
  var select = document.getElementById('det-riassegna-consulente');
  if (!select) return;

  var html = '<option value="">Seleziona consulente...</option>';
  Object.values(consulentiMap).forEach(function(c) {
    var selected = (leadCorrente && leadCorrente.consulenteId === c.id) ? ' selected' : '';
    html += '<option value="' + c.id + '"' + selected + '>' + escapeHtml(c.nome + ' ' + c.cognome) + '</option>';
  });
  select.innerHTML = html;
}

async function riassegnaConsulente() {
  var nuovoConsulenteId = document.getElementById('det-riassegna-consulente').value;
  if (!nuovoConsulenteId) {
    mostraToast('Seleziona un consulente', 'error');
    return;
  }

  var utente = getUtenteCorrente();
  var nuovoConsulente = consulentiMap[nuovoConsulenteId];

  try {
    await db.collection('lead').doc(leadCorrenteId).update({
      consulenteId: nuovoConsulenteId,
      dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Timeline
    await db.collection('lead').doc(leadCorrenteId).collection('timeline').add({
      tipo: 'nota',
      autoreId: utente.id,
      autoreNome: utente.nome + ' ' + utente.cognome,
      nota: 'Lead riassegnato a ' + nuovoConsulente.nome + ' ' + nuovoConsulente.cognome,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    leadCorrente.consulenteId = nuovoConsulenteId;
    document.getElementById('det-consulente-nome').textContent = nuovoConsulente.nome + ' ' + nuovoConsulente.cognome;

    mostraToast('Consulente riassegnato!', 'success');
    await caricaTimeline();

  } catch (errore) {
    console.error('Errore riassegnazione:', errore);
    mostraToast('Errore nella riassegnazione', 'error');
  }
}


// ============================================
// AZIONI RAPIDE (WhatsApp, Email, Chiama)
// ============================================

function apriWhatsApp() {
  if (!leadCorrente || !leadCorrente.telefono) {
    mostraToast('Numero di telefono non disponibile', 'error');
    return;
  }
  var telefono = leadCorrente.telefono.replace(/\s/g, '').replace(/^\+/, '');
  if (!telefono.startsWith('39')) telefono = '39' + telefono;
  window.open('https://wa.me/' + telefono, '_blank');
}

function apriEmail() {
  if (!leadCorrente || !leadCorrente.email) {
    mostraToast('Email non disponibile', 'error');
    return;
  }
  window.open('mailto:' + leadCorrente.email);
}

function apriChiamata() {
  if (!leadCorrente || !leadCorrente.telefono) {
    mostraToast('Numero di telefono non disponibile', 'error');
    return;
  }
  window.open('tel:' + leadCorrente.telefono.replace(/\s/g, ''));
}

// >>> AGGIUNTA: registraChiamata — registra nella timeline e poi apre il dialer <<<
async function registraChiamata() {
  if (!leadCorrente || !leadCorrente.telefono) {
    mostraToast('Numero di telefono non disponibile', 'error');
    return;
  }

  var utente = getUtenteCorrente();
  var leadNome = ((leadCorrente.nome || '') + ' ' + (leadCorrente.cognome || '')).trim();

  try {
    // 1. Registra nella timeline
    await db.collection('lead').doc(leadCorrenteId).collection('timeline').add({
      tipo: 'chiamata',
      nota: 'Chiamata effettuata a ' + leadNome,
      autoreId: utente.id,
      autoreNome: utente.nome + ' ' + utente.cognome,
      leadNome: leadNome,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 2. Aggiorna data ultima modifica
    await db.collection('lead').doc(leadCorrenteId).update({
      dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 3. Apri il dialer
    window.open('tel:' + leadCorrente.telefono.replace(/\s/g, ''));

    // 4. Aggiorna timeline se visibile
    if (typeof caricaTimeline === 'function') {
      await caricaTimeline();
    }

    mostraToast('Chiamata registrata!', 'success');

  } catch (errore) {
    console.error('Errore registrazione chiamata:', errore);
    // Apri comunque il dialer anche se la registrazione fallisce
    window.open('tel:' + leadCorrente.telefono.replace(/\s/g, ''));
    mostraToast('Chiamata avviata (registrazione fallita)', 'error');
  }
}


// ============================================
// APPUNTAMENTO DA LEAD
// ============================================

function apriAgendaConLead() {
  if (!leadCorrente) return;
  var leadId = leadCorrente.id;
  var leadNome = encodeURIComponent((leadCorrente.nome || '') + ' ' + (leadCorrente.cognome || ''));
  window.location.href = 'agenda.html?nuovoEvento=true&leadId=' + leadId + '&leadNome=' + leadNome;
}


// ============================================
// TEMPLATE MESSAGGI (CORRETTO)
// ============================================

function apriModaleTemplate() {
  document.getElementById('modale-template').style.display = 'flex';
  document.getElementById('template-step-1').style.display = '';
  document.getElementById('template-step-2').style.display = 'none';
  document.getElementById('template-footer-1').style.display = '';
  document.getElementById('template-footer-2').style.display = 'none';
  caricaListaTemplate();
}

function chiudiModaleTemplate() {
  document.getElementById('modale-template').style.display = 'none';
  templateSelezionato = null;
}

async function caricaListaTemplate() {
  var container = document.getElementById('template-list');
  var emptyEl = document.getElementById('template-empty');
  var utente = getUtenteCorrente();

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Caricamento template...</p></div>';
  if (emptyEl) emptyEl.style.display = 'none';

  try {
    // Carica TUTTI i template (globali + personali)
    var snapshot = await db.collection('templateMessaggi').get();

    // Filtra: solo globali + miei personali, ordina per data
    var templates = [];
    snapshot.forEach(function(doc) {
      var t = doc.data();
      t.id = doc.id;
      if (t.utenteId === 'globale' || t.utenteId === utente.id) {
        templates.push(t);
      }
    });
    templates.sort(function(a, b) {
      var da = a.dataCreazione ? a.dataCreazione.toMillis() : 0;
      var db2 = b.dataCreazione ? b.dataCreazione.toMillis() : 0;
      return db2 - da;
    });

    if (templates.length === 0) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    var html = '';
    window._templateCache = {};

    templates.forEach(function(template) {
      window._templateCache[template.id] = template;
      var tipoLabel = template.tipo === 'whatsapp' ? 'WhatsApp' : 'Email';
      var tipoBadge = template.tipo === 'whatsapp' ? 'badge-won' : 'badge-contact';
      var globaleBadge = template.utenteId === 'globale' ? ' <span class="badge" style="font-size:0.6rem;background:#F3F4F6;color:var(--text-secondary);">GLOBALE</span>' : '';

      html += '<div class="template-item" onclick="selezionaTemplate(\'' + template.id + '\')" data-id="' + template.id + '">';
      html += '  <div class="template-item-header">';
      html += '    <span class="template-item-nome">' + escapeHtml(template.nome) + globaleBadge + '</span>';
      html += '    <span class="badge ' + tipoBadge + '">' + tipoLabel + '</span>';
      html += '  </div>';
      html += '  <div class="template-item-preview">' + escapeHtml(template.testo.substring(0, 100)) + (template.testo.length > 100 ? '...' : '') + '</div>';
      html += '</div>';
    });

    container.innerHTML = html;

  } catch (errore) {
    console.error('Errore caricamento template:', errore);
    container.innerHTML = '<div class="empty-state"><p style="color:#EF4444;">Errore nel caricamento</p></div>';
  }
}

function selezionaTemplate(templateId) {
  if (!window._templateCache || !window._templateCache[templateId]) return;

  templateSelezionato = window._templateCache[templateId];

  // Sostituisci variabili con dati del lead
  var testo = sostituisciVariabiliTemplate(templateSelezionato.testo);

  document.getElementById('template-preview').innerHTML =
    '<pre style="white-space:pre-wrap; font-family:inherit; margin:0;">' + escapeHtml(testo) + '</pre>';

  // Mostra step 2
  document.getElementById('template-step-1').style.display = 'none';
  document.getElementById('template-step-2').style.display = '';
  document.getElementById('template-footer-1').style.display = 'none';
  document.getElementById('template-footer-2').style.display = '';

  // Mostra/nascondi bottoni in base al tipo
  if (templateSelezionato.tipo === 'whatsapp') {
    document.getElementById('btn-template-wa').style.display = '';
    document.getElementById('btn-template-email').style.display = 'none';
  } else {
    document.getElementById('btn-template-wa').style.display = 'none';
    document.getElementById('btn-template-email').style.display = '';
  }
}

function tornaListaTemplate() {
  document.getElementById('template-step-1').style.display = '';
  document.getElementById('template-step-2').style.display = 'none';
  document.getElementById('template-footer-1').style.display = '';
  document.getElementById('template-footer-2').style.display = 'none';
  templateSelezionato = null;
}

function sostituisciVariabiliTemplate(testo) {
  if (!leadCorrente) return testo;

  var utente = getUtenteCorrente();
  var consulenteNome = '';
  if (leadCorrente.consulenteId && consulentiMap[leadCorrente.consulenteId]) {
    var c = consulentiMap[leadCorrente.consulenteId];
    consulenteNome = c.nome + ' ' + c.cognome;
  } else if (utente) {
    consulenteNome = utente.nome + ' ' + utente.cognome;
  }

  testo = testo.replace(/\{NOME\}/g, leadCorrente.nome || '');
  testo = testo.replace(/\{COGNOME\}/g, leadCorrente.cognome || '');
  testo = testo.replace(/\{NOME_COMPLETO\}/g, ((leadCorrente.nome || '') + ' ' + (leadCorrente.cognome || '')).trim());
  testo = testo.replace(/\{TELEFONO\}/g, leadCorrente.telefono || '');
  testo = testo.replace(/\{EMAIL\}/g, leadCorrente.email || '');
  testo = testo.replace(/\{PROVINCIA\}/g, leadCorrente.provincia || '');
  testo = testo.replace(/\{AUTO_RICHIESTA\}/g, leadCorrente.autoRichiesta || '');
  testo = testo.replace(/\{BUDGET\}/g, leadCorrente.budgetMensile || '');
  testo = testo.replace(/\{CONSULENTE\}/g, consulenteNome);

  return testo;
}

function inviaTemplateWhatsApp() {
  if (!templateSelezionato || !leadCorrente) return;

  var testo = sostituisciVariabiliTemplate(templateSelezionato.testo);
  var telefono = (leadCorrente.telefono || '').replace(/\s/g, '').replace(/^\+/, '');
  if (!telefono.startsWith('39')) telefono = '39' + telefono;

  var url = 'https://wa.me/' + telefono + '?text=' + encodeURIComponent(testo);
  window.open(url, '_blank');
  chiudiModaleTemplate();
}

function inviaTemplateEmail() {
  if (!templateSelezionato || !leadCorrente) return;

  var testo = sostituisciVariabiliTemplate(templateSelezionato.testo);
  var oggetto = templateSelezionato.oggetto || '';
  oggetto = oggetto.replace(/\{NOME\}/g, leadCorrente.nome || '').replace(/\{COGNOME\}/g, leadCorrente.cognome || '');

  var url = 'mailto:' + (leadCorrente.email || '') +
    '?subject=' + encodeURIComponent(oggetto) +
    '&body=' + encodeURIComponent(testo);
  window.open(url);
  chiudiModaleTemplate();
}


// ============================================
// TAB NAVIGATION
// ============================================

function cambiaTab(tabId) {
  // Aggiorna bottoni tab
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    }
  });

  // Aggiorna contenuti tab
  document.querySelectorAll('.tab-content').forEach(function(content) {
    content.classList.remove('active');
  });
  var tabContent = document.getElementById('tab-' + tabId);
  if (tabContent) {
    tabContent.classList.add('active');
  }
}


// ============================================
// FUNZIONI UTILITY
// ============================================

function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function formattaData(data) {
  if (!data) return '—';
  var mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return data.getDate() + ' ' + mesi[data.getMonth()] + ' ' + data.getFullYear();
}

function formattaDataOra(data) {
  if (!data) return '—';
  var mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var ore = String(data.getHours()).padStart(2, '0');
  var minuti = String(data.getMinutes()).padStart(2, '0');
  return data.getDate() + ' ' + mesi[data.getMonth()] + ' ' + data.getFullYear() + ' ' + ore + ':' + minuti;
}

function timestampToDateInput(timestamp) {
  if (!timestamp) return '';
  var data = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return data.getFullYear() + '-' +
    String(data.getMonth() + 1).padStart(2, '0') + '-' +
    String(data.getDate()).padStart(2, '0');
}

function getBadgeClass(stato) {
  var classMap = {
    'nuovo': 'badge-new',
    'in_contatto': 'badge-contact',
    'contattato': 'badge-contact',
    'interessato': 'badge-working',
    'in_lavorazione': 'badge-working',
    'analisi': 'badge-working',
    'backoffice': 'badge-bo',
    'attesa_documenti': 'badge-bo',
    'preventivo': 'badge-offer',
    'preventivo_inviato': 'badge-offer',
    'trattativa': 'badge-offer',
    'venduto': 'badge-won',
    'contratto_firmato': 'badge-won',
    'perso': 'badge-lost',
    'non_interessato': 'badge-lost',
    'appuntamento': 'badge-appointment'
  };
  return classMap[stato] || 'badge-new';
}

// Funzione toast (usa quella da utils.js se disponibile, altrimenti fallback)
if (typeof mostraToast === 'undefined') {
  function mostraToast(messaggio, tipo) {
    var container = document.getElementById('toast-container');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (tipo || 'info');
    toast.textContent = messaggio;
    container.appendChild(toast);

    setTimeout(function() {
      toast.classList.add('toast-fade-out');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }
}


// ============================================
// ESPORTAZIONE EXCEL
// ============================================

var _exportPendente = null;

/**
 * Inizializza il bottone export Excel
 */
function inizializzaExportExcel() {
  var btnExport = document.getElementById('btn-esporta-excel');
  if (btnExport) {
    btnExport.addEventListener('click', avviaExportExcel);
  }
}

/**
 * Converte il valore del select #filtro-periodo in date Da/A
 */
function calcolaDateDaPeriodo(valorePeriodo) {
  var ora = new Date();
  var dataDa = null;
  var dataA = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate(), 23, 59, 59, 999);

  switch (valorePeriodo) {
    case 'oggi':
      dataDa = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate());
      break;
    case 'settimana':
      dataDa = new Date(ora);
      dataDa.setDate(ora.getDate() - ora.getDay());
      dataDa.setHours(0, 0, 0, 0);
      break;
    case 'mese':
      dataDa = new Date(ora.getFullYear(), ora.getMonth(), 1);
      break;
    case 'trimestre':
      dataDa = new Date(ora);
      dataDa.setMonth(ora.getMonth() - 3);
      dataDa.setHours(0, 0, 0, 0);
      break;
    case 'anno':
      dataDa = new Date(ora.getFullYear(), 0, 1);
      break;
    case 'personalizzato':
      var valDa = document.getElementById('filtro-data-da').value;
      var valA = document.getElementById('filtro-data-a').value;
      if (valDa) {
        dataDa = new Date(valDa);
        dataDa.setHours(0, 0, 0, 0);
      }
      if (valA) {
        dataA = new Date(valA);
        dataA.setHours(23, 59, 59, 999);
      } else {
        dataA = null;
      }
      break;
    case 'tutti':
    default:
      dataDa = null;
      dataA = null;
      break;
  }

  return { dataDa: dataDa, dataA: dataA };
}

/**
 * Raccoglie i filtri dalla toolbar (adattato al select periodo)
 */
function raccogliFiltriExport() {
  var utenteCorrente = getUtenteCorrente();
  var filtri = {};

  // Periodo — converti il select in date
  var valorePeriodo = document.getElementById('filtro-periodo').value;
  var date = calcolaDateDaPeriodo(valorePeriodo);
  if (date.dataDa) filtri.dataDa = date.dataDa;
  if (date.dataA) filtri.dataA = date.dataA;

  // Stato
  var statoSelect = document.getElementById('filtro-stato');
  if (statoSelect && statoSelect.value && statoSelect.value !== 'tutti') {
    filtri.stato = statoSelect.value;
  }

  // Consulente
  if (utenteCorrente.ruolo === 'admin' || utenteCorrente.ruolo === 'backoffice') {
    var consulenteSelect = document.getElementById('filtro-consulente');
    if (consulenteSelect && consulenteSelect.value && consulenteSelect.value !== 'tutti') {
      filtri.consulenteId = consulenteSelect.value;
    }
  } else if (utenteCorrente.ruolo === 'consulente') {
    filtri.consulenteId = utenteCorrente.id;
  }

  return filtri;
}

/**
 * Avvia il processo di esportazione
 */
async function avviaExportExcel() {
  try {
    var filtri = raccogliFiltriExport();

    // Usa i lead già filtrati in memoria (leadFiltrati) per il conteggio
    var conteggio = leadFiltrati.length;

    if (conteggio === 0) {
      mostraToast('Nessun lead trovato con i filtri selezionati', 'warning');
      return;
    }

    // Se più di 5000, chiedi conferma
    if (conteggio > 5000) {
      _exportPendente = filtri;
      var testo = document.getElementById('export-conferma-testo');
      testo.textContent = 'Stai per esportare ' + conteggio.toLocaleString('it-IT') + ' lead. L\'operazione potrebbe richiedere qualche secondo. Continuare?';
      document.getElementById('modal-export-conferma').style.display = 'flex';
      return;
    }

    await eseguiExport(filtri);

  } catch (errore) {
    console.error('Errore export:', errore);
    mostraToast('Errore durante l\'esportazione', 'error');
    nascondiOverlayExport();
  }
}

/**
 * Conferma export dopo modale (per > 5000 lead)
 */
async function confermaExport() {
  chiudiModaleExport();
  if (_exportPendente) {
    await eseguiExport(_exportPendente);
    _exportPendente = null;
  }
}

function chiudiModaleExport() {
  document.getElementById('modal-export-conferma').style.display = 'none';
}

/**
 * Esegue l'export: usa i lead già filtrati in memoria + carica campagne per i nomi
 */
async function eseguiExport(filtri) {
  mostraOverlayExport();

  try {
    // Carica mappa campagne (ID → nome) per la colonna Campagna
    var campagneMap = await caricaMappaCampagneExport();

    // Carica mappa completa utenti (include anche admin/bo, non solo consulenti)
    var utentiMapExport = {};
    // Usa consulentiMap già presente
    Object.keys(consulentiMap).forEach(function(id) {
      var c = consulentiMap[id];
      utentiMapExport[id] = (c.nome || '') + ' ' + (c.cognome || '');
    });

    // Prepara le righe dal array leadFiltrati (già in memoria, già filtrati)
    var righe = [];
    leadFiltrati.forEach(function(l) {
      righe.push({
        'ID': l.id || '',
        'Nome': l.nome || '',
        'Cognome': l.cognome || '',
        'Telefono': l.telefono || '',
        'Email': l.email || '',
        'Provincia': l.provincia || '',
        'Stato': (statiMap[l.stato] ? statiMap[l.stato].nome : l.stato) || '',
        'Fase': l.fase || '',
        'Priorità': l.priorita || '',
        'Consulente': utentiMapExport[l.consulenteId] || l.consulenteNome || '',
        'Fonte': l.fonte || '',
        'Campagna': campagneMap[l.campagna] || l.campagna || '',
        'Tipo Cliente': l.tipoCliente || '',
        'Auto Richiesta': l.autoRichiesta || '',
        'Budget Mensile': l.budgetMensile || '',
        'Durata Desiderata': l.durataDesiderata || '',
        'Km Annui': l.kmAnnui || '',
        'Data Creazione': formattaTimestampExport(l.dataCreazione),
        'Data Ultima Modifica': formattaTimestampExport(l.dataUltimaModifica),
        'Data Chiusura': formattaTimestampExport(l.dataChiusura),
        'Note Esigenza': l.noteEsigenza || ''
      });
    });

    if (righe.length === 0) {
      mostraToast('Nessun lead trovato con i filtri selezionati', 'warning');
      nascondiOverlayExport();
      return;
    }

    // Genera il foglio Excel
    var ws = XLSX.utils.json_to_sheet(righe);

    // Larghezze colonne
    ws['!cols'] = [
      { wch: 22 },  // ID
      { wch: 15 },  // Nome
      { wch: 15 },  // Cognome
      { wch: 14 },  // Telefono
      { wch: 25 },  // Email
      { wch: 12 },  // Provincia
      { wch: 15 },  // Stato
      { wch: 15 },  // Fase
      { wch: 10 },  // Priorità
      { wch: 18 },  // Consulente
      { wch: 10 },  // Fonte
      { wch: 22 },  // Campagna
      { wch: 12 },  // Tipo Cliente
      { wch: 18 },  // Auto Richiesta
      { wch: 14 },  // Budget Mensile
      { wch: 16 },  // Durata Desiderata
      { wch: 10 },  // Km Annui
      { wch: 18 },  // Data Creazione
      { wch: 18 },  // Data Ultima Modifica
      { wch: 18 },  // Data Chiusura
      { wch: 30 }   // Note Esigenza
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lead');

    // Genera nome file
    var nomeFile = generaNomeFileExport(filtri, utentiMapExport);

    // Scarica
    XLSX.writeFile(wb, nomeFile);

    nascondiOverlayExport();
    mostraToast('✓ Esportati ' + righe.length + ' lead', 'success');

  } catch (errore) {
    console.error('Errore durante export:', errore);
    nascondiOverlayExport();
    mostraToast('Errore durante l\'esportazione. Riprova.', 'error');
  }
}

/**
 * Carica mappa ID campagna → nome campagna
 */
async function caricaMappaCampagneExport() {
  var mappa = {};
  try {
    var snapshot = await db.collection('campagne').get();
    snapshot.forEach(function(doc) {
      var c = doc.data();
      mappa[doc.id] = c.nome || doc.id;
    });
  } catch (e) {
    console.error('Errore caricamento campagne per export:', e);
  }
  return mappa;
}

/**
 * Formatta un Timestamp Firestore in "GG/MM/AAAA HH:mm"
 */
function formattaTimestampExport(timestamp) {
  if (!timestamp) return '';
  var data;
  if (timestamp.toDate) {
    data = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    data = timestamp;
  } else {
    return '';
  }
  var gg = String(data.getDate()).padStart(2, '0');
  var mm = String(data.getMonth() + 1).padStart(2, '0');
  var aaaa = data.getFullYear();
  var hh = String(data.getHours()).padStart(2, '0');
  var min = String(data.getMinutes()).padStart(2, '0');
  return gg + '/' + mm + '/' + aaaa + ' ' + hh + ':' + min;
}

/**
 * Genera nome file: lead_export_DD-MM-YYYY_DD-MM-YYYY[_NomeConsulente].xlsx
 */
function generaNomeFileExport(filtri, utentiMap) {
  var oggi = new Date();

  function fmtData(d) {
    var gg = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var aaaa = d.getFullYear();
    return gg + '-' + mm + '-' + aaaa;
  }

  var dataDaStr = filtri.dataDa ? fmtData(filtri.dataDa) : fmtData(new Date(oggi.getFullYear(), oggi.getMonth(), 1));
  var dataAStr = filtri.dataA ? fmtData(filtri.dataA) : fmtData(oggi);

  var nome = 'lead_export_' + dataDaStr + '_' + dataAStr;

  // Aggiungi nome consulente se filtrato
  if (filtri.consulenteId && utentiMap[filtri.consulenteId]) {
    var nomeConsulente = utentiMap[filtri.consulenteId].trim().split(' ')[0];
    nome += '_' + nomeConsulente;
  }

  return nome + '.xlsx';
}

function mostraOverlayExport() {
  var overlay = document.getElementById('export-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function nascondiOverlayExport() {
  var overlay = document.getElementById('export-overlay');
  if (overlay) overlay.style.display = 'none';
}
