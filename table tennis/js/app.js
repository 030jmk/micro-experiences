window.PongScore = window.PongScore || {};

(function(PS) {
  var currentMatch = null;
  var currentTournament = null;
  var currentTournamentMatchId = null;
  var tournamentPlayers = ['', '', '', ''];

  // ── Init ──
  function init() {
    PS.Storage.init().then(function() {
      initTheme();
      initLang();
      PS.UI.updateI18nDOM();
      bindEvents();
      handleRoute();
      registerSW();
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function() {});
    }
  }

  // ── Theme ──
  function initTheme() {
    var saved = localStorage.getItem('ps-theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-bs-theme', theme);
    updateThemeBtn(theme);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-bs-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-bs-theme', next);
    localStorage.setItem('ps-theme', next);
    updateThemeBtn(next);
  }

  function themeIconHtml(theme) {
    return theme === 'dark' ?
      '<i class="bi bi-sun-fill"></i>' :
      '<i class="bi bi-moon-fill"></i>';
  }

  function updateThemeBtn(theme) {
    var html = themeIconHtml(theme);
    document.getElementById('btn-theme').innerHTML = html;
    var scoringBtn = document.getElementById('btn-scoring-theme');
    if (scoringBtn) scoringBtn.innerHTML = html;
  }

  // ── Language ──
  function initLang() {
    updateLangBtn();
  }

  function toggleLang() {
    var current = PS.i18n.getLocale();
    PS.i18n.setLocale(current === 'en' ? 'de' : 'en');
    updateLangBtn();
    PS.UI.updateI18nDOM();
    handleRoute();
  }

  function updateLangBtn() {
    document.getElementById('btn-lang').textContent = PS.i18n.getLocale().toUpperCase();
  }

  // ── Router ──
  function handleRoute() {
    var hash = location.hash || '#home';
    var parts = hash.split('/');
    var route = parts[0];
    var param = parts[1] || null;

    document.querySelectorAll('.view-section').forEach(function(s) {
      s.classList.remove('active');
    });

    var navbar = document.getElementById('main-navbar');
    navbar.classList.remove('d-none');
    document.getElementById('match-complete-overlay').classList.add('d-none');

    if (route !== '#scoring') {
      PS.wakeLock.release();
    }

    switch (route) {
      case '#home':
        showView('view-home');
        renderHome();
        break;
      case '#new-match':
        showView('view-new-match');
        renderNewMatch();
        break;
      case '#scoring':
        showView('view-scoring');
        navbar.classList.add('d-none');
        if (!currentMatch) {
          var saved = PS.Storage.loadCurrentMatch();
          if (saved) currentMatch = PS.MatchEngine.fromJSON(saved);
        }
        if (currentMatch) {
          PS.UI.updateScoringView(currentMatch);
          if (currentMatch.status === 'completed') {
            onMatchComplete();
          } else {
            PS.wakeLock.request();
          }
        } else {
          navigate('#home');
        }
        break;
      case '#match-history':
        showView('view-match-history');
        renderMatchHistory();
        break;
      case '#match-detail':
        showView('view-match-detail');
        renderMatchDetailView(param);
        break;
      case '#new-tournament':
        showView('view-new-tournament');
        renderNewTournament();
        break;
      case '#tournament':
        showView('view-tournament');
        renderTournamentView(param);
        break;
      case '#tournament-history':
        showView('view-tournament-history');
        renderTournamentHistory();
        break;
      default:
        showView('view-home');
        renderHome();
    }
  }

  function showView(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  function navigate(hash) {
    location.hash = hash;
  }

  // ── Home ──
  function renderHome() {
    var banner = document.getElementById('resume-banner');
    var saved = PS.Storage.loadCurrentMatch();
    var savedT = PS.Storage.loadCurrentTournament();
    var html = '';

    if (saved) {
      currentMatch = PS.MatchEngine.fromJSON(saved);
      var t = PS.i18n.t;
      html += '<div class="alert alert-info d-flex justify-content-between align-items-center mb-2" role="alert">';
      html += '<span><i class="bi bi-play-circle me-2"></i>' + t('home.resume') + ': ' +
        PS.UI.escHtml(currentMatch.getLeftName()) + ' vs ' + PS.UI.escHtml(currentMatch.getRightName()) + '</span>';
      html += '<button class="btn btn-sm btn-info" id="btn-resume-match">' + t('home.resume') + '</button>';
      html += '</div>';
    }

    if (savedT) {
      currentTournament = PS.Tournament.restore(savedT);
      var t2 = PS.i18n.t;
      html += '<div class="alert alert-warning d-flex justify-content-between align-items-center mb-2" role="alert">';
      html += '<span><i class="bi bi-trophy me-2"></i>' + t2('home.resumeTournament') + '</span>';
      html += '<button class="btn btn-sm btn-warning" id="btn-resume-tournament">' + t2('home.resumeTournament') + '</button>';
      html += '</div>';
    }

    banner.innerHTML = html;
    banner.classList.toggle('d-none', !html);
  }

  // ── New Match ──
  function renderNewMatch() {
    updateMatchTypeUI();
    updateFirstServerOptions();
  }

  function updateMatchTypeUI() {
    var isDoubles = document.querySelector('input[name="matchType"]:checked').value === 'doubles';
    document.getElementById('singles-players').classList.toggle('d-none', isDoubles);
    document.getElementById('doubles-players').classList.toggle('d-none', !isDoubles);
    if (isDoubles) updateTeamInputs();
    updateFirstServerOptions();
  }

  function updateTeamInputs() {
    var size = parseInt(document.getElementById('team-size').value);
    document.getElementById('team-a-players').innerHTML = PS.UI.renderTeamInputs('a', size);
    document.getElementById('team-b-players').innerHTML = PS.UI.renderTeamInputs('b', size);
  }

  function updateFirstServerOptions() {
    var isDoubles = document.querySelector('input[name="matchType"]:checked').value === 'doubles';
    var config = { type: isDoubles ? 'doubles' : 'singles' };

    if (isDoubles) {
      var sizeEl = document.getElementById('team-size');
      var size = sizeEl ? parseInt(sizeEl.value) : 2;
      config.teams = [[], []];
      document.querySelectorAll('.team-player-input[data-team="a"]').forEach(function(inp) {
        config.teams[0].push(inp.value || (PS.i18n.t('setup.player') + ' A' + (parseInt(inp.dataset.index) + 1)));
      });
      document.querySelectorAll('.team-player-input[data-team="b"]').forEach(function(inp) {
        config.teams[1].push(inp.value || (PS.i18n.t('setup.player') + ' B' + (parseInt(inp.dataset.index) + 1)));
      });
    } else {
      config.players = [
        document.getElementById('p1-name').value || PS.i18n.t('setup.player') + ' 1',
        document.getElementById('p2-name').value || PS.i18n.t('setup.player') + ' 2'
      ];
    }

    document.getElementById('first-server-group').innerHTML = PS.UI.renderFirstServerOptions(config);
  }

  var SCORE_DEBOUNCE_MS = 350;
  var lastScoreAt = 0;
  var scoringWakePrimed = false;

  function startMatch(config) {
    currentMatch = new PS.MatchEngine(config);
    lastScoreAt = 0;
    scoringWakePrimed = false;
    PS.Storage.saveCurrentMatch(currentMatch.toJSON());
    PS.wakeLock.request();
    navigate('#scoring');
  }

  function flashScoreSide(side) {
    var el = document.getElementById(side === 0 ? 'score-left' : 'score-right');
    el.classList.remove('score-flash');
    void el.offsetWidth;
    el.classList.add('score-flash');
    window.setTimeout(function() {
      el.classList.remove('score-flash');
    }, 220);
  }

  function hapticScoring(kind) {
    if (!navigator.vibrate) return;
    if (kind === 'match') navigator.vibrate([50, 40, 50, 40, 90]);
    else if (kind === 'game') navigator.vibrate([35, 50, 35]);
    else navigator.vibrate(15);
  }

  function tryScorePoint(side) {
    if (!currentMatch || currentMatch.status !== 'in_progress') return;
    var now = Date.now();
    if (now - lastScoreAt < SCORE_DEBOUNCE_MS) return;
    lastScoreAt = now;
    if (!scoringWakePrimed) {
      scoringWakePrimed = true;
      PS.wakeLock.request();
    }
    scorePoint(side);
  }

  function getMatchConfigFromUI() {
    var isDoubles = document.querySelector('input[name="matchType"]:checked').value === 'doubles';
    var bestOf = parseInt(document.querySelector('input[name="bestOf"]:checked').value);
    var firstServer = parseInt(document.querySelector('input[name="firstServer"]:checked').value) || 0;

    var config = {
      type: isDoubles ? 'doubles' : 'singles',
      bestOf: bestOf,
      firstServerIndex: firstServer
    };

    if (isDoubles) {
      config.teams = [[], []];
      document.querySelectorAll('.team-player-input[data-team="a"]').forEach(function(inp, i) {
        config.teams[0].push({ id: PS.uid(), name: inp.value || ('A' + (i + 1)) });
      });
      document.querySelectorAll('.team-player-input[data-team="b"]').forEach(function(inp, i) {
        config.teams[1].push({ id: PS.uid(), name: inp.value || ('B' + (i + 1)) });
      });
      config.players = [
        { id: 'team-a', name: config.teams[0].map(function(p) { return p.name; }).join('/') },
        { id: 'team-b', name: config.teams[1].map(function(p) { return p.name; }).join('/') }
      ];
    } else {
      config.players = [
        { id: PS.uid(), name: document.getElementById('p1-name').value || PS.i18n.t('setup.player') + ' 1' },
        { id: PS.uid(), name: document.getElementById('p2-name').value || PS.i18n.t('setup.player') + ' 2' }
      ];
    }
    return config;
  }

  // ── Scoring ──
  function scorePoint(side) {
    if (!currentMatch || currentMatch.status !== 'in_progress') return;
    var gamesBefore = currentMatch.games.length;
    currentMatch.pointFor(side);
    PS.Storage.saveCurrentMatch(currentMatch.toJSON());
    PS.UI.updateScoringView(currentMatch);
    flashScoreSide(side);

    if (currentMatch.status === 'completed') {
      hapticScoring('match');
      onMatchComplete();
    } else if (currentMatch.games.length > gamesBefore) {
      hapticScoring('game');
    } else {
      hapticScoring('point');
    }
  }

  function undoPoint() {
    if (!currentMatch) return;
    lastScoreAt = 0;
    currentMatch.undo();
    PS.Storage.saveCurrentMatch(currentMatch.toJSON());
    PS.UI.updateScoringView(currentMatch);
    document.getElementById('match-complete-overlay').classList.add('d-none');
  }

  function onMatchComplete() {
    var isTournament = !!currentTournamentMatchId;
    var body = document.getElementById('match-complete-body');
    body.innerHTML = PS.UI.renderMatchComplete(currentMatch, isTournament);
    document.getElementById('match-complete-overlay').classList.remove('d-none');

    PS.Storage.saveMatch(currentMatch.toJSON());

    if (isTournament && currentTournament) {
      var gameScores = currentMatch.games.map(function(g) { return g.scores; });
      currentTournament.reportResult(currentTournamentMatchId, currentMatch.winner, gameScores);
      PS.Storage.saveCurrentTournament(currentTournament.toJSON());
      if (currentTournament.status === 'completed') {
        PS.Storage.saveTournament(currentTournament.toJSON());
        PS.Storage.clearCurrentTournament();
      }
    }

    PS.Storage.clearCurrentMatch();
  }

  function endMatchEarly() {
    if (!currentMatch) return;
    PS.wakeLock.release();
    PS.Storage.clearCurrentMatch();
    currentMatch = null;
    currentTournamentMatchId = null;
    navigate('#home');
  }

  // ── Match History ──
  function renderMatchHistory() {
    PS.Storage.getMatches().then(function(matches) {
      document.getElementById('match-history-list').innerHTML =
        PS.UI.renderMatchHistoryList(matches);
    });
  }

  function renderMatchDetailView(id) {
    PS.Storage.getMatch(id).then(function(m) {
      document.getElementById('match-detail-content').innerHTML =
        PS.UI.renderMatchDetail(m);
    });
  }

  // ── Tournament Setup ──
  function renderNewTournament() {
    document.getElementById('tournament-player-list').innerHTML =
      PS.UI.renderTournamentPlayerList(tournamentPlayers);
    updateFormatOptions();
  }

  function updateFormatOptions() {
    var format = document.getElementById('tournament-format').value;
    document.getElementById('format-options').innerHTML = PS.UI.renderFormatOptions(format);
  }

  function startTournament() {
    var name = document.getElementById('tournament-name').value || PS.i18n.t('tournament.namePlaceholder');
    var format = document.getElementById('tournament-format').value;
    var bestOf = parseInt(document.querySelector('input[name="tBestOf"]:checked').value);

    var players = [];
    document.querySelectorAll('.tournament-player-name').forEach(function(inp) {
      var val = inp.value.trim();
      if (val) players.push({ id: PS.uid(), name: val });
    });

    if (players.length < 3) {
      alert(PS.i18n.t('tournament.minPlayers'));
      return;
    }

    var config = {
      name: name,
      format: format,
      bestOf: bestOf,
      players: players
    };

    if (format === 'group_knockout') {
      var gc = document.getElementById('group-count');
      var apg = document.getElementById('advance-per-group');
      config.groupCount = gc ? parseInt(gc.value) : 2;
      config.advancePerGroup = apg ? parseInt(apg.value) : 2;
    } else if (format === 'swiss') {
      var sr = document.getElementById('swiss-rounds');
      config.swissRounds = sr ? parseInt(sr.value) : 4;
    }

    currentTournament = PS.Tournament.create(config);
    PS.Storage.saveCurrentTournament(currentTournament.toJSON());
    navigate('#tournament/' + currentTournament.id);
  }

  // ── Tournament View ──
  function renderTournamentView(id) {
    if (!currentTournament || currentTournament.id !== id) {
      var saved = PS.Storage.loadCurrentTournament();
      if (saved && saved.id === id) {
        currentTournament = PS.Tournament.restore(saved);
      } else {
        PS.Storage.getTournament(id).then(function(t) {
          if (t) {
            currentTournament = PS.Tournament.restore(t);
            doRender();
          }
        });
        return;
      }
    }
    doRender();

    function doRender() {
      document.getElementById('tournament-view-title').textContent =
        currentTournament.config.name || 'Tournament';
      document.getElementById('tournament-view-content').innerHTML =
        PS.UI.renderTournamentView(currentTournament);
    }
  }

  function playTournamentMatch(matchId) {
    if (!currentTournament) return;
    var m = currentTournament.matches[matchId];
    if (!m || !m.players[0] || !m.players[1]) return;

    currentTournamentMatchId = matchId;
    var config = {
      type: 'singles',
      bestOf: currentTournament.config.bestOf,
      firstServerIndex: 0,
      players: [m.players[0], m.players[1]]
    };
    startMatch(config);
  }

  // ── Tournament History ──
  function renderTournamentHistory() {
    PS.Storage.getTournaments().then(function(tournaments) {
      document.getElementById('tournament-history-list').innerHTML =
        PS.UI.renderTournamentHistoryList(tournaments);
    });
  }

  var endMatchModal = null;

  function showEndMatchConfirm() {
    var el = document.getElementById('scoring-end-modal');
    if (!endMatchModal) endMatchModal = new bootstrap.Modal(el);
    endMatchModal.show();
  }

  function hideEndMatchConfirm() {
    var inst = bootstrap.Modal.getInstance(document.getElementById('scoring-end-modal'));
    if (inst) inst.hide();
  }

  // ── Event Binding ──
  function bindEvents() {
    window.addEventListener('hashchange', handleRoute);

    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-scoring-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-lang').addEventListener('click', toggleLang);

    function bindScoreSide(el, side) {
      el.addEventListener('pointerup', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('.scoring-controls-overlay')) return;
        tryScorePoint(side);
      });
    }
    bindScoreSide(document.getElementById('score-left'), 0);
    bindScoreSide(document.getElementById('score-right'), 1);

    // Navigation via data-nav
    document.addEventListener('click', function(e) {
      var navBtn = e.target.closest('[data-nav]');
      if (navBtn) {
        e.preventDefault();
        navigate(navBtn.getAttribute('data-nav'));
        return;
      }

      // Resume match
      if (e.target.closest('#btn-resume-match')) {
        navigate('#scoring');
        return;
      }
      if (e.target.closest('#btn-resume-tournament')) {
        if (currentTournament) navigate('#tournament/' + currentTournament.id);
        return;
      }

      // Match back to tournament
      if (e.target.closest('#btn-back-tournament')) {
        document.getElementById('match-complete-overlay').classList.add('d-none');
        currentMatch = null;
        if (currentTournament) navigate('#tournament/' + currentTournament.id);
        else navigate('#home');
        return;
      }

      // Tournament match play
      var playBtn = e.target.closest('.btn-play-tournament-match');
      if (playBtn) {
        playTournamentMatch(playBtn.dataset.matchId);
        return;
      }

      // Tournament player remove
      var removeBtn = e.target.closest('.btn-remove-tournament-player');
      if (removeBtn) {
        var idx = parseInt(removeBtn.dataset.index);
        tournamentPlayers.splice(idx, 1);
        renderNewTournament();
        return;
      }
    });

    // Match setup events
    document.querySelectorAll('input[name="matchType"]').forEach(function(radio) {
      radio.addEventListener('change', updateMatchTypeUI);
    });

    document.getElementById('team-size').addEventListener('change', function() {
      updateTeamInputs();
      updateFirstServerOptions();
    });

    // Player name change -> update first server options
    ['p1-name', 'p2-name'].forEach(function(id) {
      document.getElementById(id).addEventListener('input', updateFirstServerOptions);
    });
    document.addEventListener('input', function(e) {
      if (e.target.classList.contains('team-player-input')) {
        updateFirstServerOptions();
      }
      if (e.target.classList.contains('tournament-player-name')) {
        tournamentPlayers[parseInt(e.target.dataset.index)] = e.target.value;
      }
    });

    document.getElementById('btn-start-match').addEventListener('click', function() {
      startMatch(getMatchConfigFromUI());
    });

    // Scoring controls
    document.getElementById('btn-undo').addEventListener('click', function(e) {
      e.stopPropagation();
      if (e.currentTarget.disabled) return;
      undoPoint();
    });
    document.getElementById('btn-end-match').addEventListener('click', function(e) {
      e.stopPropagation();
      showEndMatchConfirm();
    });
    document.getElementById('btn-confirm-end').addEventListener('click', function() {
      hideEndMatchConfirm();
      endMatchEarly();
    });
    document.querySelector('.scoring-controls-overlay').addEventListener('click', function(e) {
      e.stopPropagation();
    });

    // Tournament setup
    document.getElementById('tournament-format').addEventListener('change', updateFormatOptions);

    document.getElementById('btn-add-tournament-player').addEventListener('click', function() {
      tournamentPlayers.push('');
      renderNewTournament();
      var inputs = document.querySelectorAll('.tournament-player-name');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    document.getElementById('btn-start-tournament').addEventListener('click', startTournament);
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.PongScore);
