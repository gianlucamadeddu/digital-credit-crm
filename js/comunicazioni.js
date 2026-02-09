// comunicazioni.js — Logica pagina Comunicazioni interne
// Digital Credit CRM

document.addEventListener('DOMContentLoaded', async function () {
  // Verifica autenticazione
  const utente = getUtenteCorrente();
  if (!utente) {
    window.location.href = 'index.html';
    return;
  }

  // Configura sidebar
  configuraSidebar(utente);

  // Mostra bottone "Nuova Comunicazione" solo per Admin e BO
  if (utente.ruolo === 'admin' || utente.ruolo === 'backoffice') {
    document.getElementById('btn-nuova-comunicazione').style.display = 'inline-flex';
  }

  // Carica comunicazioni
  await caricaComunicazioni();

  // Aggiorna badge sidebar
  await aggiornaBadgeComunicazioni(utente);

  // Event listeners
  document.getElementById('btn-nuova-comunicazione').addEventListener('click', apriModaleComunicazione);
  document.getElementById('btn-chiudi-modale').addEventListener('click', chiudiModaleComunicazione);
  document.getElementById('btn-annulla-comunicazione').addEventListener('click', chiudiModaleComunicazione);
  document.getElementById('btn-pubblica-comunicazione').addEventListener('click', pubblicaComunicazione);
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Chiudi modale cliccando fuori
  document.getElementById('modal-nuova-comunicazione').addEventListener('click', function (e) {
    if (e.target === this) chiudiModaleComunicazione();
  });
});

// --- CARICAMENTO COMUNICAZIONI ---

async function caricaComunicazioni() {
  const utente = getUtenteCorrente();
  const listaContainer = document.getElementById('lista-comunicazioni');
  const emptyState = document.getElementById('empty-state');

  try {
    const snapshot = await db.collection('comunicazioni')
      .orderBy('dataCreazione', 'desc')
      .get();

    listaContainer.innerHTML = '';

    if (snapshot.empty) {
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    snapshot.forEach(doc => {
      const com = { id: doc.id, ...doc.data() };
      const card = creaComunicazioneCard(com, utente);
      listaContainer.appendChild(card);
    });

  } catch (errore) {
    console.error('Errore caricamento comunicazioni:', errore);
    listaContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Errore nel caricamento delle comunicazioni.</p>';
  }
}

// --- CREAZIONE CARD COMUNICAZIONE ---

function creaComunicazioneCard(com, utente) {
  const nonLetta = !com.lettoDa || !com.lettoDa.includes(utente.id);
  const data = com.dataCreazione ? formattaDataOra(com.dataCreazione) : '';
  const anteprima = com.messaggio ? com.messaggio.substring(0, 150) + (com.messaggio.length > 150 ? '...' : '') : '';

  const card = document.createElement('div');
  card.className = 'card comunicazione-card fade-in';
  card.dataset.id = com.id;
  if (nonLetta) card.classList.add('comunicazione-non-letta');

  card.innerHTML = `
    <div class="comunicazione-header" onclick="toggleComunicazione('${com.id}')">
      <div class="comunicazione-header-left">
        ${nonLetta ? '<span class="comunicazione-badge-non-letta"></span>' : ''}
        <div>
          <h3 class="comunicazione-titolo">${escapeHtml(com.titolo)}</h3>
          <p class="comunicazione-meta">${escapeHtml(com.autoreNome || 'Sconosciuto')} • ${data}</p>
        </div>
      </div>
      <svg class="comunicazione-chevron" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="comunicazione-anteprima" id="anteprima-${com.id}">
      <p class="comunicazione-anteprima-testo">${escapeHtml(anteprima)}</p>
    </div>
    <div class="comunicazione-corpo" id="corpo-${com.id}" style="display:none;">
      <div class="comunicazione-corpo-testo">${escapeHtml(com.messaggio).replace(/\n/g, '<br>')}</div>
      <button class="btn btn-secondary btn-sm" onclick="chiudiComunicazione('${com.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        Chiudi
      </button>
    </div>
  `;

  return card;
}

// --- TOGGLE ESPANDI/COMPRIMI ---

async function toggleComunicazione(comId) {
  const corpo = document.getElementById('corpo-' + comId);
  const anteprima = document.getElementById('anteprima-' + comId);
  const card = document.querySelector(`.comunicazione-card[data-id="${comId}"]`);

  if (corpo.style.display === 'none') {
    // Espandi
    corpo.style.display = 'block';
    anteprima.style.display = 'none';
    card.classList.add('comunicazione-espansa');

    // Segna come letta
    await segnaComeLettura(comId, card);
  } else {
    // Comprimi
    chiudiComunicazione(comId);
  }
}

function chiudiComunicazione(comId) {
  const corpo = document.getElementById('corpo-' + comId);
  const anteprima = document.getElementById('anteprima-' + comId);
  const card = document.querySelector(`.comunicazione-card[data-id="${comId}"]`);

  corpo.style.display = 'none';
  anteprima.style.display = 'block';
  card.classList.remove('comunicazione-espansa');
}

// --- SEGNA COME LETTA ---

async function segnaComeLettura(comId, card) {
  const utente = getUtenteCorrente();
  if (!utente) return;

  try {
    // Aggiorna Firestore: aggiungi utente a lettoDa
    await db.collection('comunicazioni').doc(comId).update({
      lettoDa: firebase.firestore.FieldValue.arrayUnion(utente.id)
    });

    // Rimuovi badge visuale
    card.classList.remove('comunicazione-non-letta');
    const badge = card.querySelector('.comunicazione-badge-non-letta');
    if (badge) badge.remove();

    // Aggiorna badge sidebar
    await aggiornaBadgeComunicazioni(utente);

  } catch (errore) {
    console.error('Errore nel segnare come letta:', errore);
  }
}

// --- MODALE NUOVA COMUNICAZIONE ---

function apriModaleComunicazione() {
  document.getElementById('com-titolo').value = '';
  document.getElementById('com-messaggio').value = '';
  document.getElementById('modal-nuova-comunicazione').style.display = 'flex';
}

function chiudiModaleComunicazione() {
  document.getElementById('modal-nuova-comunicazione').style.display = 'none';
}

async function pubblicaComunicazione() {
  const utente = getUtenteCorrente();
  const titolo = document.getElementById('com-titolo').value.trim();
  const messaggio = document.getElementById('com-messaggio').value.trim();

  if (!titolo) {
    mostraToast('Inserisci un titolo', 'errore');
    return;
  }
  if (!messaggio) {
    mostraToast('Inserisci un messaggio', 'errore');
    return;
  }

  const btnPubblica = document.getElementById('btn-pubblica-comunicazione');
  btnPubblica.disabled = true;
  btnPubblica.textContent = 'Pubblicazione...';

  try {
    await db.collection('comunicazioni').add({
      autoreId: utente.id,
      autoreNome: utente.nome + ' ' + utente.cognome,
      titolo: titolo,
      messaggio: messaggio,
      dataCreazione: firebase.firestore.FieldValue.serverTimestamp(),
      lettoDa: [utente.id] // L'autore l'ha già "letta"
    });

    chiudiModaleComunicazione();
    mostraToast('Comunicazione pubblicata con successo', 'successo');
    await caricaComunicazioni();

  } catch (errore) {
    console.error('Errore pubblicazione comunicazione:', errore);
    mostraToast('Errore nella pubblicazione', 'errore');
  } finally {
    btnPubblica.disabled = false;
    btnPubblica.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      Pubblica
    `;
  }
}

// --- BADGE COMUNICAZIONI SIDEBAR ---

async function aggiornaBadgeComunicazioni(utente) {
  try {
    const snapshot = await db.collection('comunicazioni').get();
    let nonLette = 0;

    snapshot.forEach(doc => {
      const com = doc.data();
      if (!com.lettoDa || !com.lettoDa.includes(utente.id)) {
        nonLette++;
      }
    });

    const badge = document.getElementById('sidebar-badge-comunicazioni');
    if (nonLette > 0) {
      badge.textContent = nonLette;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (errore) {
    console.error('Errore aggiornamento badge:', errore);
  }
}

// --- CONFIGURAZIONE SIDEBAR ---

function configuraSidebar(utente) {
  // Nome e ruolo
  document.getElementById('sidebar-user-name').textContent = utente.nome + ' ' + utente.cognome;
  document.getElementById('sidebar-user-role').textContent = utente.ruolo.charAt(0).toUpperCase() + utente.ruolo.slice(1);

  // Voci visibili in base al ruolo
  if (utente.ruolo === 'admin') {
    document.getElementById('sidebar-admin-section').style.display = 'block';
    document.getElementById('sidebar-impostazioni').style.display = 'flex';
    document.getElementById('sidebar-backoffice').style.display = 'flex';
  }
  if (utente.ruolo === 'backoffice') {
    document.getElementById('sidebar-backoffice').style.display = 'flex';
  }
}

// --- UTILITY ---

function formattaDataOra(timestamp) {
  if (!timestamp) return '';
  const data = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const opzioni = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  return data.toLocaleDateString('it-IT', opzioni);
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

// Funzioni globali per onclick inline
window.toggleComunicazione = toggleComunicazione;
window.chiudiComunicazione = chiudiComunicazione;
