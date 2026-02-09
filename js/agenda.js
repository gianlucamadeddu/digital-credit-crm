// ===== AGENDA.JS — Logica Calendario Digital Credit CRM =====

// Stato globale
let meseCorrente = new Date().getMonth();
let annoCorrente = new Date().getFullYear();
let giornoSelezionato = null;
let eventiMese = [];
let leadCache = [];
let eventoInModifica = null;

// Nomi mesi italiani
const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

// Tipi evento con colori e etichette
const TIPI_EVENTO = {
  appuntamento: { label: 'Appuntamento cliente', emoji: '📘', colore: '#3B82F6' },
  followup: { label: 'Follow-up', emoji: '📙', colore: '#F59E0B' },
  scadenza_personale: { label: 'Scadenza personale', emoji: '📗', colore: '#10B981' },
  scadenza_pratica: { label: 'Scadenza pratica', emoji: '📕', colore: '#EF4444' }
};

// ===== INIZIALIZZAZIONE =====
document.addEventListener('DOMContentLoaded', async function() {
  // Verifica autenticazione
  const utente = getUtenteCorrente();
  if (!utente) {
    window.location.href = 'index.html';
    return;
  }

  // Aggiorna info sidebar
  aggiornaInfoUtente(utente);

  // Nascondi voci menu per ruolo
  gestisciMenuPerRuolo(utente);

  // Mostra filtro consulente solo per admin/BO
  if (utente.ruolo === 'admin' || utente.ruolo === 'backoffice') {
    document.getElementById('filtro-consulente-container').style.display = 'block';
    await caricaConsulentiFiltro();
  }

  // Event listener
  document.getElementById('btn-prev-month').addEventListener('click', mesePrecedente);
  document.getElementById('btn-next-month').addEventListener('click', meseSuccessivo);
  document.getElementById('btn-oggi').addEventListener('click', vaiAOggi);
  document.getElementById('btn-nuovo-evento').addEventListener('click', () => apriModaleNuovoEvento());
  document.getElementById('btn-salva-evento').addEventListener('click', salvaEvento);
  document.getElementById('btn-elimina-evento').addEventListener('click', eliminaEvento);
  document.getElementById('btn-modifica-evento').addEventListener('click', modificaEvento);

  // Filtro consulente
  document.getElementById('filtro-consulente').addEventListener('change', () => {
    caricaEventiMese();
  });

  // Ricerca lead nel form
  setupRicercaLead();

  // Chiudi modale cliccando fuori
  document.getElementById('modal-evento').addEventListener('click', function(e) {
    if (e.target === this) chiudiModaleEvento();
  });
  document.getElementById('modal-dettaglio-evento').addEventListener('click', function(e) {
    if (e.target === this) chiudiModaleDettaglio();
  });

  // Carica cache lead
  await caricaCacheLead();

  // Renderizza calendario
  await caricaEventiMese();
  renderCalendario();

  // Seleziona oggi di default
  const oggi = new Date();
  if (oggi.getMonth() === meseCorrente && oggi.getFullYear() === annoCorrente) {
    selezionaGiorno(oggi.getDate(), meseCorrente, annoCorrente);
  }

  // Controlla parametri URL per apertura automatica modale
  controllaParametriURL();
});

// ===== GESTIONE UTENTE E MENU =====
function aggiornaInfoUtente(utente) {
  const iniziale = (utente.nome || 'U').charAt(0).toUpperCase();
  document.getElementById('user-avatar').textContent = iniziale;
  document.getElementById('user-name-sidebar').textContent = `${utente.nome} ${utente.cognome}`;
  const ruoliLabel = { admin: 'Amministratore', consulente: 'Consulente', backoffice: 'Back Office' };
  document.getElementById('user-role-sidebar').textContent = ruoliLabel[utente.ruolo] || utente.ruolo;
}

function gestisciMenuPerRuolo(utente) {
  if (utente.ruolo === 'consulente') {
    const navImp = document.getElementById('nav-impostazioni');
    if (navImp) navImp.style.display = 'none';
  }
  if (utente.ruolo !== 'admin' && utente.ruolo !== 'backoffice') {
    const navBO = document.getElementById('nav-backoffice');
    if (navBO) navBO.style.display = 'none';
  }
}

// ===== NAVIGAZIONE MESE =====
function mesePrecedente() {
  meseCorrente--;
  if (meseCorrente < 0) { meseCorrente = 11; annoCorrente--; }
  caricaEventiMese().then(() => renderCalendario());
}

function meseSuccessivo() {
  meseCorrente++;
  if (meseCorrente > 11) { meseCorrente = 0; annoCorrente++; }
  caricaEventiMese().then(() => renderCalendario());
}

function vaiAOggi() {
  const oggi = new Date();
  meseCorrente = oggi.getMonth();
  annoCorrente = oggi.getFullYear();
  caricaEventiMese().then(() => {
    renderCalendario();
    selezionaGiorno(oggi.getDate(), meseCorrente, annoCorrente);
  });
}

// ===== CARICAMENTO DATI =====
async function caricaEventiMese() {
  const utente = getUtenteCorrente();
  const db = firebase.firestore();

  // Calcola range date del mese
  const inizio = new Date(annoCorrente, meseCorrente, 1);
  const fine = new Date(annoCorrente, meseCorrente + 1, 0, 23, 59, 59);

  try {
    let query = db.collection('appuntamenti')
      .where('dataOra', '>=', inizio)
      .where('dataOra', '<=', fine);

    const snapshot = await query.get();
    let eventi = [];

    snapshot.forEach(doc => {
      eventi.push({ id: doc.id, ...doc.data() });
    });

    // Filtro per ruolo
    if (utente.ruolo === 'consulente') {
      eventi = eventi.filter(e => e.utenteId === utente.id);
    }

    // Filtro per consulente selezionato (admin/BO)
    const filtroConsulente = document.getElementById('filtro-consulente').value;
    if (filtroConsulente) {
      eventi = eventi.filter(e => e.utenteId === filtroConsulente);
    }

    eventiMese = eventi;
  } catch (errore) {
    console.error('Errore caricamento eventi:', errore);
    eventiMese = [];
  }
}

async function caricaCacheLead() {
  const utente = getUtenteCorrente();
  const db = firebase.firestore();

  try {
    let query = db.collection('lead');
    if (utente.ruolo === 'consulente') {
      query = query.where('consulenteId', '==', utente.id);
    }

    const snapshot = await query.get();
    leadCache = [];
    snapshot.forEach(doc => {
      leadCache.push({ id: doc.id, ...doc.data() });
    });
  } catch (errore) {
    console.error('Errore caricamento lead:', errore);
    leadCache = [];
  }
}

async function caricaConsulentiFiltro() {
  const db = firebase.firestore();
  try {
    const snapshot = await db.collection('utenti')
      .where('ruolo', '==', 'consulente')
      .where('attivo', '==', true)
      .get();

    const select = document.getElementById('filtro-consulente');
    snapshot.forEach(doc => {
      const u = doc.data();
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = `${u.nome} ${u.cognome}`;
      select.appendChild(opt);
    });
  } catch (errore) {
    console.error('Errore caricamento consulenti:', errore);
  }
}

// ===== RENDER CALENDARIO =====
function renderCalendario() {
  // Aggiorna etichetta mese
  document.getElementById('month-label').textContent = `${MESI[meseCorrente]} ${annoCorrente}`;

  const body = document.getElementById('calendar-body');
  body.innerHTML = '';

  const primoGiorno = new Date(annoCorrente, meseCorrente, 1);
  const ultimoGiorno = new Date(annoCorrente, meseCorrente + 1, 0);

  // Calcola giorno della settimana del primo giorno (Lun=0, Dom=6)
  let giornoInizio = primoGiorno.getDay() - 1;
  if (giornoInizio < 0) giornoInizio = 6;

  const giorniTotali = ultimoGiorno.getDate();
  const oggi = new Date();

  // Giorni del mese precedente
  const mesePrevUltimo = new Date(annoCorrente, meseCorrente, 0).getDate();
  for (let i = giornoInizio - 1; i >= 0; i--) {
    const giorno = mesePrevUltimo - i;
    const cella = creaCellaCalendario(giorno, meseCorrente - 1, annoCorrente, true);
    body.appendChild(cella);
  }

  // Giorni del mese corrente
  for (let g = 1; g <= giorniTotali; g++) {
    const isOggi = g === oggi.getDate() && meseCorrente === oggi.getMonth() && annoCorrente === oggi.getFullYear();
    const cella = creaCellaCalendario(g, meseCorrente, annoCorrente, false, isOggi);
    body.appendChild(cella);
  }

  // Giorni del mese successivo per completare la griglia
  const celleTotali = body.children.length;
  const righeNecessarie = Math.ceil(celleTotali / 7);
  const celleFinali = righeNecessarie * 7;

  for (let i = 1; celleTotali + i - 1 < celleFinali; i++) {
    const cella = creaCellaCalendario(i, meseCorrente + 1, annoCorrente, true);
    body.appendChild(cella);
  }
}

function creaCellaCalendario(giorno, mese, anno, altroMese, isOggi) {
  const cella = document.createElement('div');
  cella.className = 'calendar-cell';
  if (altroMese) cella.classList.add('other-month');
  if (isOggi) cella.classList.add('today');

  // Controlla se è il giorno selezionato
  if (giornoSelezionato && 
      giorno === giornoSelezionato.giorno && 
      mese === giornoSelezionato.mese && 
      anno === giornoSelezionato.anno) {
    cella.classList.add('selected');
  }

  // Numero giorno
  const numDiv = document.createElement('div');
  numDiv.className = 'day-number';
  numDiv.textContent = giorno;
  cella.appendChild(numDiv);

  // Eventi del giorno
  if (!altroMese) {
    const eventiGiorno = getEventiGiorno(giorno);
    if (eventiGiorno.length > 0) {
      const eventsDiv = document.createElement('div');
      eventsDiv.className = 'day-events';

      const maxVisibili = 3;
      eventiGiorno.slice(0, maxVisibili).forEach(ev => {
        const dotDiv = document.createElement('div');
        dotDiv.className = `day-event-dot bg-${ev.tipo}`;
        dotDiv.innerHTML = `<span class="dot dot-${ev.tipo}"></span><span class="event-title-mini">${escapeHtml(ev.titolo)}</span>`;
        eventsDiv.appendChild(dotDiv);
      });

      if (eventiGiorno.length > maxVisibili) {
        const moreDiv = document.createElement('div');
        moreDiv.className = 'day-events-more';
        moreDiv.textContent = `+${eventiGiorno.length - maxVisibili} altri`;
        eventsDiv.appendChild(moreDiv);
      }

      cella.appendChild(eventsDiv);
    }
  }

  // Click sul giorno
  cella.addEventListener('click', () => {
    if (!altroMese) {
      selezionaGiorno(giorno, mese, anno);
    }
  });

  // Doppio click per nuovo evento
  cella.addEventListener('dblclick', () => {
    if (!altroMese) {
      const data = `${anno}-${String(mese + 1).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
      apriModaleNuovoEvento(data);
    }
  });

  return cella;
}

function getEventiGiorno(giorno) {
  return eventiMese.filter(ev => {
    const dataEvento = ev.dataOra.toDate ? ev.dataOra.toDate() : new Date(ev.dataOra);
    return dataEvento.getDate() === giorno;
  }).sort((a, b) => {
    const da = a.dataOra.toDate ? a.dataOra.toDate() : new Date(a.dataOra);
    const db_date = b.dataOra.toDate ? b.dataOra.toDate() : new Date(b.dataOra);
    return da - db_date;
  });
}

// ===== SELEZIONE GIORNO =====
function selezionaGiorno(giorno, mese, anno) {
  giornoSelezionato = { giorno, mese, anno };

  // Aggiorna selezione visiva
  document.querySelectorAll('.calendar-cell').forEach(c => c.classList.remove('selected'));
  // Trova la cella corretta
  const celle = document.querySelectorAll('.calendar-cell:not(.other-month)');
  celle.forEach(c => {
    const num = parseInt(c.querySelector('.day-number').textContent);
    if (num === giorno) c.classList.add('selected');
  });

  // Aggiorna pannello laterale
  renderDettaglioGiorno(giorno, mese, anno);
}

function renderDettaglioGiorno(giorno, mese, anno) {
  const titolo = document.getElementById('day-detail-title');
  const contenuto = document.getElementById('day-detail-content');

  // Formatta data
  const data = new Date(anno, mese, giorno);
  const opzioni = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  titolo.textContent = data.toLocaleDateString('it-IT', opzioni);
  titolo.style.textTransform = 'capitalize';

  const eventi = getEventiGiorno(giorno);

  if (eventi.length === 0) {
    contenuto.innerHTML = `
      <div class="empty-day-message">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <p>Nessun evento per questo giorno</p>
      </div>`;
    return;
  }

  let html = '';
  eventi.forEach(ev => {
    const dataEvento = ev.dataOra.toDate ? ev.dataOra.toDate() : new Date(ev.dataOra);
    const ora = dataEvento.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const completedClass = ev.completato ? ' completed' : '';

    html += `
      <div class="day-event-item" onclick="apriDettaglioEvento('${ev.id}')">
        <div class="day-event-time">${ora}</div>
        <div class="day-event-dot-big dot-${ev.tipo}"></div>
        <div class="day-event-info">
          <div class="day-event-name${completedClass}">${escapeHtml(ev.titolo)}</div>
          ${ev.leadId && ev.leadNome ? `<a href="lead-dettaglio.html?id=${ev.leadId}" class="day-event-lead-link" onclick="event.stopPropagation();">${escapeHtml(ev.leadNome)} →</a>` : ''}
        </div>
      </div>`;
  });

  contenuto.innerHTML = html;
}

// ===== MODALE NUOVO EVENTO =====
function apriModaleNuovoEvento(dataPrecompilata, leadId, leadNome) {
  eventoInModifica = null;
  document.getElementById('modal-evento-title').textContent = 'Nuovo Evento';

  // Reset form
  document.getElementById('evento-tipo').value = 'appuntamento';
  document.getElementById('evento-titolo').value = '';
  document.getElementById('evento-descrizione').value = '';
  document.getElementById('evento-ora').value = '09:00';
  document.getElementById('evento-durata').value = '30';
  document.getElementById('evento-lead-search').value = '';
  document.getElementById('evento-lead-id').value = '';
  document.getElementById('evento-lead-nome').value = '';
  document.getElementById('lead-selected-container').style.display = 'none';
  document.getElementById('evento-lead-search').style.display = 'block';

  // Data precompilata
  if (dataPrecompilata) {
    document.getElementById('evento-data').value = dataPrecompilata;
  } else if (giornoSelezionato) {
    const g = String(giornoSelezionato.giorno).padStart(2, '0');
    const m = String(giornoSelezionato.mese + 1).padStart(2, '0');
    document.getElementById('evento-data').value = `${giornoSelezionato.anno}-${m}-${g}`;
  } else {
    document.getElementById('evento-data').value = new Date().toISOString().split('T')[0];
  }

  // Lead precompilato (da URL o da parametri)
  if (leadId && leadNome) {
    document.getElementById('evento-lead-id').value = leadId;
    document.getElementById('evento-lead-nome').value = leadNome;
    document.getElementById('lead-selected-name').textContent = leadNome;
    document.getElementById('lead-selected-container').style.display = 'block';
    document.getElementById('evento-lead-search').style.display = 'none';
    document.getElementById('evento-titolo').value = `Appuntamento con ${leadNome}`;
  }

  document.getElementById('modal-evento').classList.add('active');
}

function chiudiModaleEvento() {
  document.getElementById('modal-evento').classList.remove('active');
  eventoInModifica = null;
}

// ===== SALVATAGGIO EVENTO =====
async function salvaEvento() {
  const utente = getUtenteCorrente();
  const tipo = document.getElementById('evento-tipo').value;
  const titolo = document.getElementById('evento-titolo').value.trim();
  const descrizione = document.getElementById('evento-descrizione').value.trim();
  const data = document.getElementById('evento-data').value;
  const ora = document.getElementById('evento-ora').value;
  const durata = parseInt(document.getElementById('evento-durata').value);
  const leadId = document.getElementById('evento-lead-id').value || null;
  const leadNome = document.getElementById('evento-lead-nome').value || null;

  // Validazione
  if (!titolo) {
    mostraToast('Inserisci un titolo', 'error');
    return;
  }
  if (!data) {
    mostraToast('Seleziona una data', 'error');
    return;
  }

  // Crea timestamp
  const [anno, mese, giorno] = data.split('-').map(Number);
  const [ore, minuti] = ora.split(':').map(Number);
  const dataOra = new Date(anno, mese - 1, giorno, ore, minuti);

  const datiEvento = {
    tipo: tipo,
    titolo: titolo,
    descrizione: descrizione,
    dataOra: firebase.firestore.Timestamp.fromDate(dataOra),
    durata: durata,
    leadId: leadId,
    leadNome: leadNome,
    utenteId: utente.id,
    completato: false,
    dataCreazione: firebase.firestore.Timestamp.now()
  };

  try {
    const db = firebase.firestore();

    if (eventoInModifica) {
      // Aggiornamento
      await db.collection('appuntamenti').doc(eventoInModifica).update(datiEvento);
      mostraToast('Evento aggiornato', 'success');
    } else {
      // Nuovo evento
      await db.collection('appuntamenti').add(datiEvento);
      mostraToast('Evento creato', 'success');
    }

    chiudiModaleEvento();
    await caricaEventiMese();
    renderCalendario();

    // Aggiorna pannello laterale se un giorno è selezionato
    if (giornoSelezionato) {
      renderDettaglioGiorno(giornoSelezionato.giorno, giornoSelezionato.mese, giornoSelezionato.anno);
    }
  } catch (errore) {
    console.error('Errore salvataggio evento:', errore);
    mostraToast('Errore nel salvataggio', 'error');
  }
}

// ===== DETTAGLIO EVENTO =====
function apriDettaglioEvento(eventoId) {
  const evento = eventiMese.find(e => e.id === eventoId);
  if (!evento) return;

  const dataEvento = evento.dataOra.toDate ? evento.dataOra.toDate() : new Date(evento.dataOra);
  const tipoInfo = TIPI_EVENTO[evento.tipo] || { label: evento.tipo, emoji: '📌' };

  const body = document.getElementById('modal-dettaglio-body');
  document.getElementById('modal-dettaglio-title').textContent = evento.titolo;

  let html = `
    <div class="event-detail-section">
      <div class="event-detail-label">Tipo</div>
      <div class="event-detail-value">${tipoInfo.emoji} ${tipoInfo.label}</div>
    </div>
    <div class="event-detail-section">
      <div class="event-detail-label">Data e ora</div>
      <div class="event-detail-value">${dataEvento.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} alle ${dataEvento.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</div>
    </div>
    <div class="event-detail-section">
      <div class="event-detail-label">Durata</div>
      <div class="event-detail-value">${evento.durata} minuti</div>
    </div>`;

  if (evento.descrizione) {
    html += `
    <div class="event-detail-section">
      <div class="event-detail-label">Descrizione</div>
      <div class="event-detail-value">${escapeHtml(evento.descrizione)}</div>
    </div>`;
  }

  if (evento.leadId && evento.leadNome) {
    html += `
    <div class="event-detail-section">
      <div class="event-detail-label">Lead collegato</div>
      <a href="lead-dettaglio.html?id=${evento.leadId}" class="event-lead-link-big">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        Vai all'anagrafica di ${escapeHtml(evento.leadNome)} →
      </a>
    </div>`;
  }

  html += `
    <div class="event-detail-section" style="margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--border-color);">
      <label class="checkbox-label">
        <input type="checkbox" id="check-completato" ${evento.completato ? 'checked' : ''} onchange="toggleCompletato('${eventoId}', this.checked)">
        Segna come completato
      </label>
    </div>`;

  body.innerHTML = html;

  // Salva ID per modifica/elimina
  document.getElementById('btn-elimina-evento').dataset.eventoId = eventoId;
  document.getElementById('btn-modifica-evento').dataset.eventoId = eventoId;

  document.getElementById('modal-dettaglio-evento').classList.add('active');
}

function chiudiModaleDettaglio() {
  document.getElementById('modal-dettaglio-evento').classList.remove('active');
}

// ===== TOGGLE COMPLETATO =====
async function toggleCompletato(eventoId, completato) {
  try {
    const db = firebase.firestore();
    await db.collection('appuntamenti').doc(eventoId).update({ completato: completato });

    // Aggiorna cache locale
    const ev = eventiMese.find(e => e.id === eventoId);
    if (ev) ev.completato = completato;

    // Aggiorna pannello laterale
    if (giornoSelezionato) {
      renderDettaglioGiorno(giornoSelezionato.giorno, giornoSelezionato.mese, giornoSelezionato.anno);
    }

    mostraToast(completato ? 'Evento completato' : 'Evento riaperto', 'success');
  } catch (errore) {
    console.error('Errore aggiornamento:', errore);
    mostraToast('Errore nell\'aggiornamento', 'error');
  }
}

// ===== ELIMINA EVENTO =====
async function eliminaEvento() {
  const eventoId = document.getElementById('btn-elimina-evento').dataset.eventoId;
  if (!eventoId) return;

  if (!confirm('Sei sicuro di voler eliminare questo evento?')) return;

  try {
    const db = firebase.firestore();
    await db.collection('appuntamenti').doc(eventoId).delete();

    chiudiModaleDettaglio();
    mostraToast('Evento eliminato', 'success');

    await caricaEventiMese();
    renderCalendario();

    if (giornoSelezionato) {
      renderDettaglioGiorno(giornoSelezionato.giorno, giornoSelezionato.mese, giornoSelezionato.anno);
    }
  } catch (errore) {
    console.error('Errore eliminazione:', errore);
    mostraToast('Errore nell\'eliminazione', 'error');
  }
}

// ===== MODIFICA EVENTO =====
function modificaEvento() {
  const eventoId = document.getElementById('btn-modifica-evento').dataset.eventoId;
  const evento = eventiMese.find(e => e.id === eventoId);
  if (!evento) return;

  chiudiModaleDettaglio();

  eventoInModifica = eventoId;
  document.getElementById('modal-evento-title').textContent = 'Modifica Evento';

  // Popola form
  document.getElementById('evento-tipo').value = evento.tipo;
  document.getElementById('evento-titolo').value = evento.titolo;
  document.getElementById('evento-descrizione').value = evento.descrizione || '';
  document.getElementById('evento-durata').value = evento.durata || 30;

  const dataEvento = evento.dataOra.toDate ? evento.dataOra.toDate() : new Date(evento.dataOra);
  const y = dataEvento.getFullYear();
  const m = String(dataEvento.getMonth() + 1).padStart(2, '0');
  const d = String(dataEvento.getDate()).padStart(2, '0');
  document.getElementById('evento-data').value = `${y}-${m}-${d}`;
  document.getElementById('evento-ora').value = `${String(dataEvento.getHours()).padStart(2, '0')}:${String(dataEvento.getMinutes()).padStart(2, '0')}`;

  // Lead collegato
  if (evento.leadId && evento.leadNome) {
    document.getElementById('evento-lead-id').value = evento.leadId;
    document.getElementById('evento-lead-nome').value = evento.leadNome;
    document.getElementById('lead-selected-name').textContent = evento.leadNome;
    document.getElementById('lead-selected-container').style.display = 'block';
    document.getElementById('evento-lead-search').style.display = 'none';
  } else {
    document.getElementById('evento-lead-id').value = '';
    document.getElementById('evento-lead-nome').value = '';
    document.getElementById('lead-selected-container').style.display = 'none';
    document.getElementById('evento-lead-search').style.display = 'block';
    document.getElementById('evento-lead-search').value = '';
  }

  document.getElementById('modal-evento').classList.add('active');
}

// ===== RICERCA LEAD =====
function setupRicercaLead() {
  const input = document.getElementById('evento-lead-search');
  const dropdown = document.getElementById('lead-search-dropdown');

  let debounceTimer;

  input.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    const query = this.value.trim().toLowerCase();

    if (query.length < 2) {
      dropdown.classList.remove('show');
      return;
    }

    debounceTimer = setTimeout(() => {
      const risultati = leadCache.filter(l => {
        const nomeCompleto = `${l.nome} ${l.cognome}`.toLowerCase();
        return nomeCompleto.includes(query) || 
               (l.telefono && l.telefono.includes(query)) ||
               (l.email && l.email.toLowerCase().includes(query));
      }).slice(0, 8);

      if (risultati.length === 0) {
        dropdown.innerHTML = '<div class="lead-search-option"><span class="lead-detail">Nessun lead trovato</span></div>';
      } else {
        dropdown.innerHTML = risultati.map(l => `
          <div class="lead-search-option" onclick="selezionaLead('${l.id}', '${escapeHtml(`${l.nome} ${l.cognome}`)}')">
            <div class="lead-name">${escapeHtml(l.nome)} ${escapeHtml(l.cognome)}</div>
            <div class="lead-detail">${l.telefono || ''} ${l.autoRichiesta ? '• ' + l.autoRichiesta : ''}</div>
          </div>`).join('');
      }

      dropdown.classList.add('show');
    }, 200);
  });

  // Chiudi dropdown cliccando fuori
  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
}

function selezionaLead(id, nome) {
  document.getElementById('evento-lead-id').value = id;
  document.getElementById('evento-lead-nome').value = nome;
  document.getElementById('lead-selected-name').textContent = nome;
  document.getElementById('lead-selected-container').style.display = 'block';
  document.getElementById('evento-lead-search').style.display = 'none';
  document.getElementById('lead-search-dropdown').classList.remove('show');
}

function rimuoviLeadSelezionato() {
  document.getElementById('evento-lead-id').value = '';
  document.getElementById('evento-lead-nome').value = '';
  document.getElementById('lead-selected-container').style.display = 'none';
  document.getElementById('evento-lead-search').style.display = 'block';
  document.getElementById('evento-lead-search').value = '';
}

// ===== PARAMETRI URL =====
function controllaParametriURL() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('nuovoEvento') === 'true') {
    const leadId = params.get('leadId') || null;
    const leadNome = params.get('leadNome') ? decodeURIComponent(params.get('leadNome')) : null;

    // Piccolo ritardo per assicurare che il DOM sia pronto
    setTimeout(() => {
      apriModaleNuovoEvento(null, leadId, leadNome);
    }, 300);

    // Pulisci URL
    window.history.replaceState({}, document.title, 'agenda.html');
  }
}

// ===== UTILITY =====
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function mostraToast(messaggio, tipo) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${tipo || 'success'}`;
  toast.innerHTML = `<span class="toast-message">${messaggio}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
