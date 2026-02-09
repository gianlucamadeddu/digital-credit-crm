// report.js — Logica pagina Report
// Digital Credit CRM

// Variabili globali per i grafici
let chartFonti = null;
let chartStati = null;

// Dati caricati
let leadCaricati = [];
let contrattiCaricati = [];
let attivitaCaricate = [];
let utentiMap = {};
let statiMap = {};

document.addEventListener('DOMContentLoaded', async function () {
  // Verifica autenticazione
  const utente = getUtenteCorrente();
  if (!utente) {
    window.location.href = 'index.html';
    return;
  }

  // Configura sidebar e UI
  configuraSidebar(utente);

  // Imposta date default (mese corrente)
  impostaDateDefault();

  // Carica filtri (consulenti, campagne)
  await caricaFiltri(utente);

  // Carica stati
  await caricaStati();

  // Event listeners
  document.getElementById('btn-genera-report').addEventListener('click', generaReport);
  document.getElementById('btn-esporta-csv').addEventListener('click', esportaCsv);
  document.getElementById('btn-carica-attivita').addEventListener('click', caricaAttivitaGiornaliere);
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Tab navigation
  document.querySelectorAll('.report-tab').forEach(tab => {
    tab.addEventListener('click', function () {
      cambiaTab(this.dataset.tab);
    });
  });

  // Genera report iniziale
  await generaReport();
});

// --- CONFIGURAZIONE ---

function impostaDateDefault() {
  const oggi = new Date();
  const primoMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1);

  document.getElementById('filtro-data-da').value = formattaDataInput(primoMese);
  document.getElementById('filtro-data-a').value = formattaDataInput(oggi);
}

async function caricaFiltri(utente) {
  // Mostra filtro consulente solo per admin
  if (utente.ruolo === 'admin') {
    document.getElementById('filtro-consulente-container').style.display = 'block';
    document.getElementById('tabella-performance-container').style.display = 'block';
    document.getElementById('filtro-attivita-utente-container').style.display = 'block';

    // Carica lista consulenti
    try {
      const snapshot = await db.collection('utenti').where('attivo', '==', true).get();
      const selectConsulente = document.getElementById('filtro-consulente');
      const selectAttivitaUtente = document.getElementById('filtro-attivita-utente');

      snapshot.forEach(doc => {
        const u = doc.data();
        utentiMap[doc.id] = u;

        const option1 = document.createElement('option');
        option1.value = doc.id;
        option1.textContent = u.nome + ' ' + u.cognome;
        selectConsulente.appendChild(option1);

        const option2 = option1.cloneNode(true);
        selectAttivitaUtente.appendChild(option2);
      });
    } catch (errore) {
      console.error('Errore caricamento utenti:', errore);
    }
  } else {
    // Per consulenti e BO carica comunque la mappa utenti per i nomi
    try {
      const snapshot = await db.collection('utenti').where('attivo', '==', true).get();
      snapshot.forEach(doc => {
        utentiMap[doc.id] = doc.data();
      });
    } catch (e) {
      console.error('Errore caricamento utenti:', e);
    }
  }

  // Carica campagne
  try {
    const campagneSnap = await db.collection('campagne').get();
    const selectCampagna = document.getElementById('filtro-campagna');

    campagneSnap.forEach(doc => {
      const c = doc.data();
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = c.nome;
      selectCampagna.appendChild(option);
    });
  } catch (errore) {
    console.error('Errore caricamento campagne:', errore);
  }
}

async function caricaStati() {
  try {
    const snapshot = await db.collection('stati').orderBy('posizione').get();
    snapshot.forEach(doc => {
      statiMap[doc.id] = doc.data();
    });
  } catch (errore) {
    console.error('Errore caricamento stati:', errore);
  }
}

// --- TAB NAVIGATION ---

function cambiaTab(tabId) {
  // Aggiorna bottoni tab
  document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.report-tab[data-tab="${tabId}"]`).classList.add('active');

  // Aggiorna contenuti
  document.querySelectorAll('.report-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tabId).classList.add('active');
}

// --- GENERA REPORT ---

async function generaReport() {
  const utente = getUtenteCorrente();
  const dataDa = document.getElementById('filtro-data-da').value;
  const dataA = document.getElementById('filtro-data-a').value;
  const consulenteId = document.getElementById('filtro-consulente') ? document.getElementById('filtro-consulente').value : '';
  const campagnaId = document.getElementById('filtro-campagna').value;

  if (!dataDa || !dataA) {
    mostraToast('Seleziona un periodo valido', 'errore');
    return;
  }

  const btnGenera = document.getElementById('btn-genera-report');
  btnGenera.disabled = true;
  btnGenera.textContent = 'Caricamento...';

  try {
    const dataInizio = new Date(dataDa);
    dataInizio.setHours(0, 0, 0, 0);
    const dataFine = new Date(dataA);
    dataFine.setHours(23, 59, 59, 999);

    // Carica lead nel periodo
    let queryLead = db.collection('lead')
      .where('dataCreazione', '>=', firebase.firestore.Timestamp.fromDate(dataInizio))
      .where('dataCreazione', '<=', firebase.firestore.Timestamp.fromDate(dataFine));

    const leadSnapshot = await queryLead.get();
    leadCaricati = [];
    leadSnapshot.forEach(doc => {
      leadCaricati.push({ id: doc.id, ...doc.data() });
    });

    // Filtro per consulente (client-side)
    if (consulenteId) {
      leadCaricati = leadCaricati.filter(l => l.consulenteId === consulenteId);
    }
    // Filtro per ruolo consulente: vede solo i propri
    if (utente.ruolo === 'consulente') {
      leadCaricati = leadCaricati.filter(l => l.consulenteId === utente.id);
    }
    // Filtro per campagna
    if (campagnaId) {
      leadCaricati = leadCaricati.filter(l => l.campagna === campagnaId);
    }

    // Carica contratti nel periodo
    let queryContratti = db.collection('contratti')
      .where('dataFirma', '>=', firebase.firestore.Timestamp.fromDate(dataInizio))
      .where('dataFirma', '<=', firebase.firestore.Timestamp.fromDate(dataFine));

    const contrattiSnapshot = await queryContratti.get();
    contrattiCaricati = [];
    contrattiSnapshot.forEach(doc => {
      contrattiCaricati.push({ id: doc.id, ...doc.data() });
    });

    // Filtro contratti per consulente
    if (consulenteId) {
      contrattiCaricati = contrattiCaricati.filter(c => c.consulenteId === consulenteId);
    }
    if (utente.ruolo === 'consulente') {
      contrattiCaricati = contrattiCaricati.filter(c => c.consulenteId === utente.id);
    }

    // Carica attività (timeline di tutti i lead)
    await caricaAttivitaDaTimeline(dataInizio, dataFine, consulenteId || (utente.ruolo === 'consulente' ? utente.id : ''));

    // Aggiorna tutte le sezioni
    aggiornaPerformance(utente, consulenteId, dataInizio, dataFine);
    aggiornaStatistiche();
    aggiornaGrafici();
    if (utente.ruolo === 'admin') {
      aggiornaTabellaPerformance();
    }
    aggiornaAttivitaGiornaliere();

  } catch (errore) {
    console.error('Errore generazione report:', errore);
    mostraToast('Errore nella generazione del report', 'errore');
  } finally {
    btnGenera.disabled = false;
    btnGenera.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      Genera Report
    `;
  }
}

// --- CARICAMENTO ATTIVITA' DA TIMELINE ---

async function caricaAttivitaDaTimeline(dataInizio, dataFine, filtroUtenteId) {
  attivitaCaricate = [];

  try {
    // Prendi tutti i lead (non solo quelli nel periodo, perché le attività possono essere su lead vecchi)
    const leadIds = [];
    const allLeadSnapshot = await db.collection('lead').get();
    allLeadSnapshot.forEach(doc => leadIds.push(doc.id));

    // Per ogni lead, carica la timeline nel periodo
    // Nota: con molti lead questo potrebbe essere lento. In produzione usa collection separata.
    const batchSize = 10;
    for (let i = 0; i < leadIds.length; i += batchSize) {
      const batch = leadIds.slice(i, i + batchSize);
      const promises = batch.map(async (leadId) => {
        try {
          const timelineSnapshot = await db.collection('lead').doc(leadId).collection('timeline')
            .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(dataInizio))
            .where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(dataFine))
            .orderBy('timestamp', 'desc')
            .get();

          timelineSnapshot.forEach(doc => {
            const att = doc.data();
            if (!filtroUtenteId || att.autoreId === filtroUtenteId) {
              attivitaCaricate.push({
                ...att,
                leadId: leadId
              });
            }
          });
        } catch (e) {
          // Timeline potrebbe non esistere per alcuni lead
        }
      });
      await Promise.all(promises);
    }

    // Ordina per timestamp decrescente
    attivitaCaricate.sort((a, b) => {
      const tA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
      const tB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
      return tB - tA;
    });

  } catch (errore) {
    console.error('Errore caricamento attività:', errore);
  }
}

// --- TAB 1: PERFORMANCE ---

function aggiornaPerformance(utente, consulenteId, dataInizio, dataFine) {
  // Lead recuperati: lead che sono passati da "nuovo" a un altro stato
  const leadRecuperati = leadCaricati.filter(l => l.stato !== 'nuovo').length;
  document.getElementById('perf-lead-recuperati').textContent = leadRecuperati;

  // Chiamate nel periodo
  const chiamate = attivitaCaricate.filter(a => a.tipo === 'chiamata').length;
  document.getElementById('perf-chiamate').textContent = chiamate;

  // Tempo medio recupero
  let tempoTotale = 0;
  let countRecuperati = 0;
  attivitaCaricate.forEach(att => {
    if (att.tipo === 'cambio_stato' && att.statoOld === 'nuovo') {
      const lead = leadCaricati.find(l => l.id === att.leadId);
      if (lead && lead.dataCreazione && att.timestamp) {
        const dataLead = lead.dataCreazione.toDate ? lead.dataCreazione.toDate() : new Date(lead.dataCreazione);
        const dataRecupero = att.timestamp.toDate ? att.timestamp.toDate() : new Date(att.timestamp);
        const diffGiorni = (dataRecupero - dataLead) / (1000 * 60 * 60 * 24);
        tempoTotale += diffGiorni;
        countRecuperati++;
      }
    }
  });
  const tempoMedio = countRecuperati > 0 ? (tempoTotale / countRecuperati).toFixed(1) : '-';
  document.getElementById('perf-tempo-medio').textContent = tempoMedio + ' giorni';

  // Best Day Performance (giorno con più chiamate)
  const chiamatePerGiorno = {};
  attivitaCaricate.filter(a => a.tipo === 'chiamata').forEach(att => {
    const data = att.timestamp ? (att.timestamp.toDate ? att.timestamp.toDate() : new Date(att.timestamp)) : null;
    if (data) {
      const chiave = data.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
      chiamatePerGiorno[chiave] = (chiamatePerGiorno[chiave] || 0) + 1;
    }
  });

  let bestDay = '-';
  let maxChiamate = 0;
  Object.entries(chiamatePerGiorno).forEach(([giorno, count]) => {
    if (count > maxChiamate) {
      maxChiamate = count;
      bestDay = giorno + ' (' + count + ' chiamate)';
    }
  });
  document.getElementById('perf-best-day').textContent = bestDay;

  // Pipeline stati
  aggiornaPipeline();

  // Trend settimanale
  aggiornaTrendSettimanale();

  // Obiettivo settimanale
  const obiettivoSettimanale = 80;
  const chiamateSettimana = contaChiamateSettimanaCorrente();
  const percentuale = Math.min(100, Math.round((chiamateSettimana / obiettivoSettimanale) * 100));
  document.getElementById('obiettivo-progresso').textContent = chiamateSettimana + '/' + obiettivoSettimanale;
  document.getElementById('obiettivo-barra').style.width = percentuale + '%';
  document.getElementById('obiettivo-barra').style.background = percentuale >= 100 ? '#10B981' : '#3B82F6';
}

function aggiornaPipeline() {
  const container = document.getElementById('pipeline-stati');
  const totale = leadCaricati.length || 1;

  // Conta lead per stato
  const conteggioStati = {};
  leadCaricati.forEach(l => {
    conteggioStati[l.stato] = (conteggioStati[l.stato] || 0) + 1;
  });

  let html = '';
  Object.entries(statiMap).forEach(([id, stato]) => {
    const count = conteggioStati[id] || 0;
    const perc = Math.round((count / totale) * 100);
    const colore = stato.colore || '#6B7280';

    html += `
      <div class="pipeline-item">
        <div class="pipeline-info">
          <span class="pipeline-dot" style="background: ${colore}"></span>
          <span class="pipeline-nome">${escapeHtml(stato.nome)}</span>
        </div>
        <div class="pipeline-barra-container">
          <div class="pipeline-barra" style="width: ${perc}%; background: ${colore}"></div>
        </div>
        <span class="pipeline-valore">${count} (${perc}%)</span>
      </div>
    `;
  });

  container.innerHTML = html || '<p style="color: var(--text-secondary);">Nessun dato disponibile</p>';

  // Insights
  generaInsights(conteggioStati, totale);
}

function generaInsights(conteggioStati, totale) {
  const insightsBox = document.getElementById('insights-box');
  const insightsList = document.getElementById('insights-list');
  const insights = [];

  const nuovi = conteggioStati['nuovo'] || 0;
  const percNuovi = Math.round((nuovi / totale) * 100);
  if (percNuovi > 30) {
    insights.push('🔥 Molti lead nuovi da processare (' + percNuovi + '%)');
  }

  const recuperati = leadCaricati.filter(l => l.stato !== 'nuovo').length;
  const percRecuperati = Math.round((recuperati / totale) * 100);
  if (percRecuperati < 10 && totale > 5) {
    insights.push('⚠️ Tasso recupero basso (' + percRecuperati + '%), ottimizzare approach');
  }

  const venduti = conteggioStati['venduto'] || 0;
  const percVenduti = Math.round((venduti / totale) * 100);
  if (percVenduti > 15) {
    insights.push('✅ Ottimo tasso di conversione (' + percVenduti + '%)');
  }

  if (insights.length > 0) {
    insightsBox.style.display = 'block';
    insightsList.innerHTML = insights.map(i => `<p class="insight-item">${i}</p>`).join('');
  } else {
    insightsBox.style.display = 'none';
  }
}

function aggiornaTrendSettimanale() {
  const container = document.getElementById('trend-settimanale');
  const giorniSettimana = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

  // Conta attività per giorno della settimana
  const conteggioPerGiorno = [0, 0, 0, 0, 0, 0, 0];
  attivitaCaricate.forEach(att => {
    const data = att.timestamp ? (att.timestamp.toDate ? att.timestamp.toDate() : new Date(att.timestamp)) : null;
    if (data) {
      let giorno = data.getDay() - 1; // getDay: 0=Dom, 1=Lun...
      if (giorno < 0) giorno = 6; // Domenica
      conteggioPerGiorno[giorno]++;
    }
  });

  const maxVal = Math.max(...conteggioPerGiorno, 1);

  let html = '';
  giorniSettimana.forEach((giorno, idx) => {
    const val = conteggioPerGiorno[idx];
    const perc = Math.round((val / maxVal) * 100);
    html += `
      <div class="trend-item">
        <span class="trend-giorno">${giorno}</span>
        <div class="trend-barra-container">
          <div class="trend-barra" style="width: ${perc}%"></div>
        </div>
        <span class="trend-valore">${val}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

function contaChiamateSettimanaCorrente() {
  const oggi = new Date();
  let lunedi = new Date(oggi);
  const giorno = oggi.getDay();
  const diff = giorno === 0 ? 6 : giorno - 1;
  lunedi.setDate(oggi.getDate() - diff);
  lunedi.setHours(0, 0, 0, 0);

  return attivitaCaricate.filter(a => {
    if (a.tipo !== 'chiamata') return false;
    const data = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : null;
    return data && data >= lunedi;
  }).length;
}

// --- TAB 2: STATISTICHE E VALORI ---

function aggiornaStatistiche() {
  // Lead totali
  document.getElementById('stat-lead-totali').textContent = leadCaricati.length;

  // Contratti chiusi
  document.getElementById('stat-contratti-chiusi').textContent = contrattiCaricati.length;

  // Valore contratti: rata × durata
  let valoreContratti = 0;
  contrattiCaricati.forEach(c => {
    const rata = parseFloat(c.rataMensile) || 0;
    const durata = parseInt(c.durataMesi) || 0;
    valoreContratti += rata * durata;
  });
  document.getElementById('stat-valore-contratti').textContent = '€' + formattaNumero(valoreContratti);

  // Provvigioni totali
  let provvigioniTotali = 0;
  contrattiCaricati.forEach(c => {
    provvigioniTotali += parseFloat(c.provvigioneConsulente) || 0;
  });
  document.getElementById('stat-provvigioni').textContent = '€' + formattaNumero(provvigioniTotali);
}

function aggiornaGrafici() {
  // Grafico a torta: Lead per Fonte
  const fonteCounts = {};
  leadCaricati.forEach(l => {
    const fonte = l.fonte || 'sconosciuta';
    fonteCounts[fonte] = (fonteCounts[fonte] || 0) + 1;
  });

  const fonteLabels = Object.keys(fonteCounts).map(f => {
    const nomi = { meta: 'Meta (FB/IG)', google: 'Google Ads', tiktok: 'TikTok', landing: 'Landing Page', manuale: 'Manuale' };
    return nomi[f] || f;
  });
  const fonteData = Object.values(fonteCounts);
  const fonteColors = ['#3B82F6', '#EF4444', '#000000', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

  if (chartFonti) chartFonti.destroy();
  const ctxFonti = document.getElementById('chart-fonti').getContext('2d');
  chartFonti = new Chart(ctxFonti, {
    type: 'doughnut',
    data: {
      labels: fonteLabels,
      datasets: [{
        data: fonteData,
        backgroundColor: fonteColors.slice(0, fonteLabels.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Inter', size: 12 }, padding: 16 }
        }
      }
    }
  });

  // Grafico a barre: Lead per Stato
  const statoLabels = [];
  const statoData = [];
  const statoColors = [];

  Object.entries(statiMap).forEach(([id, stato]) => {
    const count = leadCaricati.filter(l => l.stato === id).length;
    statoLabels.push(stato.nome);
    statoData.push(count);
    statoColors.push(stato.colore || '#6B7280');
  });

  if (chartStati) chartStati.destroy();
  const ctxStati = document.getElementById('chart-stati').getContext('2d');
  chartStati = new Chart(ctxStati, {
    type: 'bar',
    data: {
      labels: statoLabels,
      datasets: [{
        label: 'Lead',
        data: statoData,
        backgroundColor: statoColors,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { family: 'Inter', size: 11 } },
          grid: { color: '#E5E7EB' }
        },
        x: {
          ticks: { font: { family: 'Inter', size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

// --- TABELLA PERFORMANCE CONSULENTI ---

function aggiornaTabellaPerformance() {
  const tbody = document.getElementById('tabella-performance-body');
  const tfoot = document.getElementById('tabella-performance-footer');

  // Raggruppa per consulente
  const consulentiData = {};

  leadCaricati.forEach(l => {
    const cId = l.consulenteId || 'non_assegnato';
    if (!consulentiData[cId]) {
      consulentiData[cId] = { lead: 0, contratti: 0, valore: 0, provvigioni: 0, chiamate: 0 };
    }
    consulentiData[cId].lead++;
  });

  contrattiCaricati.forEach(c => {
    const cId = c.consulenteId || 'non_assegnato';
    if (!consulentiData[cId]) {
      consulentiData[cId] = { lead: 0, contratti: 0, valore: 0, provvigioni: 0, chiamate: 0 };
    }
    consulentiData[cId].contratti++;
    consulentiData[cId].valore += (parseFloat(c.rataMensile) || 0) * (parseInt(c.durataMesi) || 0);
    consulentiData[cId].provvigioni += parseFloat(c.provvigioneConsulente) || 0;
  });

  // Conta chiamate per consulente
  attivitaCaricate.filter(a => a.tipo === 'chiamata').forEach(att => {
    const cId = att.autoreId || 'non_assegnato';
    if (consulentiData[cId]) {
      consulentiData[cId].chiamate++;
    }
  });

  let htmlRows = '';
  let totLead = 0, totChiamate = 0, totContratti = 0, totValore = 0, totProvvigioni = 0;

  Object.entries(consulentiData).forEach(([cId, data]) => {
    const utInfo = utentiMap[cId];
    const nome = utInfo ? (utInfo.nome + ' ' + utInfo.cognome) : 'Non assegnato';
    const tassoConv = data.lead > 0 ? Math.round((data.contratti / data.lead) * 100) : 0;

    htmlRows += `
      <tr>
        <td><strong>${escapeHtml(nome)}</strong></td>
        <td>${data.lead}</td>
        <td>${data.chiamate}</td>
        <td>${data.contratti}</td>
        <td>${tassoConv}%</td>
        <td>€${formattaNumero(data.valore)}</td>
        <td>€${formattaNumero(data.provvigioni)}</td>
      </tr>
    `;

    totLead += data.lead;
    totChiamate += data.chiamate;
    totContratti += data.contratti;
    totValore += data.valore;
    totProvvigioni += data.provvigioni;
  });

  tbody.innerHTML = htmlRows || '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">Nessun dato disponibile</td></tr>';

  const tassoConvTot = totLead > 0 ? Math.round((totContratti / totLead) * 100) : 0;
  tfoot.innerHTML = `
    <tr style="font-weight: 700; background: var(--bg-page);">
      <td>TOTALE</td>
      <td>${totLead}</td>
      <td>${totChiamate}</td>
      <td>${totContratti}</td>
      <td>${tassoConvTot}%</td>
      <td>€${formattaNumero(totValore)}</td>
      <td>€${formattaNumero(totProvvigioni)}</td>
    </tr>
  `;
}

// --- TAB 3: ATTIVITA' GIORNALIERE ---

async function caricaAttivitaGiornaliere() {
  const utente = getUtenteCorrente();
  const filtroUtente = document.getElementById('filtro-attivita-utente') ? document.getElementById('filtro-attivita-utente').value : '';

  const dataDa = document.getElementById('filtro-data-da').value;
  const dataA = document.getElementById('filtro-data-a').value;

  if (!dataDa || !dataA) {
    mostraToast('Seleziona un periodo valido', 'errore');
    return;
  }

  const dataInizio = new Date(dataDa);
  dataInizio.setHours(0, 0, 0, 0);
  const dataFine = new Date(dataA);
  dataFine.setHours(23, 59, 59, 999);

  const filtroId = filtroUtente || (utente.ruolo === 'consulente' ? utente.id : '');
  await caricaAttivitaDaTimeline(dataInizio, dataFine, filtroId);
  aggiornaAttivitaGiornaliere();
}

function aggiornaAttivitaGiornaliere() {
  const container = document.getElementById('attivita-timeline');

  if (attivitaCaricate.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <p>Nessuna attività nel periodo selezionato</p>
      </div>
    `;
    return;
  }

  // Raggruppa per giorno
  const giorniMap = {};
  attivitaCaricate.forEach(att => {
    const data = att.timestamp ? (att.timestamp.toDate ? att.timestamp.toDate() : new Date(att.timestamp)) : null;
    if (!data) return;

    const chiaveGiorno = data.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    const chiaveOrdine = data.toISOString().split('T')[0];

    if (!giorniMap[chiaveOrdine]) {
      giorniMap[chiaveOrdine] = {
        label: chiaveGiorno,
        attivita: [],
        chiamate: 0,
        leadOk: 0,
        chiusi: 0
      };
    }

    giorniMap[chiaveOrdine].attivita.push(att);

    if (att.tipo === 'chiamata') giorniMap[chiaveOrdine].chiamate++;
    if (att.tipo === 'cambio_stato') {
      if (att.statoNew === 'venduto') giorniMap[chiaveOrdine].leadOk++;
      if (att.statoNew === 'perso' || att.statoNew === 'non_interessato') giorniMap[chiaveOrdine].chiusi++;
    }
  });

  // Ordina per data decrescente
  const giorniOrdinati = Object.entries(giorniMap).sort(([a], [b]) => b.localeCompare(a));

  let html = '';
  giorniOrdinati.forEach(([chiave, giorno]) => {
    const maxVisibili = 10;
    const attivitaVisibili = giorno.attivita.slice(0, maxVisibili);
    const restanti = giorno.attivita.length - maxVisibili;

    html += `
      <div class="card attivita-giorno fade-in" style="margin-bottom: var(--space-4);">
        <div class="attivita-giorno-header">
          <h3 class="attivita-giorno-titolo">📅 ${giorno.label}</h3>
          <div class="attivita-giorno-riepilogo">
            <span class="att-badge att-chiamate">📞 ${giorno.chiamate} chiamate</span>
            <span class="att-badge att-ok">✅ ${giorno.leadOk} Lead Ok</span>
            <span class="att-badge att-chiusi">💔 ${giorno.chiusi} Chiusi</span>
          </div>
        </div>
        <div class="attivita-lista">
    `;

    attivitaVisibili.forEach(att => {
      const dataAtt = att.timestamp ? (att.timestamp.toDate ? att.timestamp.toDate() : new Date(att.timestamp)) : null;
      const ora = dataAtt ? dataAtt.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const icona = getIconaAttivita(att.tipo);
      const descrizione = getDescrizioneAttivita(att);

      html += `
        <div class="attivita-item">
          <span class="attivita-ora">${ora}</span>
          <span class="attivita-icona">${icona}</span>
          <span class="attivita-desc">${descrizione}</span>
        </div>
      `;
    });

    if (restanti > 0) {
      html += `
        <div class="attivita-mostra-altro">
          <button class="btn btn-secondary btn-sm" onclick="mostraTutteAttivita(this, '${chiave}')">
            ...e altre ${restanti} attività
          </button>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Salva riferimento ai giorni per espandere
  window._giorniAttivita = giorniMap;
}

function mostraTutteAttivita(btn, chiaveGiorno) {
  if (!window._giorniAttivita || !window._giorniAttivita[chiaveGiorno]) return;

  const giorno = window._giorniAttivita[chiaveGiorno];
  const listaContainer = btn.closest('.attivita-lista');

  // Rimuovi il bottone "mostra altro"
  btn.closest('.attivita-mostra-altro').remove();

  // Aggiungi le attività rimanenti
  giorno.attivita.slice(10).forEach(att => {
    const dataAtt = att.timestamp ? (att.timestamp.toDate ? att.timestamp.toDate() : new Date(att.timestamp)) : null;
    const ora = dataAtt ? dataAtt.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const icona = getIconaAttivita(att.tipo);
    const descrizione = getDescrizioneAttivita(att);

    const div = document.createElement('div');
    div.className = 'attivita-item fade-in';
    div.innerHTML = `
      <span class="attivita-ora">${ora}</span>
      <span class="attivita-icona">${icona}</span>
      <span class="attivita-desc">${descrizione}</span>
    `;
    listaContainer.appendChild(div);
  });
}

function getIconaAttivita(tipo) {
  const icone = {
    chiamata: '📞',
    cambio_stato: '🔄',
    nota: '📝',
    documento: '📎',
    richiesta_bo: '📤',
    risposta_bo: '📥',
    appuntamento: '📅'
  };
  return icone[tipo] || '•';
}

function getDescrizioneAttivita(att) {
  const autore = escapeHtml(att.autoreNome || 'Sconosciuto');
  const leadNome = att.leadNome ? escapeHtml(att.leadNome) : '';

  switch (att.tipo) {
    case 'chiamata':
      return `Chiamata effettuata - ${autore}${leadNome ? ' + ' + leadNome : ''}`;
    case 'cambio_stato':
      return `Cambio stato - ${autore}${leadNome ? ' + ' + leadNome : ''} (${escapeHtml(att.statoOld || '?')} → ${escapeHtml(att.statoNew || '?')})`;
    case 'nota':
      return `Nota aggiunta - ${autore}${leadNome ? ' + ' + leadNome : ''}`;
    case 'documento':
      return `Documento caricato - ${autore}${leadNome ? ' + ' + leadNome : ''}`;
    case 'richiesta_bo':
      return `Richiesta BO inviata - ${autore}${leadNome ? ' + ' + leadNome : ''}`;
    case 'risposta_bo':
      return `Risposta BO inviata - ${autore}${leadNome ? ' + ' + leadNome : ''}`;
    case 'appuntamento':
      return `Appuntamento creato - ${autore}${leadNome ? ' + ' + leadNome : ''}`;
    default:
      return `${escapeHtml(att.nota || att.tipo || 'Attività')} - ${autore}`;
  }
}

// --- ESPORTA CSV ---

function esportaCsv() {
  const tabella = document.getElementById('tabella-performance');
  if (!tabella) return;

  let csv = '';
  const rows = tabella.querySelectorAll('tr');

  rows.forEach(row => {
    const cols = row.querySelectorAll('th, td');
    const rigaCsv = [];
    cols.forEach(col => {
      let testo = col.textContent.replace(/"/g, '""').trim();
      rigaCsv.push('"' + testo + '"');
    });
    csv += rigaCsv.join(';') + '\n';
  });

  // Download
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'report_performance_' + new Date().toISOString().split('T')[0] + '.csv';
  link.click();

  mostraToast('Report CSV scaricato', 'successo');
}

// --- CONFIGURAZIONE SIDEBAR ---

function configuraSidebar(utente) {
  document.getElementById('sidebar-user-name').textContent = utente.nome + ' ' + utente.cognome;
  document.getElementById('sidebar-user-role').textContent = utente.ruolo.charAt(0).toUpperCase() + utente.ruolo.slice(1);

  if (utente.ruolo === 'admin') {
    document.getElementById('sidebar-admin-section').style.display = 'block';
    document.getElementById('sidebar-impostazioni').style.display = 'flex';
    document.getElementById('sidebar-backoffice').style.display = 'flex';
  }
  if (utente.ruolo === 'backoffice') {
    document.getElementById('sidebar-backoffice').style.display = 'flex';
  }

  // Badge comunicazioni
  aggiornaBadgeComunicazioniSidebar(utente);
}

async function aggiornaBadgeComunicazioniSidebar(utente) {
  try {
    const snapshot = await db.collection('comunicazioni').get();
    let nonLette = 0;
    snapshot.forEach(doc => {
      const com = doc.data();
      if (!com.lettoDa || !com.lettoDa.includes(utente.id)) nonLette++;
    });
    const badge = document.getElementById('sidebar-badge-comunicazioni');
    if (nonLette > 0) {
      badge.textContent = nonLette;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    console.error('Errore badge comunicazioni:', e);
  }
}

// --- UTILITY ---

function formattaDataInput(data) {
  return data.toISOString().split('T')[0];
}

function formattaNumero(num) {
  return num.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(testo) {
  if (!testo) return '';
  const div = document.createElement('div');
  div.textContent = testo;
  return div.innerHTML;
}

function mostraToast(messaggio, tipo) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo || 'info'}`;
  toast.textContent = messaggio;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-uscita');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function logout() {
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// Funzioni globali
window.mostraTutteAttivita = mostraTutteAttivita;
