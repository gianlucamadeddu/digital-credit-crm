// ===== TEMPLATE.JS — Gestione Template Messaggi Digital Credit CRM =====

// Stato globale
let templateGlobali = [];
let templatePersonali = [];
let leadCache = [];
let templateInModifica = null;
let templateDaUsare = null;
let usaLeadSelezionato = null;

// Variabili disponibili
const VARIABILI = [
  { codice: '{NOME}', descrizione: 'Nome del lead', esempio: 'Mario' },
  { codice: '{COGNOME}', descrizione: 'Cognome del lead', esempio: 'Rossi' },
  { codice: '{NOME_COMPLETO}', descrizione: 'Nome e cognome', esempio: 'Mario Rossi' },
  { codice: '{TELEFONO}', descrizione: 'Telefono', esempio: '3331234567' },
  { codice: '{EMAIL}', descrizione: 'Email', esempio: 'mario@email.com' },
  { codice: '{PROVINCIA}', descrizione: 'Provincia', esempio: 'Roma' },
  { codice: '{AUTO_RICHIESTA}', descrizione: 'Auto richiesta', esempio: 'Fiat 500' },
  { codice: '{BUDGET}', descrizione: 'Budget mensile', esempio: '200-300\u20ac' },
  { codice: '{CONSULENTE}', descrizione: 'Nome del consulente', esempio: 'Giovanni Bianchi' }
];

// Dati esempio per anteprima
const LEAD_ESEMPIO = {
  nome: 'Mario',
  cognome: 'Rossi',
  telefono: '3331234567',
  email: 'mario@email.com',
  provincia: 'Roma',
  autoRichiesta: 'Fiat 500',
  budgetMensile: '200-300\u20ac'
};

// ===== INIZIALIZZAZIONE =====
document.addEventListener('DOMContentLoaded', async function() {
  const utente = getUtenteCorrente();
  if (!utente) {
    window.location.href = 'index.html';
    return;
  }

  aggiornaInfoUtente(utente);
  gestisciMenuPerRuolo(utente);

  // Mostra campo visibilita solo per admin
  if (utente.ruolo === 'admin') {
    document.getElementById('tmpl-visibilita-container').style.display = 'block';
  }

  // Event listener
  document.getElementById('btn-nuovo-template').addEventListener('click', () => apriModaleTemplate());
  document.getElementById('btn-salva-template').addEventListener('click', salvaTemplate);

  // Toggle oggetto email
  document.getElementById('tmpl-tipo').addEventListener('change', function() {
    document.getElementById('tmpl-oggetto-container').style.display = 
      this.value === 'email' ? 'block' : 'none';
  });

  // Anteprima live
  document.getElementById('tmpl-testo').addEventListener('input', aggiornaAnteprima);
  document.getElementById('tmpl-oggetto').addEventListener('input', aggiornaAnteprima);

  // Chiudi modali cliccando fuori
  document.getElementById('modal-template').addEventListener('click', function(e) {
    if (e.target === this) chiudiModaleTemplate();
  });
  document.getElementById('modal-usa-template').addEventListener('click', function(e) {
    if (e.target === this) chiudiModaleUsa();
  });

  // Popola variabili cliccabili
  popolaVariabili();

  // Setup ricerca lead per "Usa template"
  setupRicercaLeadUsa();

  // Carica dati
  await caricaCacheLead();
  await caricaTemplate();
});

// ===== GESTIONE UTENTE =====
function aggiornaInfoUtente(utente) {
  const iniziale = (utente.nome || 'U').charAt(0).toUpperCase();
  document.getElementById('user-avatar').textContent = iniziale;
  document.getElementById('user-name-sidebar').textContent = utente.nome + ' ' + utente.cognome;
  const ruoliLabel = { admin: 'Amministratore', consulente: 'Consulente', backoffice: 'Back Office' };
  document.getElementById('user-role-sidebar').textContent = ruoliLabel[utente.ruolo] || utente.ruolo;
}

function gestisciMenuPerRuolo(utente) {
  if (utente.ruolo === 'consulente') {
    var navImp = document.getElementById('nav-impostazioni');
    if (navImp) navImp.style.display = 'none';
  }
  if (utente.ruolo !== 'admin' && utente.ruolo !== 'backoffice') {
    var navBO = document.getElementById('nav-backoffice');
    if (navBO) navBO.style.display = 'none';
  }
}

// ===== CARICAMENTO DATI =====
async function caricaTemplate() {
  const utente = getUtenteCorrente();
  const db = firebase.firestore();

  try {
    const snapshot = await db.collection('templateMessaggi').get();
    templateGlobali = [];
    templatePersonali = [];

    snapshot.forEach(function(doc) {
      var t = doc.data();
      t.id = doc.id;

      if (t.utenteId === 'globale') {
        templateGlobali.push(t);
      } else if (t.utenteId === utente.id) {
        templatePersonali.push(t);
      } else if (utente.ruolo === 'admin') {
        // Admin vede anche i template degli altri
        templatePersonali.push(t);
      }
    });

    renderTemplate();
  } catch (errore) {
    console.error('Errore caricamento template:', errore);
  }
}

async function caricaCacheLead() {
  const utente = getUtenteCorrente();
  const db = firebase.firestore();

  try {
    var query = db.collection('lead');
    if (utente.ruolo === 'consulente') {
      query = query.where('consulenteId', '==', utente.id);
    }

    const snapshot = await query.get();
    leadCache = [];
    snapshot.forEach(function(doc) {
      leadCache.push(Object.assign({ id: doc.id }, doc.data()));
    });
  } catch (errore) {
    console.error('Errore caricamento lead:', errore);
    leadCache = [];
  }
}

// ===== RENDER TEMPLATE =====
function renderTemplate() {
  const utente = getUtenteCorrente();
  const gridGlobali = document.getElementById('grid-globali');
  const gridPersonali = document.getElementById('grid-personali');
  const sezioneGlobali = document.getElementById('sezione-globali');
  const emptyState = document.getElementById('empty-state');

  // Template globali
  if (templateGlobali.length > 0) {
    sezioneGlobali.style.display = 'block';
    document.getElementById('count-globali').textContent = templateGlobali.length;
    gridGlobali.innerHTML = templateGlobali.map(function(t) {
      return creaCardTemplate(t, utente.ruolo === 'admin');
    }).join('');
  } else {
    sezioneGlobali.style.display = 'none';
  }

  // Template personali
  document.getElementById('count-personali').textContent = templatePersonali.length;
  if (templatePersonali.length > 0) {
    gridPersonali.innerHTML = templatePersonali.map(function(t) {
      return creaCardTemplate(t, true);
    }).join('');
  } else {
    gridPersonali.innerHTML = '';
  }

  // Empty state
  if (templateGlobali.length === 0 && templatePersonali.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
  }
}

function creaCardTemplate(tmpl, mostraAzioni) {
  var isGlobale = tmpl.utenteId === 'globale';
  var tipoClasse = tmpl.tipo === 'whatsapp' ? 'whatsapp' : 'email';
  var tipoEmoji = tmpl.tipo === 'whatsapp' ? '\uD83D\uDCAC' : '\u2709\uFE0F';
  var testo = tmpl.testo || '';
  var anteprima = testo.length > 120 ? testo.substring(0, 120) + '...' : testo;

  var badgeHtml = isGlobale ? '<span class="badge-globale">Globale</span>' : '';

  var azioniHtml = '';
  if (mostraAzioni) {
    azioniHtml = '<button class="btn btn-secondary" onclick="apriModaleTemplate(\'' + tmpl.id + '\')">Modifica</button>' +
                 '<button class="btn btn-secondary" style="color:#EF4444;" onclick="eliminaTemplate(\'' + tmpl.id + '\')">Elimina</button>';
  }

  return '<div class="template-card">' +
    '<div class="template-card-header">' +
      '<div class="template-type-icon ' + tipoClasse + '">' + tipoEmoji + '</div>' +
      '<div style="flex:1;">' +
        '<div class="template-card-title">' + escapeHtml(tmpl.nome) + '</div>' +
        '<div class="template-card-badges">' +
          '<span class="badge-tipo ' + tipoClasse + '">' + (tmpl.tipo === 'whatsapp' ? 'WhatsApp' : 'Email') + '</span>' +
          badgeHtml +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="template-card-preview">' + escapeHtml(anteprima) + '</div>' +
    '<div class="template-card-actions">' +
      '<button class="btn btn-usa" onclick="apriModaleUsa(\'' + tmpl.id + '\')">Usa</button>' +
      azioniHtml +
    '</div>' +
  '</div>';
}

// ===== MODALE NUOVO/MODIFICA TEMPLATE =====
function apriModaleTemplate(templateId) {
  templateInModifica = null;

  if (templateId) {
    // Modifica
    var tmpl = templateGlobali.find(function(t) { return t.id === templateId; }) ||
               templatePersonali.find(function(t) { return t.id === templateId; });
    if (!tmpl) return;

    templateInModifica = templateId;
    document.getElementById('modal-template-title').textContent = 'Modifica Template';
    document.getElementById('tmpl-nome').value = tmpl.nome;
    document.getElementById('tmpl-tipo').value = tmpl.tipo;
    document.getElementById('tmpl-oggetto').value = tmpl.oggetto || '';
    document.getElementById('tmpl-testo').value = tmpl.testo || '';

    var utente = getUtenteCorrente();
    if (utente.ruolo === 'admin') {
      document.getElementById('tmpl-visibilita').value = tmpl.utenteId === 'globale' ? 'globale' : 'personale';
    }

    document.getElementById('tmpl-oggetto-container').style.display = tmpl.tipo === 'email' ? 'block' : 'none';
  } else {
    // Nuovo
    document.getElementById('modal-template-title').textContent = 'Nuovo Template';
    document.getElementById('tmpl-nome').value = '';
    document.getElementById('tmpl-tipo').value = 'whatsapp';
    document.getElementById('tmpl-oggetto').value = '';
    document.getElementById('tmpl-testo').value = '';
    document.getElementById('tmpl-oggetto-container').style.display = 'none';

    var utente2 = getUtenteCorrente();
    if (utente2.ruolo === 'admin') {
      document.getElementById('tmpl-visibilita').value = 'personale';
    }
  }

  aggiornaAnteprima();
  document.getElementById('modal-template').classList.add('active');
}

function chiudiModaleTemplate() {
  document.getElementById('modal-template').classList.remove('active');
  templateInModifica = null;
}

// ===== VARIABILI CLICCABILI =====
function popolaVariabili() {
  var container = document.getElementById('variabili-container');
  container.innerHTML = VARIABILI.map(function(v) {
    return '<button type="button" class="variabile-btn" onclick="inserisciVariabile(\'' + v.codice + '\')" title="' + v.descrizione + '">' + v.codice + '</button>';
  }).join('');
}

function inserisciVariabile(codice) {
  var textarea = document.getElementById('tmpl-testo');
  var start = textarea.selectionStart;
  var end = textarea.selectionEnd;
  var testo = textarea.value;

  textarea.value = testo.substring(0, start) + codice + testo.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + codice.length;

  aggiornaAnteprima();
}

// ===== ANTEPRIMA =====
function aggiornaAnteprima() {
  var testo = document.getElementById('tmpl-testo').value;
  var utente = getUtenteCorrente();
  var nomeConsulente = utente.nome + ' ' + utente.cognome;

  var anteprimaText = sostituisciVariabili(testo, LEAD_ESEMPIO, nomeConsulente);

  var anteprimaEl = document.getElementById('tmpl-anteprima');
  if (anteprimaText.trim()) {
    anteprimaEl.textContent = anteprimaText;
  } else {
    anteprimaEl.textContent = "L'anteprima apparir\u00e0 qui...";
  }
}

// ===== SALVA TEMPLATE =====
async function salvaTemplate() {
  var utente = getUtenteCorrente();
  var nome = document.getElementById('tmpl-nome').value.trim();
  var tipo = document.getElementById('tmpl-tipo').value;
  var oggetto = document.getElementById('tmpl-oggetto').value.trim();
  var testo = document.getElementById('tmpl-testo').value.trim();

  if (!nome) { mostraToast('Inserisci un nome per il template', 'error'); return; }
  if (!testo) { mostraToast('Inserisci il testo del messaggio', 'error'); return; }

  // Determina utenteId
  var utenteId = utente.id;
  if (utente.ruolo === 'admin') {
    var visibilita = document.getElementById('tmpl-visibilita').value;
    if (visibilita === 'globale') utenteId = 'globale';
  }

  var dati = {
    utenteId: utenteId,
    tipo: tipo,
    nome: nome,
    oggetto: tipo === 'email' ? oggetto : '',
    testo: testo,
    dataCreazione: firebase.firestore.Timestamp.now()
  };

  try {
    var db = firebase.firestore();

    if (templateInModifica) {
      await db.collection('templateMessaggi').doc(templateInModifica).update(dati);
      mostraToast('Template aggiornato', 'success');
    } else {
      await db.collection('templateMessaggi').add(dati);
      mostraToast('Template creato', 'success');
    }

    chiudiModaleTemplate();
    await caricaTemplate();
  } catch (errore) {
    console.error('Errore salvataggio template:', errore);
    mostraToast('Errore nel salvataggio', 'error');
  }
}

// ===== ELIMINA TEMPLATE =====
async function eliminaTemplate(templateId) {
  if (!confirm('Sei sicuro di voler eliminare questo template?')) return;

  try {
    var db = firebase.firestore();
    await db.collection('templateMessaggi').doc(templateId).delete();
    mostraToast('Template eliminato', 'success');
    await caricaTemplate();
  } catch (errore) {
    console.error('Errore eliminazione:', errore);
    mostraToast('Errore nell\'eliminazione', 'error');
  }
}

// ===== USA TEMPLATE =====
function apriModaleUsa(templateId) {
  var tmpl = templateGlobali.find(function(t) { return t.id === templateId; }) ||
             templatePersonali.find(function(t) { return t.id === templateId; });
  if (!tmpl) return;

  templateDaUsare = tmpl;
  usaLeadSelezionato = null;

  document.getElementById('modal-usa-title').textContent = 'Usa: ' + tmpl.nome;
  document.getElementById('usa-lead-search').value = '';
  document.getElementById('usa-lead-selected-container').style.display = 'none';
  document.getElementById('usa-lead-search').style.display = 'block';
  document.getElementById('usa-preview-container').style.display = 'none';

  document.getElementById('modal-usa-template').classList.add('active');
}

function chiudiModaleUsa() {
  document.getElementById('modal-usa-template').classList.remove('active');
  templateDaUsare = null;
  usaLeadSelezionato = null;
}

function setupRicercaLeadUsa() {
  var input = document.getElementById('usa-lead-search');
  var dropdown = document.getElementById('usa-lead-dropdown');
  var debounceTimer;

  input.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    var query = this.value.trim().toLowerCase();

    if (query.length < 2) {
      dropdown.classList.remove('show');
      return;
    }

    debounceTimer = setTimeout(function() {
      var risultati = leadCache.filter(function(l) {
        var nomeCompleto = (l.nome + ' ' + l.cognome).toLowerCase();
        return nomeCompleto.includes(query) || 
               (l.telefono && l.telefono.includes(query)) ||
               (l.email && l.email.toLowerCase().includes(query));
      }).slice(0, 8);

      if (risultati.length === 0) {
        dropdown.innerHTML = '<div class="lead-search-option"><span class="lead-detail">Nessun lead trovato</span></div>';
      } else {
        dropdown.innerHTML = risultati.map(function(l) {
          return '<div class="lead-search-option" onclick="selezionaUsaLead(\'' + l.id + '\')">' +
            '<div class="lead-name">' + escapeHtml(l.nome) + ' ' + escapeHtml(l.cognome) + '</div>' +
            '<div class="lead-detail">' + (l.telefono || '') + (l.autoRichiesta ? ' \u2022 ' + l.autoRichiesta : '') + '</div>' +
          '</div>';
        }).join('');
      }

      dropdown.classList.add('show');
    }, 200);
  });

  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
}

function selezionaUsaLead(leadId) {
  var lead = leadCache.find(function(l) { return l.id === leadId; });
  if (!lead) return;

  usaLeadSelezionato = lead;

  document.getElementById('usa-lead-selected-name').textContent = lead.nome + ' ' + lead.cognome;
  document.getElementById('usa-lead-selected-container').style.display = 'block';
  document.getElementById('usa-lead-search').style.display = 'none';
  document.getElementById('usa-lead-dropdown').classList.remove('show');

  // Mostra anteprima
  mostraAnteprimaUsa();
}

function rimuoviUsaLead() {
  usaLeadSelezionato = null;
  document.getElementById('usa-lead-selected-container').style.display = 'none';
  document.getElementById('usa-lead-search').style.display = 'block';
  document.getElementById('usa-lead-search').value = '';
  document.getElementById('usa-preview-container').style.display = 'none';
}

function mostraAnteprimaUsa() {
  if (!templateDaUsare || !usaLeadSelezionato) return;

  var utente = getUtenteCorrente();
  var nomeConsulente = utente.nome + ' ' + utente.cognome;
  var testoSostituito = sostituisciVariabili(templateDaUsare.testo, usaLeadSelezionato, nomeConsulente);

  document.getElementById('usa-preview-text').textContent = testoSostituito;
  document.getElementById('usa-preview-container').style.display = 'block';

  // Bottoni azione
  var azioniHtml = '';
  if (templateDaUsare.tipo === 'whatsapp') {
    azioniHtml = '<button class="btn btn-whatsapp" onclick="apriWhatsApp()">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
      ' Apri WhatsApp</button>';
  } else {
    azioniHtml = '<button class="btn btn-email" onclick="apriEmail()">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' +
      ' Apri Email</button>';
  }

  document.getElementById('usa-template-actions').innerHTML = azioniHtml;
}

function apriWhatsApp() {
  if (!templateDaUsare || !usaLeadSelezionato) return;

  var utente = getUtenteCorrente();
  var nomeConsulente = utente.nome + ' ' + utente.cognome;
  var messaggio = sostituisciVariabili(templateDaUsare.testo, usaLeadSelezionato, nomeConsulente);
  var telefono = usaLeadSelezionato.telefono || '';

  // Rimuovi spazi e caratteri non numerici dal telefono
  telefono = telefono.replace(/[^0-9]/g, '');

  // Aggiungi prefisso Italia se non presente
  if (telefono.length === 10 && telefono.charAt(0) === '3') {
    telefono = '39' + telefono;
  }

  var url = 'https://wa.me/' + telefono + '?text=' + encodeURIComponent(messaggio);
  window.open(url, '_blank');

  chiudiModaleUsa();
  mostraToast('WhatsApp aperto', 'success');
}

function apriEmail() {
  if (!templateDaUsare || !usaLeadSelezionato) return;

  var utente = getUtenteCorrente();
  var nomeConsulente = utente.nome + ' ' + utente.cognome;
  var oggetto = sostituisciVariabili(templateDaUsare.oggetto || '', usaLeadSelezionato, nomeConsulente);
  var corpo = sostituisciVariabili(templateDaUsare.testo, usaLeadSelezionato, nomeConsulente);
  var email = usaLeadSelezionato.email || '';

  var url = 'mailto:' + email + '?subject=' + encodeURIComponent(oggetto) + '&body=' + encodeURIComponent(corpo);
  window.location.href = url;

  chiudiModaleUsa();
  mostraToast('Email aperta', 'success');
}

// ===== UTILITY =====
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function mostraToast(messaggio, tipo) {
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast ' + (tipo || 'success');
  toast.innerHTML = '<span class="toast-message">' + messaggio + '</span>';
  container.appendChild(toast);

  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}
