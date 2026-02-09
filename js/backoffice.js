// =============================================
// backoffice.js — Logica pannello Back Office
// =============================================

// Riferimenti globali
const db = firebase.firestore();
let utenteCorrente = null;

// Dati in memoria
let richiesteAttesa = [];
let richiesteLavorazione = [];
let praticheLead = [];

// =============================================
// INIZIALIZZAZIONE
// =============================================

document.addEventListener('DOMContentLoaded', async function () {
  // Verifica autenticazione
  utenteCorrente = getUtenteCorrente();
  if (!utenteCorrente) {
    window.location.href = 'index.html';
    return;
  }

  // Solo backoffice e admin possono accedere
  if (utenteCorrente.ruolo !== 'backoffice' && utenteCorrente.ruolo !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  // Imposta info utente nella sidebar
  impostaSidebar();

  // Imposta tab
  impostaTab();

  // Carica dati
  await caricaTutto();
});

// =============================================
// SIDEBAR
// =============================================

function impostaSidebar() {
  const nome = utenteCorrente.nome + ' ' + utenteCorrente.cognome;
  document.getElementById('sidebar-user-name').textContent = nome;
  document.getElementById('sidebar-user-role').textContent =
    utenteCorrente.ruolo.charAt(0).toUpperCase() + utenteCorrente.ruolo.slice(1);
  document.getElementById('sidebar-user-avatar').textContent =
    (utenteCorrente.nome.charAt(0) + utenteCorrente.cognome.charAt(0)).toUpperCase();

  // Mostra sezione admin se admin
  if (utenteCorrente.ruolo === 'admin') {
    document.getElementById('sidebar-admin-section').style.display = '';
    document.getElementById('sidebar-admin-nav').style.display = '';
  }

  // Controlla comunicazioni non lette
  controllaComunicazioniNonLette();
}

async function controllaComunicazioniNonLette() {
  try {
    const snapshot = await db.collection('comunicazioni').get();
    let nonLette = 0;
    snapshot.forEach(function (doc) {
      const data = doc.data();
      if (!data.lettoDa || !data.lettoDa.includes(utenteCorrente.id)) {
        nonLette++;
      }
    });
    const badge = document.getElementById('badge-comunicazioni');
    if (nonLette > 0) {
      badge.textContent = nonLette;
      badge.style.display = '';
    }
  } catch (e) {
    // Silenzioso
  }
}

// =============================================
// GESTIONE TAB
// =============================================

function impostaTab() {
  const tabs = document.querySelectorAll('.bo-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      // Rimuovi active da tutti i tab
      tabs.forEach(function (t) { t.classList.remove('active'); });
      // Nascondi tutti i contenuti
      document.querySelectorAll('.bo-tab-content').forEach(function (c) {
        c.classList.remove('active');
      });

      // Attiva tab cliccato
      tab.classList.add('active');
      var tabName = tab.getAttribute('data-tab');
      document.getElementById('content-' + tabName).classList.add('active');
    });
  });
}

// =============================================
// CARICAMENTO DATI
// =============================================

async function caricaTutto() {
  mostraLoading();
  try {
    await Promise.all([
      caricaRichiesteAttesa(),
      caricaRichiesteLavorazione(),
      caricaPratiche()
    ]);
  } catch (e) {
    mostraToast('Errore nel caricamento dati', 'errore');
  }
  nascondiLoading();
}

// --- Richieste in attesa ---
async function caricaRichiesteAttesa() {
  richiesteAttesa = [];

  // Prendo tutti i lead
  const leadSnapshot = await db.collection('lead').get();

  for (const leadDoc of leadSnapshot.docs) {
    const leadData = leadDoc.data();
    const leadId = leadDoc.id;

    // Prendo le richieste BO di questo lead
    const richiesteSnap = await db.collection('lead').doc(leadId)
      .collection('richiesteBO')
      .where('stato', '==', 'in_attesa')
      .get();

    richiesteSnap.forEach(function (richDoc) {
      const richData = richDoc.data();
      richiesteAttesa.push({
        richiestaId: richDoc.id,
        leadId: leadId,
        nomeCliente: (leadData.nome || '') + ' ' + (leadData.cognome || ''),
        autoRichiesta: leadData.autoRichiesta || '',
        tipo: richData.tipo || 'preventivo',
        richiedenteNome: richData.richiedenteNome || '',
        nota: richData.nota || '',
        dataRichiesta: richData.dataRichiesta
      });
    });
  }

  // Ordina: più vecchie prima
  richiesteAttesa.sort(function (a, b) {
    var da = a.dataRichiesta ? a.dataRichiesta.toDate().getTime() : 0;
    var db2 = b.dataRichiesta ? b.dataRichiesta.toDate().getTime() : 0;
    return da - db2;
  });

  renderRichiesteAttesa();
  aggiornaContatore('attesa', richiesteAttesa.length);
}

// --- Richieste in lavorazione ---
async function caricaRichiesteLavorazione() {
  richiesteLavorazione = [];

  const leadSnapshot = await db.collection('lead').get();

  for (const leadDoc of leadSnapshot.docs) {
    const leadData = leadDoc.data();
    const leadId = leadDoc.id;

    let query = db.collection('lead').doc(leadId)
      .collection('richiesteBO')
      .where('stato', '==', 'in_lavorazione');

    // Se non è admin, mostra solo le proprie
    if (utenteCorrente.ruolo !== 'admin') {
      query = query.where('gestoreBOId', '==', utenteCorrente.id);
    }

    const richiesteSnap = await query.get();

    richiesteSnap.forEach(function (richDoc) {
      const richData = richDoc.data();
      richiesteLavorazione.push({
        richiestaId: richDoc.id,
        leadId: leadId,
        nomeCliente: (leadData.nome || '') + ' ' + (leadData.cognome || ''),
        autoRichiesta: leadData.autoRichiesta || '',
        tipo: richData.tipo || 'preventivo',
        richiedenteNome: richData.richiedenteNome || '',
        nota: richData.nota || '',
        dataRichiesta: richData.dataRichiesta,
        gestoreBONome: richData.gestoreBONome || ''
      });
    });
  }

  // Ordina: più vecchie prima
  richiesteLavorazione.sort(function (a, b) {
    var da = a.dataRichiesta ? a.dataRichiesta.toDate().getTime() : 0;
    var db2 = b.dataRichiesta ? b.dataRichiesta.toDate().getTime() : 0;
    return da - db2;
  });

  renderRichiesteLavorazione();
  aggiornaContatore('lavorazione', richiesteLavorazione.length);
}

// --- Pratiche ---
async function caricaPratiche() {
  praticheLead = [];

  const leadSnapshot = await db.collection('lead')
    .where('fase', '==', 'perfezionamento')
    .get();

  for (const leadDoc of leadSnapshot.docs) {
    const leadData = leadDoc.data();
    const leadId = leadDoc.id;

    // Carica documenti del lead
    const docSnap = await db.collection('lead').doc(leadId)
      .collection('documenti').get();

    var documenti = [];
    docSnap.forEach(function (d) {
      documenti.push(d.data());
    });

    // Cerca il consulente
    var consulenteNome = '';
    if (leadData.consulenteId) {
      try {
        var consDoc = await db.collection('utenti').doc(leadData.consulenteId).get();
        if (consDoc.exists) {
          var consData = consDoc.data();
          consulenteNome = (consData.nome || '') + ' ' + (consData.cognome || '');
        }
      } catch (e) { /* Silenzioso */ }
    }

    praticheLead.push({
      leadId: leadId,
      nomeCliente: (leadData.nome || '') + ' ' + (leadData.cognome || ''),
      autoRichiesta: leadData.autoRichiesta || '',
      consulenteId: leadData.consulenteId || '',
      consulenteNome: consulenteNome,
      stato: leadData.stato || '',
      fase: leadData.fase || '',
      dataUltimaModifica: leadData.dataUltimaModifica,
      documenti: documenti
    });
  }

  renderPratiche();
  aggiornaContatore('pratiche', praticheLead.length);
}

// =============================================
// RENDER: RICHIESTE IN ATTESA
// =============================================

function renderRichiesteAttesa() {
  var container = document.getElementById('lista-attesa');
  var emptyState = document.getElementById('empty-attesa');

  if (richiesteAttesa.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = richiesteAttesa.map(function (r) {
    return creaCardRichiestaAttesa(r);
  }).join('');
}

function creaCardRichiestaAttesa(r) {
  var badgeClass = getBadgeTipoClass(r.tipo);
  var tipoLabel = getTipoLabel(r.tipo);
  var dataStr = r.dataRichiesta ? formattaData(r.dataRichiesta.toDate()) : '—';

  return '<div class="card bo-card fade-in">' +
    '<div class="bo-card-header">' +
      '<a href="lead-dettaglio.html?id=' + r.leadId + '" class="bo-card-cliente">' +
        escapeHtml(r.nomeCliente) +
      '</a>' +
      '<span class="badge ' + badgeClass + '">' + tipoLabel + '</span>' +
    '</div>' +
    '<div class="bo-card-meta">' +
      '<div class="bo-card-meta-item">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '<span>Richiesto da: <strong>' + escapeHtml(r.richiedenteNome) + '</strong></span>' +
      '</div>' +
      '<div class="bo-card-meta-item">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '<span>' + dataStr + '</span>' +
      '</div>' +
    '</div>' +
    (r.nota ? '<div class="bo-card-nota">' +
      '<p>' + escapeHtml(r.nota) + '</p>' +
    '</div>' : '') +
    '<div class="bo-card-actions">' +
      '<button class="btn btn-primary" onclick="prendiInCarico(\'' + r.leadId + '\', \'' + r.richiestaId + '\')">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' +
        ' Prendi in carico' +
      '</button>' +
    '</div>' +
  '</div>';
}

// =============================================
// RENDER: IN LAVORAZIONE
// =============================================

function renderRichiesteLavorazione() {
  var container = document.getElementById('lista-lavorazione');
  var emptyState = document.getElementById('empty-lavorazione');

  if (richiesteLavorazione.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = richiesteLavorazione.map(function (r) {
    return creaCardLavorazione(r);
  }).join('');
}

function creaCardLavorazione(r) {
  var badgeClass = getBadgeTipoClass(r.tipo);
  var tipoLabel = getTipoLabel(r.tipo);
  var dataStr = r.dataRichiesta ? formattaData(r.dataRichiesta.toDate()) : '—';
  // ID univoco per la textarea
  var textareaId = 'risposta-' + r.leadId + '-' + r.richiestaId;

  return '<div class="card bo-card fade-in">' +
    '<div class="bo-card-header">' +
      '<a href="lead-dettaglio.html?id=' + r.leadId + '" class="bo-card-cliente">' +
        escapeHtml(r.nomeCliente) +
      '</a>' +
      '<span class="badge ' + badgeClass + '">' + tipoLabel + '</span>' +
    '</div>' +
    '<div class="bo-card-meta">' +
      '<div class="bo-card-meta-item">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '<span>Richiesto da: <strong>' + escapeHtml(r.richiedenteNome) + '</strong></span>' +
      '</div>' +
      '<div class="bo-card-meta-item">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '<span>' + dataStr + '</span>' +
      '</div>' +
    '</div>' +
    (r.nota ? '<div class="bo-card-nota">' +
      '<p>' + escapeHtml(r.nota) + '</p>' +
    '</div>' : '') +
    '<div class="bo-card-risposta">' +
      '<label class="form-label">La tua risposta</label>' +
      '<textarea class="form-input" id="' + textareaId + '" rows="3" placeholder="Scrivi la tua risposta..."></textarea>' +
      '<div class="bo-card-actions" style="margin-top: 12px;">' +
        '<button class="btn btn-primary" onclick="inviaRisposta(\'' + r.leadId + '\', \'' + r.richiestaId + '\', \'' + textareaId + '\', \'' + escapeHtml(r.tipo) + '\')">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
          ' Invia risposta' +
        '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// =============================================
// RENDER: PRATICHE
// =============================================

function renderPratiche() {
  var container = document.getElementById('lista-pratiche');
  var emptyState = document.getElementById('empty-pratiche');

  if (praticheLead.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = praticheLead.map(function (p) {
    return creaCardPratica(p);
  }).join('');
}

function creaCardPratica(p) {
  var dataStr = p.dataUltimaModifica ? formattaData(p.dataUltimaModifica.toDate()) : '—';

  // Checklist documenti
  var tipiDoc = [
    { tipo: 'documento_identita', label: 'Documento identità' },
    { tipo: 'codice_fiscale', label: 'Codice fiscale' },
    { tipo: 'busta_paga', label: 'Busta paga / Doc. reddituale' },
    { tipo: 'altro', label: 'Altro documento' }
  ];

  var checklistHtml = tipiDoc.map(function (td) {
    var trovato = p.documenti.some(function (d) { return d.tipo === td.tipo; });
    var icon = trovato
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
    return '<div class="bo-checklist-item ' + (trovato ? 'completato' : '') + '">' +
      icon + '<span>' + td.label + '</span></div>';
  }).join('');

  // ID per textarea note
  var noteId = 'note-pratica-' + p.leadId;

  return '<div class="card bo-card bo-card-pratica fade-in">' +
    '<div class="bo-card-header">' +
      '<a href="lead-dettaglio.html?id=' + p.leadId + '" class="bo-card-cliente">' +
        escapeHtml(p.nomeCliente) +
      '</a>' +
      '<span class="badge badge-working">' + escapeHtml(p.stato || 'perfezionamento') + '</span>' +
    '</div>' +
    '<div class="bo-card-meta">' +
      (p.autoRichiesta ? '<div class="bo-card-meta-item">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' +
        '<span>' + escapeHtml(p.autoRichiesta) + '</span>' +
      '</div>' : '') +
      (p.consulenteNome ? '<div class="bo-card-meta-item">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '<span>Consulente: <strong>' + escapeHtml(p.consulenteNome) + '</strong></span>' +
      '</div>' : '') +
      '<div class="bo-card-meta-item">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '<span>Ultima modifica: ' + dataStr + '</span>' +
      '</div>' +
    '</div>' +
    // Checklist documenti
    '<div class="bo-checklist-section">' +
      '<label class="form-label">Documenti</label>' +
      '<div class="bo-checklist">' + checklistHtml + '</div>' +
    '</div>' +
    // Note pratica
    '<div class="bo-card-risposta">' +
      '<label class="form-label">Note pratica</label>' +
      '<textarea class="form-input" id="' + noteId + '" rows="2" placeholder="Note interne sulla pratica..."></textarea>' +
    '</div>' +
    // Azioni pratica
    '<div class="bo-card-actions bo-card-actions-pratiche">' +
      '<button class="btn btn-secondary" onclick="richiediDocumenti(\'' + p.leadId + '\')">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
        ' Richiedi documenti' +
      '</button>' +
      '<button class="btn btn-secondary" onclick="documentiOK(\'' + p.leadId + '\')" style="color: #10B981; border-color: #10B981;">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
        ' Documenti OK' +
      '</button>' +
      '<button class="btn btn-primary" onclick="praticaCompletata(\'' + p.leadId + '\', \'' + (p.consulenteId || '') + '\')">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
        ' Pratica completata' +
      '</button>' +
    '</div>' +
  '</div>';
}

// =============================================
// AZIONI: PRENDI IN CARICO
// =============================================

async function prendiInCarico(leadId, richiestaId) {
  try {
    await db.collection('lead').doc(leadId)
      .collection('richiesteBO').doc(richiestaId)
      .update({
        stato: 'in_lavorazione',
        gestoreBOId: utenteCorrente.id,
        gestoreBONome: utenteCorrente.nome + ' ' + utenteCorrente.cognome
      });

    mostraToast('Richiesta presa in carico', 'successo');
    await caricaRichiesteAttesa();
    await caricaRichiesteLavorazione();
  } catch (e) {
    mostraToast('Errore: ' + e.message, 'errore');
  }
}

// =============================================
// AZIONI: INVIA RISPOSTA
// =============================================

async function inviaRisposta(leadId, richiestaId, textareaId, tipo) {
  var textarea = document.getElementById(textareaId);
  var risposta = textarea ? textarea.value.trim() : '';

  if (!risposta) {
    mostraToast('Scrivi una risposta prima di inviare', 'errore');
    return;
  }

  try {
    var now = firebase.firestore.FieldValue.serverTimestamp();

    // 1. Aggiorna richiesta BO
    await db.collection('lead').doc(leadId)
      .collection('richiesteBO').doc(richiestaId)
      .update({
        stato: 'completata',
        rispostaBO: risposta,
        dataRisposta: now
      });

    // 2. Aggiungi record nella timeline del lead
    await db.collection('lead').doc(leadId)
      .collection('timeline').add({
        tipo: 'risposta_bo',
        nota: 'Risposta Back Office: ' + tipo + ' — ' + risposta,
        autoreId: utenteCorrente.id,
        autoreNome: utenteCorrente.nome + ' ' + utenteCorrente.cognome,
        timestamp: now
      });

    mostraToast('Risposta inviata', 'successo');
    await caricaRichiesteLavorazione();
  } catch (e) {
    mostraToast('Errore: ' + e.message, 'errore');
  }
}

// =============================================
// AZIONI: PRATICHE
// =============================================

async function richiediDocumenti(leadId) {
  try {
    var now = firebase.firestore.FieldValue.serverTimestamp();

    // Aggiorna stato lead
    await db.collection('lead').doc(leadId).update({
      stato: 'in_attesa_documenti',
      dataUltimaModifica: now
    });

    // Aggiungi record timeline
    await db.collection('lead').doc(leadId)
      .collection('timeline').add({
        tipo: 'cambio_stato',
        statoNew: 'in_attesa_documenti',
        nota: 'Back Office ha richiesto i documenti al cliente',
        autoreId: utenteCorrente.id,
        autoreNome: utenteCorrente.nome + ' ' + utenteCorrente.cognome,
        timestamp: now
      });

    mostraToast('Richiesta documenti inviata', 'successo');
    await caricaPratiche();
  } catch (e) {
    mostraToast('Errore: ' + e.message, 'errore');
  }
}

async function documentiOK(leadId) {
  try {
    var now = firebase.firestore.FieldValue.serverTimestamp();

    await db.collection('lead').doc(leadId).update({
      stato: 'documenti_verificati',
      dataUltimaModifica: now
    });

    await db.collection('lead').doc(leadId)
      .collection('timeline').add({
        tipo: 'cambio_stato',
        statoNew: 'documenti_verificati',
        nota: 'Documenti verificati dal Back Office',
        autoreId: utenteCorrente.id,
        autoreNome: utenteCorrente.nome + ' ' + utenteCorrente.cognome,
        timestamp: now
      });

    mostraToast('Documenti verificati', 'successo');
    await caricaPratiche();
  } catch (e) {
    mostraToast('Errore: ' + e.message, 'errore');
  }
}

// =============================================
// AZIONI: PRATICA COMPLETATA → MODALE CONTRATTO
// =============================================

var praticaCorrenteLeadId = null;
var praticaCorrenteConsulenteId = null;

function praticaCompletata(leadId, consulenteId) {
  praticaCorrenteLeadId = leadId;
  praticaCorrenteConsulenteId = consulenteId;

  // Prepopola data firma con oggi
  var oggi = new Date().toISOString().split('T')[0];
  document.getElementById('contratto-data-firma').value = oggi;

  // Reset form
  document.getElementById('form-contratto').reset();
  document.getElementById('contratto-data-firma').value = oggi;
  document.getElementById('contratto-lead-id').value = leadId;
  document.getElementById('contratto-consulente-id').value = consulenteId;

  // Apri modale
  document.getElementById('modal-contratto').style.display = 'flex';
}

function chiudiModaleContratto() {
  document.getElementById('modal-contratto').style.display = 'none';
  praticaCorrenteLeadId = null;
  praticaCorrenteConsulenteId = null;
}

async function salvaContratto() {
  var leadId = document.getElementById('contratto-lead-id').value;
  var consulenteId = document.getElementById('contratto-consulente-id').value;

  var marca = document.getElementById('contratto-marca').value.trim();
  var modello = document.getElementById('contratto-modello').value.trim();
  var rata = document.getElementById('contratto-rata').value;
  var durata = document.getElementById('contratto-durata').value;
  var km = document.getElementById('contratto-km').value;

  // Validazione minima
  if (!marca || !modello || !rata || !durata || !km) {
    mostraToast('Compila i campi obbligatori (Marca, Modello, Rata, Durata, Km)', 'errore');
    return;
  }

  try {
    var now = firebase.firestore.FieldValue.serverTimestamp();

    // Prepara date
    var dataFirma = document.getElementById('contratto-data-firma').value;
    var dataConsegna = document.getElementById('contratto-data-consegna').value;

    // 1. Salva contratto
    await db.collection('contratti').add({
      leadId: leadId,
      consulenteId: consulenteId,
      marca: marca,
      modello: modello,
      allestimento: document.getElementById('contratto-allestimento').value.trim(),
      rataMensile: parseFloat(rata) || 0,
      durataMesi: parseInt(durata) || 0,
      kmAnnuiInclusi: parseInt(km) || 0,
      anticipo: parseFloat(document.getElementById('contratto-anticipo').value) || 0,
      provvigioneConsulente: parseFloat(document.getElementById('contratto-provvigione').value) || 0,
      fornitoreNLT: document.getElementById('contratto-fornitore').value.trim(),
      numeroContratto: document.getElementById('contratto-numero').value.trim(),
      dataFirma: dataFirma ? firebase.firestore.Timestamp.fromDate(new Date(dataFirma)) : now,
      dataConsegnaPrevista: dataConsegna ? firebase.firestore.Timestamp.fromDate(new Date(dataConsegna)) : null,
      dataConsegnaEffettiva: null,
      note: document.getElementById('contratto-note').value.trim()
    });

    // 2. Aggiorna lead → venduto
    await db.collection('lead').doc(leadId).update({
      stato: 'venduto',
      fase: 'chiusura',
      dataUltimaModifica: now,
      dataChiusura: now
    });

    // 3. Aggiungi record timeline
    await db.collection('lead').doc(leadId)
      .collection('timeline').add({
        tipo: 'cambio_stato',
        statoNew: 'venduto',
        nota: 'Contratto registrato — ' + marca + ' ' + modello + ' | Rata: €' + rata + '/mese',
        autoreId: utenteCorrente.id,
        autoreNome: utenteCorrente.nome + ' ' + utenteCorrente.cognome,
        timestamp: now
      });

    mostraToast('Contratto registrato! 🎉', 'successo');
    chiudiModaleContratto();
    await caricaPratiche();
  } catch (e) {
    mostraToast('Errore: ' + e.message, 'errore');
  }
}

// =============================================
// UTILITY
// =============================================

function aggiornaContatore(tab, numero) {
  document.getElementById('count-' + tab).textContent = numero;
}

function getBadgeTipoClass(tipo) {
  switch (tipo) {
    case 'preventivo': return 'badge-bo';
    case 'consulenza': return 'badge-contact';
    case 'fattibilita': return 'badge-appointment';
    default: return 'badge-working';
  }
}

function getTipoLabel(tipo) {
  switch (tipo) {
    case 'preventivo': return 'Preventivo';
    case 'consulenza': return 'Consulenza';
    case 'fattibilita': return 'Fattibilità';
    default: return tipo;
  }
}

function formattaData(date) {
  if (!date) return '—';
  var giorno = String(date.getDate()).padStart(2, '0');
  var mese = String(date.getMonth() + 1).padStart(2, '0');
  var anno = date.getFullYear();
  var ore = String(date.getHours()).padStart(2, '0');
  var minuti = String(date.getMinutes()).padStart(2, '0');
  return giorno + '/' + mese + '/' + anno + ' ' + ore + ':' + minuti;
}

function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =============================================
// TOAST
// =============================================

function mostraToast(messaggio, tipo) {
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + (tipo || 'info');

  var iconSvg = '';
  if (tipo === 'successo') {
    iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  } else if (tipo === 'errore') {
    iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else {
    iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  toast.innerHTML = iconSvg + '<span>' + messaggio + '</span>';
  container.appendChild(toast);

  // Rimuovi dopo 3.5 secondi
  setTimeout(function () {
    toast.classList.add('toast-hide');
    setTimeout(function () { toast.remove(); }, 300);
  }, 3500);
}

// =============================================
// LOADING
// =============================================

function mostraLoading() {
  // Mostra skeleton nelle card grid
  var grids = document.querySelectorAll('.bo-cards-grid');
  grids.forEach(function (grid) {
    grid.innerHTML =
      '<div class="card bo-card skeleton-card"><div class="skeleton" style="height:20px;width:60%;margin-bottom:12px;border-radius:4px;"></div><div class="skeleton" style="height:14px;width:80%;margin-bottom:8px;border-radius:4px;"></div><div class="skeleton" style="height:14px;width:40%;border-radius:4px;"></div></div>' +
      '<div class="card bo-card skeleton-card"><div class="skeleton" style="height:20px;width:50%;margin-bottom:12px;border-radius:4px;"></div><div class="skeleton" style="height:14px;width:70%;margin-bottom:8px;border-radius:4px;"></div><div class="skeleton" style="height:14px;width:35%;border-radius:4px;"></div></div>';
  });
}

function nascondiLoading() {
  // Il loading viene sostituito dal render reale
}
