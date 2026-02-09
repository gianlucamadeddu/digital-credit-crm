// =============================================
// dashboard.js — Logica Dashboard Digital Credit
// =============================================

(function () {
  'use strict';

  // Riferimento Firestore
  const db = firebase.firestore();

  // Variabili globali
  let utenteCorrente = null;
  let periodoCorrente = 'mese'; // default

  // =============================================
  // INIZIALIZZAZIONE
  // =============================================

  document.addEventListener('DOMContentLoaded', function () {
    // Controlla autenticazione
    utenteCorrente = getUtenteCorrente();
    if (!utenteCorrente) {
      window.location.href = 'index.html';
      return;
    }

    // Configura UI in base al ruolo
    configuraRuolo();

    // Mostra nome utente nella sidebar
    aggiornaSidebarUtente();

    // Carica tutti i dati
    caricaDashboard();

    // Listener selettore periodo
    document.getElementById('select-periodo').addEventListener('change', function () {
      periodoCorrente = this.value;
      caricaDashboard();
    });

    // Listener logout
    document.getElementById('btn-logout').addEventListener('click', function () {
      logout();
    });

    // Click sui widget
    document.getElementById('widget-lead-totali').addEventListener('click', function () {
      window.location.href = 'lead-elenco.html';
    });
    document.getElementById('widget-appuntamenti').addEventListener('click', function () {
      window.location.href = 'agenda.html';
    });
    document.getElementById('widget-contratti').addEventListener('click', function () {
      window.location.href = 'report.html';
    });
    document.getElementById('widget-lead-nuovi').addEventListener('click', function () {
      if (utenteCorrente.ruolo === 'backoffice') {
        window.location.href = 'backoffice.html';
      } else {
        window.location.href = 'lead-kanban.html';
      }
    });
  });

  // =============================================
  // CONFIGURAZIONE RUOLO
  // =============================================

  function configuraRuolo() {
    var ruolo = utenteCorrente.ruolo;

    // Mostra/nascondi sezione admin
    if (ruolo !== 'admin') {
      var sezAdmin = document.getElementById('section-admin');
      var menuImpostazioni = document.getElementById('menu-impostazioni');
      if (sezAdmin) sezAdmin.style.display = 'none';
      if (menuImpostazioni) menuImpostazioni.style.display = 'none';
    }

    // Sottotitolo in base al ruolo
    var subtitleEl = document.getElementById('page-subtitle');
    if (ruolo === 'consulente') {
      subtitleEl.textContent = 'I tuoi lead e appuntamenti';
    } else if (ruolo === 'backoffice') {
      subtitleEl.textContent = 'Richieste e pratiche in corso';
    } else {
      subtitleEl.textContent = 'Panoramica generale';
    }

    // Per Back Office: personalizza widget 4 e card BO
    if (ruolo === 'backoffice') {
      // Widget 4: cambia label
      var labelWidget4 = document.getElementById('label-lead-nuovi');
      if (labelWidget4) labelWidget4.textContent = 'Richieste in Attesa';

      // Card BO: cambia titolo
      var titoloBO = document.getElementById('titolo-sezione-bo');
      if (titoloBO) titoloBO.textContent = 'Richieste Back Office';
    }
  }

  // =============================================
  // AGGIORNA SIDEBAR UTENTE
  // =============================================

  function aggiornaSidebarUtente() {
    var nomeEl = document.getElementById('sidebar-user-name');
    var ruoloEl = document.getElementById('sidebar-user-role');
    if (nomeEl) nomeEl.textContent = utenteCorrente.nome + ' ' + utenteCorrente.cognome;
    if (ruoloEl) {
      var ruoloLabel = {
        admin: 'Amministratore',
        consulente: 'Consulente',
        backoffice: 'Back Office'
      };
      ruoloEl.textContent = ruoloLabel[utenteCorrente.ruolo] || utenteCorrente.ruolo;
    }
  }

  // =============================================
  // CARICA DASHBOARD (orchestratore)
  // =============================================

  function caricaDashboard() {
    caricaWidgetLead();
    caricaWidgetAppuntamenti();
    caricaWidgetContratti();
    caricaClientiRecenti();
    caricaAppuntamentiOggi();
    caricaComunicazioni();
    caricaRisposteBO();
  }

  // =============================================
  // HELPER: Calcola date periodo
  // =============================================

  function getDatePeriodo() {
    var ora = new Date();
    var da, a;
    a = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate(), 23, 59, 59, 999);

    switch (periodoCorrente) {
      case 'mese':
        da = new Date(ora.getFullYear(), ora.getMonth(), 1);
        break;
      case 'trimestre':
        da = new Date(ora.getFullYear(), ora.getMonth() - 2, 1);
        break;
      case 'anno':
        da = new Date(ora.getFullYear(), 0, 1);
        break;
      case 'tutto':
        da = new Date(2020, 0, 1); // data molto vecchia
        break;
      default:
        da = new Date(ora.getFullYear(), ora.getMonth(), 1);
    }
    return { da: da, a: a };
  }

  function getOggiRange() {
    var ora = new Date();
    var inizio = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate(), 0, 0, 0, 0);
    var fine = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate(), 23, 59, 59, 999);
    return { inizio: inizio, fine: fine };
  }

  // =============================================
  // WIDGET 1: Lead Totali + WIDGET 4: Lead Nuovi / Richieste BO
  // =============================================

  function caricaWidgetLead() {
    var periodo = getDatePeriodo();
    var query = db.collection('lead')
      .where('dataCreazione', '>=', firebase.firestore.Timestamp.fromDate(periodo.da))
      .where('dataCreazione', '<=', firebase.firestore.Timestamp.fromDate(periodo.a));

    // Filtro per ruolo
    if (utenteCorrente.ruolo === 'consulente') {
      query = query.where('consulenteId', '==', utenteCorrente.id);
    }

    query.get().then(function (snapshot) {
      var totali = 0;
      var nuovi = 0;

      snapshot.forEach(function (doc) {
        var lead = doc.data();

        // Per backoffice: mostra solo lead in fasi BO
        if (utenteCorrente.ruolo === 'backoffice') {
          var fasiBO = ['backoffice', 'preventivo', 'perfezionamento'];
          if (fasiBO.indexOf(lead.fase) === -1) return;
        }

        totali++;
        if (lead.stato === 'nuovo') {
          nuovi++;
        }
      });

      document.getElementById('num-lead-totali').textContent = totali;

      // Per BO il widget 4 mostra le richieste in attesa (calcolato separatamente)
      if (utenteCorrente.ruolo !== 'backoffice') {
        document.getElementById('num-lead-nuovi').textContent = nuovi;
      }
    }).catch(function (errore) {
      console.log('Errore caricamento lead:', errore);
      document.getElementById('num-lead-totali').textContent = '0';
      if (utenteCorrente.ruolo !== 'backoffice') {
        document.getElementById('num-lead-nuovi').textContent = '0';
      }
    });

    // Per BO: conta le richieste in attesa per il widget 4
    if (utenteCorrente.ruolo === 'backoffice') {
      contaRichiesteInAttesa();
    }
  }

  // Conta richieste in attesa per il widget BO
  function contaRichiesteInAttesa() {
    db.collection('lead').get().then(function (leadSnapshot) {
      var promesse = [];

      leadSnapshot.forEach(function (doc) {
        var p = db.collection('lead').doc(doc.id)
          .collection('richiesteBO')
          .where('stato', '==', 'in_attesa')
          .get()
          .then(function (richSnap) {
            return richSnap.size;
          });
        promesse.push(p);
      });

      return Promise.all(promesse);
    }).then(function (conteggi) {
      var totale = 0;
      conteggi.forEach(function (n) { totale += n; });
      document.getElementById('num-lead-nuovi').textContent = totale;
    }).catch(function (errore) {
      console.log('Errore conteggio richieste BO:', errore);
      document.getElementById('num-lead-nuovi').textContent = '0';
    });
  }

  // =============================================
  // WIDGET 2: Appuntamenti Oggi
  // =============================================

  function caricaWidgetAppuntamenti() {
    var oggi = getOggiRange();
    var query = db.collection('appuntamenti')
      .where('dataOra', '>=', firebase.firestore.Timestamp.fromDate(oggi.inizio))
      .where('dataOra', '<=', firebase.firestore.Timestamp.fromDate(oggi.fine));

    // Filtro per ruolo
    if (utenteCorrente.ruolo === 'consulente' || utenteCorrente.ruolo === 'backoffice') {
      query = query.where('utenteId', '==', utenteCorrente.id);
    }

    query.get().then(function (snapshot) {
      document.getElementById('num-appuntamenti').textContent = snapshot.size;
    }).catch(function (errore) {
      console.log('Errore caricamento appuntamenti:', errore);
      document.getElementById('num-appuntamenti').textContent = '0';
    });
  }

  // =============================================
  // WIDGET 3: Contratti Firmati
  // =============================================

  function caricaWidgetContratti() {
    var periodo = getDatePeriodo();
    var query = db.collection('contratti')
      .where('dataFirma', '>=', firebase.firestore.Timestamp.fromDate(periodo.da))
      .where('dataFirma', '<=', firebase.firestore.Timestamp.fromDate(periodo.a));

    // Filtro per consulente
    if (utenteCorrente.ruolo === 'consulente') {
      query = query.where('consulenteId', '==', utenteCorrente.id);
    }

    query.get().then(function (snapshot) {
      document.getElementById('num-contratti').textContent = snapshot.size;
    }).catch(function (errore) {
      console.log('Errore caricamento contratti:', errore);
      document.getElementById('num-contratti').textContent = '0';
    });
  }

  // =============================================
  // LISTA: Clienti Recenti (ultimi 10)
  // =============================================

  function caricaClientiRecenti() {
    var container = document.getElementById('lista-clienti-recenti');
    var periodo = getDatePeriodo();

    var query = db.collection('lead')
      .where('dataCreazione', '>=', firebase.firestore.Timestamp.fromDate(periodo.da))
      .where('dataCreazione', '<=', firebase.firestore.Timestamp.fromDate(periodo.a))
      .orderBy('dataCreazione', 'desc')
      .limit(5);

    // Filtro per consulente
    if (utenteCorrente.ruolo === 'consulente') {
      query = db.collection('lead')
        .where('consulenteId', '==', utenteCorrente.id)
        .orderBy('dataCreazione', 'desc')
        .limit(10);
    }

    query.get().then(function (snapshot) {
      container.innerHTML = '';

      if (snapshot.empty) {
        container.innerHTML = mostraEmptyState(
          '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
          'Nessun lead nel periodo selezionato'
        );
        return;
      }

      snapshot.forEach(function (doc) {
        var lead = doc.data();
        var id = doc.id;

        // Filtro aggiuntivo per backoffice (lato client)
        if (utenteCorrente.ruolo === 'backoffice') {
          var fasiBO = ['backoffice', 'preventivo', 'perfezionamento'];
          if (fasiBO.indexOf(lead.fase) === -1) return;
        }

        var dataStr = formattaDataBreve(lead.dataCreazione);
        var tipoInfo = lead.tipoCliente === 'privato' ? 'Privato' : (lead.tipoCliente === 'azienda' ? 'Azienda' : 'P.IVA');
        var badgeClass = getBadgeClass(lead.stato);
        var badgeLabel = capitalizza(lead.stato ? lead.stato.replace(/_/g, ' ') : '—');

        var item = document.createElement('div');
        item.className = 'client-list-item';
        item.style.cursor = 'pointer';
        item.addEventListener('click', function () {
          window.location.href = 'lead-dettaglio.html?id=' + id;
        });

        item.innerHTML =
          '<div class="client-info">' +
            '<span class="client-name">' + escapeHtml((lead.nome || '') + ' ' + (lead.cognome || '')) + '</span>' +
            '<span class="client-company">' + escapeHtml(tipoInfo) + ' &bull; ' + dataStr + '</span>' +
          '</div>' +
          '<span class="badge ' + badgeClass + '">' + escapeHtml(badgeLabel) + '</span>';

        container.appendChild(item);
      });
    }).catch(function (errore) {
      console.log('Errore caricamento clienti recenti:', errore);
      container.innerHTML = mostraEmptyState(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        'Errore nel caricamento dei dati'
      );
    });
  }

  // =============================================
  // LISTA: Appuntamenti Oggi
  // =============================================

  function caricaAppuntamentiOggi() {
    var container = document.getElementById('lista-appuntamenti-oggi');
    var oggi = getOggiRange();

    var query = db.collection('appuntamenti')
      .where('dataOra', '>=', firebase.firestore.Timestamp.fromDate(oggi.inizio))
      .where('dataOra', '<=', firebase.firestore.Timestamp.fromDate(oggi.fine))
      .orderBy('dataOra', 'asc')
      .limit(5);

    // Filtro per ruolo
    if (utenteCorrente.ruolo === 'consulente' || utenteCorrente.ruolo === 'backoffice') {
      query = db.collection('appuntamenti')
        .where('utenteId', '==', utenteCorrente.id)
        .where('dataOra', '>=', firebase.firestore.Timestamp.fromDate(oggi.inizio))
        .where('dataOra', '<=', firebase.firestore.Timestamp.fromDate(oggi.fine))
        .orderBy('dataOra', 'asc')
        .limit(5);
    }

    query.get().then(function (snapshot) {
      container.innerHTML = '';

      if (snapshot.empty) {
        container.innerHTML = mostraEmptyState(
          '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
          'Nessun appuntamento oggi'
        );
        return;
      }

      snapshot.forEach(function (doc) {
        var app = doc.data();
        var ora = '';
        if (app.dataOra && app.dataOra.toDate) {
          var d = app.dataOra.toDate();
          ora = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        }

        var tipoColore = {
          appuntamento: 'var(--status-contact)',
          followup: 'var(--status-appointment)',
          scadenza_personale: 'var(--status-new)',
          scadenza_pratica: 'var(--status-lost)'
        };
        var colore = tipoColore[app.tipo] || 'var(--status-contact)';

        var item = document.createElement('div');
        item.className = 'appointment-item';
        item.innerHTML =
          '<div class="appointment-time" style="color:' + colore + ';">' + escapeHtml(ora) + '</div>' +
          '<div class="appointment-info">' +
            '<div class="appointment-title">' + escapeHtml(app.titolo || 'Senza titolo') + '</div>' +
            (app.descrizione ? '<div class="appointment-desc">' + escapeHtml(app.descrizione) + '</div>' : '') +
          '</div>';
        container.appendChild(item);
      });
    }).catch(function (errore) {
      console.log('Errore caricamento appuntamenti:', errore);
      container.innerHTML = mostraEmptyState(
        '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        'Nessun appuntamento oggi'
      );
    });
  }

  // =============================================
  // LISTA: Risposte BO (consulenti/admin) / Richieste BO (backoffice)
  // =============================================

  function caricaRisposteBO() {
    // Per backoffice: mostra le richieste da gestire
    if (utenteCorrente.ruolo === 'backoffice') {
      caricaRichiestePerBO();
      return;
    }

    // Per consulenti/admin: mostra le risposte completate non lette
    caricaRispostePerConsulente();
  }

  // --- BACKOFFICE: Richieste in attesa e in lavorazione ---
  function caricaRichiestePerBO() {
    var container = document.getElementById('lista-risposte-bo');
    var badgeEl = document.getElementById('badge-risposte-bo');

    // Prendi tutti i lead per cercare le subcollection richiesteBO
    db.collection('lead').get().then(function (leadSnapshot) {
      var promesse = [];
      var leadMap = {};

      leadSnapshot.forEach(function (doc) {
        var leadData = doc.data();
        var leadId = doc.id;
        leadMap[leadId] = {
          nome: (leadData.nome || '') + ' ' + (leadData.cognome || ''),
          auto: leadData.autoRichiesta || ''
        };

        // Cerca richieste in_attesa e in_lavorazione
        var p = db.collection('lead').doc(leadId)
          .collection('richiesteBO')
          .where('stato', 'in', ['in_attesa', 'in_lavorazione'])
          .get()
          .then(function (richSnap) {
            var risultati = [];
            richSnap.forEach(function (richDoc) {
              var richData = richDoc.data();
              risultati.push({
                richiestaId: richDoc.id,
                leadId: leadId,
                nomeCliente: leadMap[leadId].nome,
                auto: leadMap[leadId].auto,
                tipo: richData.tipo || 'preventivo',
                stato: richData.stato,
                richiedenteNome: richData.richiedenteNome || '—',
                nota: richData.nota || '',
                dataRichiesta: richData.dataRichiesta
              });
            });
            return risultati;
          });

        promesse.push(p);
      });

      return Promise.all(promesse);
    }).then(function (risultatiArray) {
      // Appiattisci
      var richieste = [];
      risultatiArray.forEach(function (arr) {
        richieste = richieste.concat(arr);
      });

      // Ordina: prima in_attesa, poi in_lavorazione, poi per data (più vecchie prima = priorità)
      richieste.sort(function (a, b) {
        // Priorità stato: in_attesa prima
        if (a.stato === 'in_attesa' && b.stato !== 'in_attesa') return -1;
        if (a.stato !== 'in_attesa' && b.stato === 'in_attesa') return 1;
        // Poi per data (più vecchie prima)
        var da = a.dataRichiesta ? (a.dataRichiesta.toDate ? a.dataRichiesta.toDate().getTime() : 0) : 0;
        var db2 = b.dataRichiesta ? (b.dataRichiesta.toDate ? b.dataRichiesta.toDate().getTime() : 0) : 0;
        return da - db2;
      });

      container.innerHTML = '';

      // Aggiorna badge
      var inAttesa = richieste.filter(function (r) { return r.stato === 'in_attesa'; }).length;
      if (inAttesa > 0) {
        badgeEl.textContent = inAttesa;
        badgeEl.style.display = 'inline-flex';
      } else {
        badgeEl.style.display = 'none';
      }

      if (richieste.length === 0) {
        container.innerHTML = mostraEmptyState(
          '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
          'Nessuna richiesta da gestire'
        );
        return;
      }

      // Mostra max 8 richieste
      var max = Math.min(richieste.length, 8);
      for (var i = 0; i < max; i++) {
        var r = richieste[i];
        var tipoLabel = r.tipo === 'preventivo' ? 'Preventivo' : (r.tipo === 'consulenza' ? 'Consulenza' : 'Fattibilità');
        var dataStr = r.dataRichiesta && r.dataRichiesta.toDate ? formattaDataBreve(r.dataRichiesta) : '—';

        var statoBadge = r.stato === 'in_attesa' ? 'badge-appointment' : 'badge-working';
        var statoLabel = r.stato === 'in_attesa' ? 'In attesa' : 'In lavorazione';

        var item = document.createElement('div');
        item.className = 'richiesta-bo-dash-item';
        item.style.cursor = 'pointer';

        item.innerHTML =
          '<div class="richiesta-bo-dash-left">' +
            '<div class="richiesta-bo-dash-info">' +
              '<div class="richiesta-bo-dash-cliente">' + escapeHtml(r.nomeCliente) + '</div>' +
              '<div class="richiesta-bo-dash-dettaglio">' +
                escapeHtml(tipoLabel) + ' &bull; da ' + escapeHtml(r.richiedenteNome) + ' &bull; ' + dataStr +
              '</div>' +
              (r.nota ? '<div class="richiesta-bo-dash-nota">' + escapeHtml(r.nota.substring(0, 80)) + (r.nota.length > 80 ? '...' : '') + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<span class="badge ' + statoBadge + '" style="white-space:nowrap;">' + escapeHtml(statoLabel) + '</span>';

        // Click → vai al dettaglio lead
        (function (leadId) {
          item.addEventListener('click', function () {
            window.location.href = 'lead-dettaglio.html?id=' + leadId;
          });
        })(r.leadId);

        container.appendChild(item);
      }

      // Link "Vedi tutte" se ce ne sono di più
      if (richieste.length > max) {
        var linkTutte = document.createElement('div');
        linkTutte.style.textAlign = 'center';
        linkTutte.style.paddingTop = 'var(--space-3)';
        linkTutte.innerHTML = '<a href="backoffice.html" style="color: var(--brand-primary); font-size: var(--text-sm); font-weight: var(--font-medium); text-decoration: none;">Vedi tutte le richieste (' + richieste.length + ') →</a>';
        container.appendChild(linkTutte);
      }

    }).catch(function (errore) {
      console.log('Errore caricamento richieste BO:', errore);
      container.innerHTML = mostraEmptyState(
        '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        'Errore nel caricamento'
      );
    });
  }

  // --- CONSULENTI/ADMIN: Risposte BO completate non lette ---
  function caricaRispostePerConsulente() {
    var container = document.getElementById('lista-risposte-bo');
    var badgeEl = document.getElementById('badge-risposte-bo');

    // Prendi i lead del consulente (o tutti se admin)
    var queryLead = db.collection('lead');
    if (utenteCorrente.ruolo === 'consulente') {
      queryLead = queryLead.where('consulenteId', '==', utenteCorrente.id);
    }

    queryLead.get().then(function (leadSnapshot) {
      var promesse = [];
      var leadMap = {};

      leadSnapshot.forEach(function (doc) {
        var leadData = doc.data();
        var leadId = doc.id;
        leadMap[leadId] = {
          nome: (leadData.nome || '') + ' ' + (leadData.cognome || ''),
          auto: leadData.autoRichiesta || ''
        };

        // Cerca le risposte BO completate e non lette
        var p = db.collection('lead').doc(leadId)
          .collection('richiesteBO')
          .where('stato', '==', 'completata')
          .get()
          .then(function (richSnap) {
            var risultati = [];
            richSnap.forEach(function (richDoc) {
              var richData = richDoc.data();
              // Mostra solo quelle non lette dal consulente
              if (richData.lettaDalConsulente === false) {
                risultati.push({
                  richiestaId: richDoc.id,
                  leadId: leadId,
                  nomeCliente: leadMap[leadId].nome,
                  auto: leadMap[leadId].auto,
                  tipo: richData.tipo || 'preventivo',
                  rispostaBO: richData.rispostaBO || '',
                  gestoreBONome: richData.gestoreBONome || 'Back Office',
                  dataRisposta: richData.dataRisposta
                });
              }
            });
            return risultati;
          });

        promesse.push(p);
      });

      return Promise.all(promesse);
    }).then(function (risultatiArray) {
      // Appiattisci l'array
      var risposte = [];
      risultatiArray.forEach(function (arr) {
        risposte = risposte.concat(arr);
      });

      // Ordina per data risposta (più recenti prima)
      risposte.sort(function (a, b) {
        var da = a.dataRisposta ? (a.dataRisposta.toDate ? a.dataRisposta.toDate().getTime() : 0) : 0;
        var db2 = b.dataRisposta ? (b.dataRisposta.toDate ? b.dataRisposta.toDate().getTime() : 0) : 0;
        return db2 - da;
      });

      container.innerHTML = '';

      // Aggiorna badge
      if (risposte.length > 0) {
        badgeEl.textContent = risposte.length;
        badgeEl.style.display = 'inline-flex';
      } else {
        badgeEl.style.display = 'none';
      }

      if (risposte.length === 0) {
        container.innerHTML = mostraEmptyState(
          '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
          'Nessuna risposta da leggere'
        );
        return;
      }

      // Mostra max 5 risposte
      var max = Math.min(risposte.length, 5);
      for (var i = 0; i < max; i++) {
        var r = risposte[i];
        var tipoLabel = r.tipo === 'preventivo' ? 'Preventivo' : (r.tipo === 'consulenza' ? 'Consulenza' : 'Fattibilità');
        var dataStr = r.dataRisposta && r.dataRisposta.toDate ? formattaDataBreve(r.dataRisposta) : '—';

        var item = document.createElement('div');
        item.className = 'risposta-bo-item';
        item.setAttribute('data-lead-id', r.leadId);
        item.setAttribute('data-richiesta-id', r.richiestaId);
        item.style.cursor = 'pointer';

        item.innerHTML =
          '<div class="risposta-bo-left">' +
            '<span class="risposta-bo-dot"></span>' +
            '<div class="risposta-bo-info">' +
              '<div class="risposta-bo-cliente">' + escapeHtml(r.nomeCliente) + '</div>' +
              '<div class="risposta-bo-dettaglio">' + escapeHtml(tipoLabel) + ' &bull; ' + dataStr + '</div>' +
              '<div class="risposta-bo-testo">' + escapeHtml(r.rispostaBO.substring(0, 80)) + (r.rispostaBO.length > 80 ? '...' : '') + '</div>' +
            '</div>' +
          '</div>';

        // Click → vai al lead e segna come letta
        (function (leadId, richiestaId) {
          item.addEventListener('click', function () {
            // Segna come letta
            db.collection('lead').doc(leadId)
              .collection('richiesteBO').doc(richiestaId)
              .update({ lettaDalConsulente: true })
              .then(function () {
                window.location.href = 'lead-dettaglio.html?id=' + leadId;
              })
              .catch(function () {
                window.location.href = 'lead-dettaglio.html?id=' + leadId;
              });
          });
        })(r.leadId, r.richiestaId);

        container.appendChild(item);
      }

    }).catch(function (errore) {
      console.log('Errore caricamento risposte BO:', errore);
      container.innerHTML = mostraEmptyState(
        '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        'Errore nel caricamento'
      );
    });
  }

  // =============================================
  // LISTA: Comunicazioni (ultime 3)
  // =============================================

  function caricaComunicazioni() {
    var container = document.getElementById('lista-comunicazioni');
    var badgeEl = document.getElementById('badge-comunicazioni');
    var sidebarBadge = document.getElementById('sidebar-badge-comunicazioni');

    db.collection('comunicazioni')
      .orderBy('dataCreazione', 'desc')
      .limit(3)
      .get()
      .then(function (snapshot) {
        container.innerHTML = '';
        var nonLette = 0;

        if (snapshot.empty) {
          container.innerHTML = mostraEmptyState(
            '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
            'Nessuna comunicazione'
          );
          badgeEl.style.display = 'none';
          sidebarBadge.style.display = 'none';
          return;
        }

        snapshot.forEach(function (doc) {
          var com = doc.data();
          var letta = com.lettoDa && com.lettoDa.indexOf(utenteCorrente.id) !== -1;
          if (!letta) nonLette++;

          var dataStr = formattaDataBreve(com.dataCreazione);

          var item = document.createElement('div');
          item.className = 'comunicazione-item';
          item.style.cursor = 'pointer';
          item.addEventListener('click', function () {
            window.location.href = 'comunicazioni.html';
          });

          item.innerHTML =
            '<div class="comunicazione-left">' +
              (!letta ? '<span class="comunicazione-dot"></span>' : '<span class="comunicazione-dot-placeholder"></span>') +
              '<div>' +
                '<div class="comunicazione-titolo">' + escapeHtml(com.titolo || 'Senza titolo') + '</div>' +
                '<div class="comunicazione-data">' + dataStr + '</div>' +
              '</div>' +
            '</div>';

          container.appendChild(item);
        });

        // Badge comunicazioni
        if (nonLette > 0) {
          badgeEl.textContent = nonLette;
          badgeEl.style.display = 'inline-flex';
          sidebarBadge.textContent = nonLette;
          sidebarBadge.style.display = 'inline-flex';
        } else {
          badgeEl.style.display = 'none';
          sidebarBadge.style.display = 'none';
        }
      })
      .catch(function (errore) {
        console.log('Errore caricamento comunicazioni:', errore);
        container.innerHTML = mostraEmptyState(
          '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>',
          'Nessuna comunicazione'
        );
      });
  }

  // =============================================
  // UTILITY LOCALI
  // =============================================

  // Mappa stato → classe badge CSS
  function getBadgeClass(stato) {
    var mappa = {
      'nuovo': 'badge-new',
      'in_contatto': 'badge-contact',
      'contattato': 'badge-contact',
      'in_lavorazione': 'badge-working',
      'appuntamento': 'badge-appointment',
      'analisi_esigenze': 'badge-working',
      'richiesta_bo': 'badge-bo',
      'preventivo': 'badge-offer',
      'trattativa': 'badge-offer',
      'perfezionamento': 'badge-working',
      'venduto': 'badge-won',
      'contratto_firmato': 'badge-won',
      'perso': 'badge-lost',
      'non_interessato': 'badge-lost'
    };
    return mappa[stato] || 'badge-contact';
  }

  // Formatta data breve (es: "29 gen")
  function formattaDataBreve(timestamp) {
    if (!timestamp) return '—';
    var d;
    if (timestamp.toDate) {
      d = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      d = timestamp;
    } else {
      return '—';
    }
    var mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    return d.getDate() + ' ' + mesi[d.getMonth()];
  }

  // Capitalizza prima lettera
  function capitalizza(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // Empty state generico
  function mostraEmptyState(iconSvg, messaggio) {
    return '<div class="empty-state">' +
      '<div class="empty-state-icon">' + iconSvg + '</div>' +
      '<p class="empty-state-text">' + messaggio + '</p>' +
    '</div>';
  }

  // =============================================
  // FUNZIONI AUTH (fallback se auth.js non definisce)
  // =============================================

  if (typeof window.getUtenteCorrente === 'undefined') {
    window.getUtenteCorrente = function () {
      try {
        var dati = sessionStorage.getItem('utente');
        return dati ? JSON.parse(dati) : null;
      } catch (e) {
        return null;
      }
    };
  }

  if (typeof window.logout === 'undefined') {
    window.logout = function () {
      sessionStorage.removeItem('utente');
      window.location.href = 'index.html';
    };
  }

  // Alias locali
  function getUtenteCorrente() {
    return window.getUtenteCorrente();
  }

  function logout() {
    window.logout();
  }

})();
