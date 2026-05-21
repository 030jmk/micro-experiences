window.BeachVolley = window.BeachVolley || {};

(function(BV) {
  var currentMatch = null;
  var currentTournament = null;
  var currentTournamentMatchId = null;
  var tournamentTeams = ['', '', '', ''];

  function init() {
    BV.Storage.init().then(function() {
      initTheme();
      initLang();
      BV.UI.updateI18nDOM();
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
    var saved = localStorage.getItem('bv-theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-bs-theme', theme);
    updateThemeBtn(theme);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-bs-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-bs-theme', next);
    localStorage.setItem('bv-theme', next);
    updateThemeBtn(next);
  }

  function updateThemeBtn(theme) {
    var btn = document.getElementById('btn-theme');
    btn.innerHTML = theme === 'dark' ?
      '<i class="bi bi-sun-fill"></i>' :
      '<i class="bi bi-moon-fill"></i>';
  }

  // ── Language ──
  function initLang() {
    updateLangBtn();
  }

  function toggleLang() {
    var current = BV.i18n.getLocale();
    BV.i18n.setLocale(current === 'en' ? 'de' : 'en');
    updateLangBtn();
    BV.UI.updateI18nDOM();
    handleRoute();
  }

  function updateLangBtn() {
    document.getElementById('btn-lang').textContent = BV.i18n.getLocale().toUpperCase();
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

    switch (route) {
      case '#home':
        showView('view-home');
        renderHome();
        break;
      case '#new-match':
        showView('view-new-match');
        updateFirstServeOptions();
        break;
      case '#scoring':
        showView('view-scoring');
        navbar.classList.add('d-none');
        if (!currentMatch) {
          var saved = BV.Storage.loadCurrentMatch();
          if (saved) currentMatch = BV.MatchEngine.fromJSON(saved);
        }
        if (currentMatch) {
          BV.UI.updateScoringView(currentMatch);
          if (currentMatch.status === 'completed') {
            onMatchComplete();
          } else {
            BV.wakeLock.request();
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
    var saved = BV.Storage.loadCurrentMatch();
    var savedT = BV.Storage.loadCurrentTournament();
    var html = '';

    if (saved) {
      currentMatch = BV.MatchEngine.fromJSON(saved);
      var t = BV.i18n.t;
      html += '<div class="alert alert-info d-flex justify-content-between align-items-center mb-2" role="alert">';
      html += '<span><i class="bi bi-play-circle me-2"></i>' + t('home.resume') + ': ' +
        BV.UI.escHtml(currentMatch.getLeftName()) + ' vs ' + BV.UI.escHtml(currentMatch.getRightName()) + '</span>';
      html += '<button class="btn btn-sm btn-info" id="btn-resume-match">' + t('home.resume') + '</button>';
      html += '</div>';
    }

    if (savedT) {
      currentTournament = BV.Tournament.restore(savedT);
      var t2 = BV.i18n.t;
      html += '<div class="alert alert-warning d-flex justify-content-between align-items-center mb-2" role="alert">';
      html += '<span><i class="bi bi-trophy me-2"></i>' + t2('home.resumeTournament') + '</span>';
      html += '<button class="btn btn-sm btn-warning" id="btn-resume-tournament">' + t2('home.resumeTournament') + '</button>';
      html += '</div>';
    }

    banner.innerHTML = html;
    banner.classList.toggle('d-none', !html);
  }

  // ── Match Setup ──
  function updateFirstServeOptions() {
    var t1p1 = document.getElementById('t1-p1').value;
    var t1p2 = document.getElementById('t1-p2').value;
    var t2p1 = document.getElementById('t2-p1').value;
    var t2p2 = document.getElementById('t2-p2').value;
    var t = BV.i18n.t;

    var team1Label = (t1p1 || t1p2) ? [t1p1 || t('setup.player') + ' 1', t1p2 || t('setup.player') + ' 2'].join('/') : t('setup.team1');
    var team2Label = (t2p1 || t2p2) ? [t2p1 || t('setup.player') + ' 1', t2p2 || t('setup.player') + ' 2'].join('/') : t('setup.team2');

    var html = '';
    html += '<input type="radio" class="btn-check" name="firstServe" id="fs-0" value="0" checked>';
    html += '<label class="btn btn-outline-secondary" for="fs-0">' + BV.UI.escHtml(team1Label) + '</label>';
    html += '<input type="radio" class="btn-check" name="firstServe" id="fs-1" value="1">';
    html += '<label class="btn btn-outline-secondary" for="fs-1">' + BV.UI.escHtml(team2Label) + '</label>';
    document.getElementById('first-serve-group').innerHTML = html;
  }

  function getMatchConfigFromUI() {
    var firstServe = parseInt(document.querySelector('input[name="firstServe"]:checked').value) || 0;
    var t = BV.i18n.t;

    var config = {
      teams: [
        [
          { id: BV.uid(), name: document.getElementById('t1-p1').value || t('setup.player') + ' 1' },
          { id: BV.uid(), name: document.getElementById('t1-p2').value || t('setup.player') + ' 2' }
        ],
        [
          { id: BV.uid(), name: document.getElementById('t2-p1').value || t('setup.player') + ' 3' },
          { id: BV.uid(), name: document.getElementById('t2-p2').value || t('setup.player') + ' 4' }
        ]
      ],
      firstServingTeam: firstServe
    };
    return config;
  }

  function startMatch(config) {
    currentMatch = new BV.MatchEngine(config);
    BV.Storage.saveCurrentMatch(currentMatch.toJSON());
    BV.wakeLock.request();
    navigate('#scoring');
  }

  // ── Scoring ──
  function scorePoint(side) {
    if (!currentMatch || currentMatch.status !== 'in_progress') return;
    currentMatch.pointFor(side);
    BV.Storage.saveCurrentMatch(currentMatch.toJSON());
    BV.UI.updateScoringView(currentMatch);

    if (currentMatch.status === 'completed') {
      onMatchComplete();
    }
  }

  function undoPoint() {
    if (!currentMatch) return;
    currentMatch.undo();
    BV.Storage.saveCurrentMatch(currentMatch.toJSON());
    BV.UI.updateScoringView(currentMatch);
    document.getElementById('match-complete-overlay').classList.add('d-none');
  }

  function onMatchComplete() {
    BV.wakeLock.release();
    var isTournament = !!currentTournamentMatchId;
    var body = document.getElementById('match-complete-body');
    body.innerHTML = BV.UI.renderMatchComplete(currentMatch, isTournament);
    document.getElementById('match-complete-overlay').classList.remove('d-none');

    BV.Storage.saveMatch(currentMatch.toJSON());

    if (isTournament && currentTournament) {
      var setScores = currentMatch.sets.map(function(s) { return s.scores; });
      currentTournament.reportResult(currentTournamentMatchId, currentMatch.winner, setScores);
      BV.Storage.saveCurrentTournament(currentTournament.toJSON());
      if (currentTournament.status === 'completed') {
        BV.Storage.saveTournament(currentTournament.toJSON());
        BV.Storage.clearCurrentTournament();
      }
    }

    BV.Storage.clearCurrentMatch();
  }

  function endMatchEarly() {
    if (!currentMatch) return;
    BV.wakeLock.release();
    BV.Storage.clearCurrentMatch();
    currentMatch = null;
    currentTournamentMatchId = null;
    navigate('#home');
  }

  // ── Match History ──
  function renderMatchHistory() {
    BV.Storage.getMatches().then(function(matches) {
      document.getElementById('match-history-list').innerHTML =
        BV.UI.renderMatchHistoryList(matches);
    });
  }

  function renderMatchDetailView(id) {
    BV.Storage.getMatch(id).then(function(m) {
      document.getElementById('match-detail-content').innerHTML =
        BV.UI.renderMatchDetail(m);
    });
  }

  // ── Tournament Setup ──
  function renderNewTournament() {
    document.getElementById('tournament-team-list').innerHTML =
      BV.UI.renderTournamentTeamList(tournamentTeams);
    updateFormatOptions();
  }

  function updateFormatOptions() {
    var format = document.getElementById('tournament-format').value;
    document.getElementById('format-options').innerHTML = BV.UI.renderFormatOptions(format);
  }

  function startTournament() {
    var name = document.getElementById('tournament-name').value || BV.i18n.t('tournament.namePlaceholder');
    var format = document.getElementById('tournament-format').value;

    var players = [];
    document.querySelectorAll('.tournament-team-name').forEach(function(inp) {
      var val = inp.value.trim();
      if (val) players.push({ id: BV.uid(), name: val });
    });

    if (players.length < 3) {
      alert(BV.i18n.t('tournament.minTeams'));
      return;
    }

    var config = {
      name: name,
      format: format,
      bestOf: 3,
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

    currentTournament = BV.Tournament.create(config);
    BV.Storage.saveCurrentTournament(currentTournament.toJSON());
    navigate('#tournament/' + currentTournament.id);
  }

  // ── Tournament View ──
  function renderTournamentView(id) {
    if (!currentTournament || currentTournament.id !== id) {
      var saved = BV.Storage.loadCurrentTournament();
      if (saved && saved.id === id) {
        currentTournament = BV.Tournament.restore(saved);
      } else {
        BV.Storage.getTournament(id).then(function(t) {
          if (t) {
            currentTournament = BV.Tournament.restore(t);
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
        BV.UI.renderTournamentView(currentTournament);
    }
  }

  function playTournamentMatch(matchId) {
    if (!currentTournament) return;
    var m = currentTournament.matches[matchId];
    if (!m || !m.players[0] || !m.players[1]) return;

    currentTournamentMatchId = matchId;

    var teams = [m.players[0], m.players[1]].map(function(team) {
      var names = team.name.split(/\s*\/\s*/);
      if (names.length < 2) names.push(names[0] + ' (2)');
      return names.map(function(n) { return { id: BV.uid(), name: n.trim() }; });
    });

    var config = {
      teams: teams,
      firstServingTeam: 0
    };
    startMatch(config);
  }

  // ── Tournament History ──
  function renderTournamentHistory() {
    BV.Storage.getTournaments().then(function(tournaments) {
      document.getElementById('tournament-history-list').innerHTML =
        BV.UI.renderTournamentHistoryList(tournaments);
    });
  }

  // ── Fullscreen ──
  function toggleFullscreen() {
    var el = document.getElementById('scoring-container');
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  }

  // ── Event Binding ──
  function bindEvents() {
    window.addEventListener('hashchange', handleRoute);

    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-lang').addEventListener('click', toggleLang);

    document.addEventListener('click', function(e) {
      var navBtn = e.target.closest('[data-nav]');
      if (navBtn) {
        e.preventDefault();
        navigate(navBtn.getAttribute('data-nav'));
        return;
      }

      if (e.target.closest('#btn-resume-match')) {
        navigate('#scoring');
        return;
      }
      if (e.target.closest('#btn-resume-tournament')) {
        if (currentTournament) navigate('#tournament/' + currentTournament.id);
        return;
      }

      var leftSide = e.target.closest('#score-left');
      var rightSide = e.target.closest('#score-right');
      if (leftSide && !e.target.closest('.score-decrement')) {
        scorePoint(0);
        return;
      }
      if (rightSide && !e.target.closest('.score-decrement')) {
        scorePoint(1);
        return;
      }

      if (e.target.closest('#btn-dec-left')) { undoPoint(); return; }
      if (e.target.closest('#btn-dec-right')) { undoPoint(); return; }

      if (e.target.closest('#btn-back-tournament')) {
        document.getElementById('match-complete-overlay').classList.add('d-none');
        currentMatch = null;
        if (currentTournament) navigate('#tournament/' + currentTournament.id);
        else navigate('#home');
        return;
      }

      var playBtn = e.target.closest('.btn-play-tournament-match');
      if (playBtn) {
        playTournamentMatch(playBtn.dataset.matchId);
        return;
      }

      var removeBtn = e.target.closest('.btn-remove-tournament-team');
      if (removeBtn) {
        var idx = parseInt(removeBtn.dataset.index);
        tournamentTeams.splice(idx, 1);
        renderNewTournament();
        return;
      }
    });

    // Player name change -> update first serve options
    ['t1-p1', 't1-p2', 't2-p1', 't2-p2'].forEach(function(id) {
      document.getElementById(id).addEventListener('input', updateFirstServeOptions);
    });

    document.getElementById('btn-start-match').addEventListener('click', function() {
      startMatch(getMatchConfigFromUI());
    });

    // Scoring controls
    document.getElementById('btn-undo').addEventListener('click', undoPoint);
    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

    document.getElementById('btn-scoring-menu').addEventListener('click', function() {
      var modal = new bootstrap.Modal(document.getElementById('scoring-menu-modal'));
      modal.show();
    });

    document.getElementById('btn-confirm-end').addEventListener('click', function() {
      bootstrap.Modal.getInstance(document.getElementById('scoring-menu-modal')).hide();
      endMatchEarly();
    });

    document.getElementById('btn-end-match').addEventListener('click', function() {
      var modal = new bootstrap.Modal(document.getElementById('scoring-menu-modal'));
      modal.show();
    });

    // Tournament setup
    document.getElementById('tournament-format').addEventListener('change', updateFormatOptions);

    document.getElementById('btn-add-tournament-team').addEventListener('click', function() {
      tournamentTeams.push('');
      renderNewTournament();
      var inputs = document.querySelectorAll('.tournament-team-name');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    document.addEventListener('input', function(e) {
      if (e.target.classList.contains('tournament-team-name')) {
        tournamentTeams[parseInt(e.target.dataset.index)] = e.target.value;
      }
    });

    document.getElementById('btn-start-tournament').addEventListener('click', startTournament);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.BeachVolley);
