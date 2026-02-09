// ==========================================
// IMPORT EXCEL - Logica principale
// import-excel.js
// ==========================================

// Variabili globali
let datiImportati = [];      // Array di oggetti dal file Excel
let erroriRighe = [];         // Indici delle righe con errori
let fileCaricato = null;      // File selezionato dall'utente

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
  // Verifica autenticazione (solo Admin)
  if (typeof proteggiPagina === 'function') {
    proteggiPagina(['admin']);
  }

  // Carica info utente nella sidebar
  caricaInfoUtente();

  // Carica campagne nel select
  await caricaCampagne();

  // Inizializza drag & drop
  inizializzaUpload();
});

// ==========================================
// INFO UTENTE SIDEBAR
// ==========================================
function caricaInfoUtente() {
  try {
    const utente = JSON.parse(sessionStorage.getItem('utente'));
    if (utente) {
      const avatarEl = document.getElementById('user-avatar');
      const nameEl = document.getElementById('user-name');
      const roleEl = document.getElementById('user-role');
      if (avatarEl) avatarEl.textContent = (utente.nome || 'A').charAt(0).toUpperCase();
      if (nameEl) nameEl.textContent = (utente.nome || '') + ' ' + (utente.cognome || '');
      if (roleEl) {
        const ruoli = { admin: 'Amministratore', consulente: 'Consulente', backoffice: 'Back Office' };
        roleEl.textContent = ruoli[utente.ruolo] || utente.ruolo;
      }
    }
  } catch (e) { /* ignora */ }
}

// ==========================================
// CARICA CAMPAGNE
// ==========================================
async function caricaCampagne() {
  const select = document.getElementById('select-campagna');
  try {
    const snapshot = await db.collection('campagne').where('attiva', '==', true).get();
    snapshot.forEach(doc => {
      const c = doc.data();
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = c.nome + ' (' + (c.fonte || 'N/D') + ')';
      select.appendChild(option);
    });

    // Se c'è una sola campagna, selezionala automaticamente
    if (snapshot.size === 1) {
      select.selectedIndex = 1;
    }
  } catch (e) {
    console.error('Errore caricamento campagne:', e);
    mostraToast('Errore nel caricamento delle campagne', 'error');
  }
}

// ==========================================
// GESTIONE UPLOAD FILE
// ==========================================
function inizializzaUpload() {
  const zona = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');

  // Drag & drop
  zona.addEventListener('dragover', function(e) {
    e.preventDefault();
    zona.classList.add('drag-over');
  });

  zona.addEventListener('dragleave', function(e) {
    e.preventDefault();
    zona.classList.remove('drag-over');
  });

  zona.addEventListener('drop', function(e) {
    e.preventDefault();
    zona.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      gestisciFile(files[0]);
    }
  });

  // Input file classico
  fileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
      gestisciFile(e.target.files[0]);
    }
  });

  // Seleziona tutti checkbox
  document.getElementById('seleziona-tutti').addEventListener('change', function() {
    const checked = this.checked;
    document.querySelectorAll('.riga-checkbox').forEach(cb => {
      cb.checked = checked;
    });
    aggiornaContatoriSelezione();
  });
}

function gestisciFile(file) {
  // Verifica estensione
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    mostraToast('Formato non supportato. Usa .xlsx, .xls o .csv', 'error');
    return;
  }

  // Verifica campagna selezionata
  if (!document.getElementById('select-campagna').value) {
    mostraToast('Seleziona prima una campagna', 'error');
    return;
  }

  fileCaricato = file;

  // Mostra info file
  document.getElementById('file-info').style.display = 'flex';
  document.getElementById('file-name').textContent = file.name + ' (' + formatBytes(file.size) + ')';
  document.getElementById('upload-zone').style.display = 'none';

  // Leggi il file
  leggiFile(file);
}

function rimuoviFile() {
  fileCaricato = null;
  datiImportati = [];
  erroriRighe = [];
  document.getElementById('file-info').style.display = 'none';
  document.getElementById('upload-zone').style.display = 'block';
  document.getElementById('file-input').value = '';
  // Torna a step 1 se siamo su step 2
  tornaUpload();
}

// ==========================================
// LETTURA FILE EXCEL/CSV
// ==========================================
function leggiFile(file) {
  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      // Prendi il primo foglio
      const primoFoglio = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[primoFoglio];

      // Converti in array di oggetti
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (jsonData.length === 0) {
        mostraToast('Il file è vuoto o non contiene dati', 'error');
        rimuoviFile();
        return;
      }

      // Normalizza le intestazioni (case-insensitive)
      datiImportati = jsonData.map(riga => {
        const rigaNorm = {};
        for (const chiave in riga) {
          const chiaveLower = chiave.toLowerCase().trim();
          if (chiaveLower === 'nome') rigaNorm.nome = String(riga[chiave]).trim();
          else if (chiaveLower === 'cognome') rigaNorm.cognome = String(riga[chiave]).trim();
          else if (chiaveLower === 'telefono' || chiaveLower === 'tel') rigaNorm.telefono = String(riga[chiave]).trim();
          else if (chiaveLower === 'email' || chiaveLower === 'e-mail') rigaNorm.email = String(riga[chiave]).trim();
          else if (chiaveLower === 'provincia' || chiaveLower === 'prov') rigaNorm.provincia = String(riga[chiave]).trim();
          else if (chiaveLower === 'note' || chiaveLower === 'nota') rigaNorm.note = String(riga[chiave]).trim();
        }
        return rigaNorm;
      });

      // Valida i dati
      validaDati();

      // Mostra anteprima
      mostraAnteprima();

    } catch (err) {
      console.error('Errore lettura file:', err);
      mostraToast('Errore nella lettura del file: ' + err.message, 'error');
      rimuoviFile();
    }
  };

  reader.readAsArrayBuffer(file);
}

// ==========================================
// VALIDAZIONE DATI
// ==========================================
function validaDati() {
  erroriRighe = [];

  datiImportati.forEach((riga, index) => {
    const errori = [];

    if (!riga.nome) errori.push('Nome mancante');
    if (!riga.cognome) errori.push('Cognome mancante');
    if (!riga.telefono) errori.push('Telefono mancante');

    // Validazione telefono (almeno 8 cifre)
    if (riga.telefono) {
      const telPulito = riga.telefono.replace(/[\s\-\+\(\)]/g, '');
      if (telPulito.length < 8 || !/^\d+$/.test(telPulito)) {
        errori.push('Telefono non valido');
      }
    }

    // Validazione email (se presente)
    if (riga.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(riga.email)) {
      errori.push('Email non valida');
    }

    if (errori.length > 0) {
      erroriRighe.push({ indice: index, errori: errori });
    }
  });
}

// ==========================================
// ANTEPRIMA
// ==========================================
function mostraAnteprima() {
  // Aggiorna step indicator
  aggiornaStep(2);

  // Nascondi upload, mostra anteprima
  document.getElementById('sezione-upload').style.display = 'none';
  document.getElementById('sezione-anteprima').style.display = 'block';

  // Contatori
  const totale = datiImportati.length;
  const errori = erroriRighe.length;
  const validi = totale - errori;

  document.getElementById('totale-righe').textContent = totale;
  document.getElementById('totale-validi').textContent = validi;
  document.getElementById('totale-errori').textContent = errori;

  // Costruisci tabella
  const tbody = document.getElementById('anteprima-body');
  tbody.innerHTML = '';

  // Set di indici con errore per lookup veloce
  const indiciErrore = new Set(erroriRighe.map(e => e.indice));
  const erroriMap = {};
  erroriRighe.forEach(e => { erroriMap[e.indice] = e.errori; });

  datiImportati.forEach((riga, index) => {
    const hasError = indiciErrore.has(index);
    const tr = document.createElement('tr');
    if (hasError) tr.style.background = '#FEF2F2';

    tr.innerHTML = `
      <td><input type="checkbox" class="row-checkbox riga-checkbox" data-index="${index}" ${hasError ? '' : 'checked'} onchange="aggiornaContatoriSelezione()"></td>
      <td>${index + 1}</td>
      <td${!riga.nome ? ' class="errore"' : ''}>${escapeHtml(riga.nome || '—')}</td>
      <td${!riga.cognome ? ' class="errore"' : ''}>${escapeHtml(riga.cognome || '—')}</td>
      <td${!riga.telefono ? ' class="errore"' : ''}>${escapeHtml(riga.telefono || '—')}</td>
      <td>${escapeHtml(riga.email || '')}</td>
      <td>${escapeHtml(riga.provincia || '')}</td>
      <td>${escapeHtml(riga.note || '')}</td>
      <td>${hasError
        ? '<span class="badge badge-lost" title="' + escapeHtml(erroriMap[index].join(', ')) + '">✗ ' + erroriMap[index][0] + '</span>'
        : '<span class="badge badge-new">✓ Valido</span>'
      }</td>
    `;

    tbody.appendChild(tr);
  });

  // Aggiorna contatori selezione
  aggiornaContatoriSelezione();
}

function aggiornaContatoriSelezione() {
  const checkboxes = document.querySelectorAll('.riga-checkbox:checked');
  const validi = checkboxes.length;
  document.getElementById('totale-validi').textContent = validi;

  const btnImporta = document.getElementById('btn-importa');
  if (btnImporta) {
    btnImporta.disabled = validi === 0;
    btnImporta.textContent = validi > 0
      ? `Importa ${validi} Lead`
      : 'Nessun lead da importare';
  }
}

function tornaUpload() {
  aggiornaStep(1);
  document.getElementById('sezione-upload').style.display = 'block';
  document.getElementById('sezione-anteprima').style.display = 'none';
  document.getElementById('sezione-importazione').style.display = 'none';
}

// ==========================================
// IMPORTAZIONE
// ==========================================
async function avviaImportazione() {
  const campagnaId = document.getElementById('select-campagna').value;
  if (!campagnaId) {
    mostraToast('Seleziona una campagna', 'error');
    return;
  }

  // Raccogli gli indici selezionati
  const checkboxes = document.querySelectorAll('.riga-checkbox:checked');
  const indiciDaImportare = [];
  checkboxes.forEach(cb => {
    indiciDaImportare.push(parseInt(cb.dataset.index));
  });

  if (indiciDaImportare.length === 0) {
    mostraToast('Nessun lead selezionato', 'error');
    return;
  }

  // Aggiorna UI: mostra step 3
  aggiornaStep(3);
  document.getElementById('sezione-anteprima').style.display = 'none';
  document.getElementById('sezione-importazione').style.display = 'block';

  const totale = indiciDaImportare.length;
  let importati = 0;
  let falliti = 0;
  const erroriImport = [];

  // Recupera dati campagna
  let campagnaData;
  try {
    const campagnaDoc = await db.collection('campagne').doc(campagnaId).get();
    if (!campagnaDoc.exists) {
      mostraRisultatoFinale(0, totale, ['Campagna non trovata']);
      return;
    }
    campagnaData = campagnaDoc.data();
  } catch (e) {
    mostraRisultatoFinale(0, totale, ['Errore accesso campagna: ' + e.message]);
    return;
  }

  // Importa lead uno per uno
  for (let i = 0; i < indiciDaImportare.length; i++) {
    const indice = indiciDaImportare[i];
    const riga = datiImportati[indice];

    try {
      // Distribuisci lead
      const consulenteId = await distribuisciLead(campagnaId);

      if (!consulenteId) {
        throw new Error('Nessun consulente disponibile');
      }

      // Salva lead
      const leadData = {
        nome: riga.nome || '',
        cognome: riga.cognome || '',
        telefono: riga.telefono || '',
        email: riga.email || '',
        provincia: riga.provincia || '',
        fonte: campagnaData.fonte || 'manuale',
        campagna: campagnaId,
        consulenteId: consulenteId,
        stato: 'nuovo',
        fase: 'contatto',
        priorita: 'media',
        tipoCliente: '',
        autoRichiesta: '',
        budgetMensile: '',
        durataDesiderata: '',
        kmAnnui: '',
        tempiDesiderati: '',
        noteEsigenza: riga.note || '',
        tags: [],
        dataCreazione: firebase.firestore.FieldValue.serverTimestamp(),
        dataUltimaModifica: firebase.firestore.FieldValue.serverTimestamp(),
        dataChiusura: null
      };

      const leadRef = await db.collection('lead').add(leadData);

      // Crea timeline
      await db.collection('lead').doc(leadRef.id).collection('timeline').add({
        tipo: 'creazione',
        nota: 'Lead importato da file Excel — Campagna: ' + (campagnaData.nome || campagnaId),
        autoreId: 'sistema',
        autoreNome: 'Importazione Excel',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      importati++;

    } catch (e) {
      falliti++;
      erroriImport.push(`Riga ${indice + 1} (${riga.nome} ${riga.cognome}): ${e.message}`);
      console.error('Errore importazione riga ' + (indice + 1) + ':', e);
    }

    // Aggiorna progress bar
    const percentuale = Math.round(((i + 1) / totale) * 100);
    document.getElementById('progress-bar').style.width = percentuale + '%';
    document.getElementById('progress-text').textContent = (i + 1) + ' / ' + totale + ' lead elaborati';

    // Piccola pausa per non sovraccaricare Firestore
    if ((i + 1) % 5 === 0) {
      await sleep(200);
    }
  }

  // Mostra risultato finale
  mostraRisultatoFinale(importati, falliti, erroriImport);
}

function mostraRisultatoFinale(importati, falliti, errori) {
  document.getElementById('progress-container').style.display = 'none';
  const risultato = document.getElementById('risultato-finale');
  risultato.style.display = 'block';

  document.getElementById('risultato-titolo').textContent =
    importati > 0 ? 'Importazione completata!' : 'Importazione fallita';

  let dettaglio = `✓ ${importati} lead importati con successo`;
  if (falliti > 0) {
    dettaglio += `<br>✗ ${falliti} lead non importati`;
    if (errori.length > 0) {
      dettaglio += '<br><br><small style="text-align: left; display: block;">';
      errori.slice(0, 10).forEach(e => {
        dettaglio += '• ' + escapeHtml(e) + '<br>';
      });
      if (errori.length > 10) {
        dettaglio += '... e altri ' + (errori.length - 10) + ' errori';
      }
      dettaglio += '</small>';
    }
  }

  document.getElementById('risultato-dettaglio').innerHTML = dettaglio;

  if (importati === 0) {
    risultato.querySelector('.icon').textContent = '✗';
    risultato.querySelector('.icon').classList.remove('success');
    risultato.querySelector('.icon').style.color = '#EF4444';
  }
}

// ==========================================
// DOWNLOAD TEMPLATE EXCEL
// ==========================================
function scaricaTemplate() {
  // Crea un workbook con le colonne corrette
  const wb = XLSX.utils.book_new();
  const datiTemplate = [
    { Nome: 'Mario', Cognome: 'Rossi', Telefono: '3331234567', Email: 'mario@email.com', Provincia: 'Roma', Note: 'Interessato a SUV' },
    { Nome: 'Laura', Cognome: 'Bianchi', Telefono: '3339876543', Email: 'laura@email.com', Provincia: 'Milano', Note: '' },
  ];
  const ws = XLSX.utils.json_to_sheet(datiTemplate);

  // Imposta larghezza colonne
  ws['!cols'] = [
    { wch: 15 }, // Nome
    { wch: 15 }, // Cognome
    { wch: 15 }, // Telefono
    { wch: 25 }, // Email
    { wch: 12 }, // Provincia
    { wch: 30 }, // Note
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Lead');
  XLSX.writeFile(wb, 'template_importazione_lead.xlsx');
}

// ==========================================
// STEP INDICATOR
// ==========================================
function aggiornaStep(stepAttivo) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('step-' + i);
    el.classList.remove('active', 'completed');
    if (i < stepAttivo) el.classList.add('completed');
    else if (i === stepAttivo) el.classList.add('active');
  }
}

// ==========================================
// RESET PAGINA
// ==========================================
function resetPagina() {
  datiImportati = [];
  erroriRighe = [];
  fileCaricato = null;

  document.getElementById('file-input').value = '';
  document.getElementById('file-info').style.display = 'none';
  document.getElementById('upload-zone').style.display = 'block';
  document.getElementById('anteprima-body').innerHTML = '';
  document.getElementById('sezione-upload').style.display = 'block';
  document.getElementById('sezione-anteprima').style.display = 'none';
  document.getElementById('sezione-importazione').style.display = 'none';
  document.getElementById('progress-container').style.display = 'block';
  document.getElementById('risultato-finale').style.display = 'none';
  document.getElementById('progress-bar').style.width = '0%';

  aggiornaStep(1);
}

// ==========================================
// UTILITY
// ==========================================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mostraToast(messaggio, tipo) {
  // Se esiste la funzione globale
  if (typeof window.mostraToast === 'function' && window.mostraToast !== mostraToast) {
    window.mostraToast(messaggio, tipo);
    return;
  }
  // Fallback: toast semplice
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.style.cssText = `
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: fadeIn 0.3s ease-out;
    ${tipo === 'error'
      ? 'background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA;'
      : 'background: #D1FAE5; color: #065F46; border: 1px solid #A7F3D0;'}
  `;
  toast.textContent = messaggio;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
