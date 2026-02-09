// ====================================================
// ESPORTAZIONE EXCEL - Digital Credit CRM
// Aggiungi queste funzioni in fondo a js/lead.js
// ====================================================

// Variabile globale per conferma export massivo
let _exportPendente = null;

/**
 * Inizializza il bottone export Excel
 * Chiamare dentro il DOMContentLoaded della pagina lead-elenco
 */
function inizializzaExportExcel() {
  const btnExport = document.getElementById('btn-esporta-excel');
  if (btnExport) {
    btnExport.addEventListener('click', avviaExportExcel);
  }
}

/**
 * Avvia il processo di esportazione
 */
async function avviaExportExcel() {
  try {
    // 1. Raccogli i filtri attivi dalla toolbar
    const filtri = raccogliFiltriExport();

    // 2. Conta i lead prima di scaricarli
    const conteggio = await contaLeadPerExport(filtri);

    if (conteggio === 0) {
      mostraToast('Nessun lead trovato con i filtri selezionati', 'warning');
      return;
    }

    // 3. Se più di 5000, chiedi conferma
    if (conteggio > 5000) {
      _exportPendente = filtri;
      const testo = document.getElementById('export-conferma-testo');
      testo.textContent = 'Stai per esportare ' + conteggio.toLocaleString('it-IT') + ' lead. L\'operazione potrebbe richiedere qualche secondo. Continuare?';
      document.getElementById('modal-export-conferma').style.display = 'flex';
      return;
    }

    // 4. Procedi con l'export
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
 * Raccoglie i filtri dalla toolbar della pagina lead-elenco
 * NOTA: Adatta i selettori (#filtro-data-da, etc.) ai tuoi ID effettivi
 */
function raccogliFiltriExport() {
  const utenteCorrente = getUtenteCorrente();
  const filtri = {};

  // Periodo
  const dataDa = document.getElementById('filtro-data-da');
  const dataA = document.getElementById('filtro-data-a');
  if (dataDa && dataDa.value) filtri.dataDa = new Date(dataDa.value);
  if (dataA && dataA.value) {
    filtri.dataA = new Date(dataA.value);
    filtri.dataA.setHours(23, 59, 59, 999);
  }

  // Stato
  const statoSelect = document.getElementById('filtro-stato');
  if (statoSelect && statoSelect.value && statoSelect.value !== 'tutti') {
    filtri.stato = statoSelect.value;
  }

  // Consulente (solo Admin e BO possono filtrare)
  if (utenteCorrente.ruolo === 'admin' || utenteCorrente.ruolo === 'backoffice') {
    const consulenteSelect = document.getElementById('filtro-consulente');
    if (consulenteSelect && consulenteSelect.value && consulenteSelect.value !== 'tutti') {
      filtri.consulenteId = consulenteSelect.value;
    }
  } else if (utenteCorrente.ruolo === 'consulente') {
    // Consulente vede solo i propri lead — forza il filtro
    filtri.consulenteId = utenteCorrente.id;
  }

  return filtri;
}

/**
 * Conta i lead senza scaricarli tutti (per il warning >5000)
 */
async function contaLeadPerExport(filtri) {
  let query = db.collection('lead');

  if (filtri.consulenteId) {
    query = query.where('consulenteId', '==', filtri.consulenteId);
  }
  if (filtri.stato) {
    query = query.where('stato', '==', filtri.stato);
  }
  if (filtri.dataDa) {
    query = query.where('dataCreazione', '>=', firebase.firestore.Timestamp.fromDate(filtri.dataDa));
  }
  if (filtri.dataA) {
    query = query.where('dataCreazione', '<=', firebase.firestore.Timestamp.fromDate(filtri.dataA));
  }

  const snapshot = await query.get();
  return snapshot.size;
}

/**
 * Esegue l'export completo: query Firestore → genera Excel → download
 */
async function eseguiExport(filtri) {
  mostraOverlayExport();

  try {
    // 1. Query Firestore con i filtri
    let query = db.collection('lead');

    if (filtri.consulenteId) {
      query = query.where('consulenteId', '==', filtri.consulenteId);
    }
    if (filtri.stato) {
      query = query.where('stato', '==', filtri.stato);
    }
    if (filtri.dataDa) {
      query = query.where('dataCreazione', '>=', firebase.firestore.Timestamp.fromDate(filtri.dataDa));
    }
    if (filtri.dataA) {
      query = query.where('dataCreazione', '<=', firebase.firestore.Timestamp.fromDate(filtri.dataA));
    }

    query = query.orderBy('dataCreazione', 'desc');

    const snapshot = await query.get();

    if (snapshot.empty) {
      mostraToast('Nessun lead trovato con i filtri selezionati', 'warning');
      nascondiOverlayExport();
      return;
    }

    // 2. Carica le lookup (ID → nome) per consulenti e campagne
    const [consulentiMap, campagneMap] = await Promise.all([
      caricaMappaConsulenti(),
      caricaMappaCampagne()
    ]);

    // 3. Prepara le righe per Excel
    const righe = [];
    snapshot.forEach(function(doc) {
      var l = doc.data();
      righe.push({
        'ID': doc.id,
        'Nome': l.nome || '',
        'Cognome': l.cognome || '',
        'Telefono': l.telefono || '',
        'Email': l.email || '',
        'Provincia': l.provincia || '',
        'Stato': l.stato || '',
        'Fase': l.fase || '',
        'Priorità': l.priorita || '',
        'Consulente': consulentiMap[l.consulenteId] || l.consulenteId || '',
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

    // 4. Crea il foglio Excel
    var ws = XLSX.utils.json_to_sheet(righe);

    // Imposta le larghezze colonne per leggibilità
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
      { wch: 30 },  // Note Esigenza
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lead');

    // 5. Genera nome file e scarica
    var nomeFile = generaNomeFileExport(filtri, consulentiMap);
    XLSX.writeFile(wb, nomeFile);

    // 6. Feedback positivo
    nascondiOverlayExport();
    mostraToast('✓ Esportati ' + righe.length + ' lead', 'success');

  } catch (errore) {
    console.error('Errore durante export:', errore);
    nascondiOverlayExport();
    mostraToast('Errore durante l\'esportazione. Riprova.', 'error');
  }
}


// ====================================================
// FUNZIONI HELPER EXPORT
// ====================================================

/**
 * Carica mappa ID consulente → "Nome Cognome"
 */
async function caricaMappaConsulenti() {
  var mappa = {};
  var snapshot = await db.collection('utenti').get();
  snapshot.forEach(function(doc) {
    var u = doc.data();
    mappa[doc.id] = (u.nome || '') + ' ' + (u.cognome || '');
    mappa[doc.id] = mappa[doc.id].trim();
  });
  return mappa;
}

/**
 * Carica mappa ID campagna → nome campagna
 */
async function caricaMappaCampagne() {
  var mappa = {};
  var snapshot = await db.collection('campagne').get();
  snapshot.forEach(function(doc) {
    var c = doc.data();
    mappa[doc.id] = c.nome || doc.id;
  });
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
function generaNomeFileExport(filtri, consulentiMap) {
  var oggi = new Date();

  function formattaData(d) {
    var gg = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var aaaa = d.getFullYear();
    return gg + '-' + mm + '-' + aaaa;
  }

  var dataDaStr = filtri.dataDa
    ? formattaData(filtri.dataDa)
    : formattaData(new Date(oggi.getFullYear(), oggi.getMonth(), 1));

  var dataAStr = filtri.dataA
    ? formattaData(filtri.dataA)
    : formattaData(oggi);

  var nome = 'lead_export_' + dataDaStr + '_' + dataAStr;

  // Aggiungi nome consulente se filtrato per uno specifico
  if (filtri.consulenteId && consulentiMap[filtri.consulenteId]) {
    var nomeConsulente = consulentiMap[filtri.consulenteId].split(' ')[0];
    nome += '_' + nomeConsulente;
  }

  return nome + '.xlsx';
}

/**
 * Mostra overlay caricamento export
 */
function mostraOverlayExport() {
  var overlay = document.getElementById('export-overlay');
  if (overlay) overlay.style.display = 'flex';
}

/**
 * Nascondi overlay caricamento export
 */
function nascondiOverlayExport() {
  var overlay = document.getElementById('export-overlay');
  if (overlay) overlay.style.display = 'none';
}
