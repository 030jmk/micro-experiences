window.PongScore = window.PongScore || {};

(function(PS) {
  var t = function(k) { return PS.i18n.t(k); };

  // ── Match Setup ──
  function renderTeamInputs(teamId, size) {
    var html = '';
    for (var i = 0; i < size; i++) {
      html += '<div class="mb-2"><input type="text" class="form-control team-player-input" ' +
        'data-team="' + teamId + '" data-index="' + i + '" ' +
        'placeholder="' + t('setup.player') + ' ' + (i + 1) + '"></div>';
    }
    return html;
  }

  function renderFirstServerOptions(config) {
    var html = '';
    if (config.type === 'singles') {
      for (var i = 0; i < 2; i++) {
        var name = config.players[i] || (t('setup.player') + ' ' + (i + 1));
        html += '<input type="radio" class="btn-check" name="firstServer" id="fs-' + i + '" value="' + i + '"' + (i === 0 ? ' checked' : '') + '>';
        html += '<label class="btn btn-outline-secondary" for="fs-' + i + '">' + escHtml(name) + '</label>';
      }
    } else {
      var teams = config.teams || [[], []];
      for (var ti = 0; ti < 2; ti++) {
        var tName = teams[ti][0] || (t('setup.team') + ' ' + String.fromCharCode(65 + ti));
        html += '<input type="radio" class="btn-check" name="firstServer" id="fs-' + ti + '" value="' + ti + '"' + (ti === 0 ? ' checked' : '') + '>';
        html += '<label class="btn btn-outline-secondary" for="fs-' + ti + '">' + escHtml(typeof tName === 'object' ? tName.name : tName) + '</label>';
      }
    }
    return html;
  }

  // ── Scoring ──
  function updateScoringView(engine) {
    var g = engine.currentGame;
    var gameNum = engine.games.length + 1;
    var totalGames = engine.config.bestOf;

    document.getElementById('scoring-game-info').textContent =
      t('scoring.game') + ' ' + gameNum + ' ' + t('scoring.of') + ' ' + totalGames;

    document.getElementById('score-left-num').textContent = g.scores[0];
    document.getElementById('score-right-num').textContent = g.scores[1];

    var serverSide = engine.getServerSide();
    var serverName = engine.getServerName();

    var leftName = engine.getLeftName();
    var rightName = engine.getRightName();
    var serveTag = '<span class="server-label">' + t('scoring.server') + '</span><span class="server-dot"></span>';
    var leftServe = serverSide === 0 ? serveTag : '';
    var rightServe = serverSide === 1 ? serveTag : '';

    document.getElementById('score-left-name').innerHTML = leftServe + escHtml(leftName);
    document.getElementById('score-right-name').innerHTML = rightServe + escHtml(rightName);

    // Game dots
    var needed = Math.ceil(engine.config.bestOf / 2);
    document.getElementById('score-left-games').innerHTML = gameDots(engine.gamesWon[0], needed);
    document.getElementById('score-right-games').innerHTML = gameDots(engine.gamesWon[1], needed);

    var leftSide = document.getElementById('score-left');
    var rightSide = document.getElementById('score-right');
    leftSide.classList.toggle('serving', serverSide === 0);
    rightSide.classList.toggle('serving', serverSide === 1);

    // Status badge
    var badge = '';
    if (engine.isMatchPoint()) {
      badge = '<span class="match-point-badge">' + t('scoring.matchPoint') + '</span>';
    } else if (engine.isGamePoint()) {
      badge = '<span class="match-point-badge">' + t('scoring.gamePoint') + '</span>';
    } else if (engine.isDeuce()) {
      badge = '<span class="match-point-badge">' + t('scoring.deuce') + '</span>';
    }
    document.getElementById('scoring-status-badge').innerHTML = badge;

    var setHistory = engine.games.map(function(g) {
      return g.scores[0] + '\u2013' + g.scores[1];
    }).join('  \u00b7  ');
    document.getElementById('scoring-set-history').textContent = setHistory;

    var undoBtn = document.getElementById('btn-undo');
    var canUndo = engine.actionLog && engine.actionLog.length > 0;
    undoBtn.disabled = !canUndo;
  }

  function gameDots(won, needed) {
    var html = '';
    for (var i = 0; i < needed; i++) {
      html += '<div class="game-dot' + (i < won ? ' won' : '') + '"></div>';
    }
    return html;
  }

  // ── Match Complete ──
  function renderMatchComplete(engine, isTournament) {
    var winnerName = engine.winner === 0 ? engine.getLeftName() : engine.getRightName();
    var html = '<h3 class="mb-2">' + t('complete.title') + '</h3>';
    html += '<p class="h4 text-primary mb-3"><i class="bi bi-trophy-fill me-2"></i>' + escHtml(winnerName) + '</p>';
    html += '<div class="mb-3">';
    engine.games.forEach(function(g, i) {
      var w = g.winner === 0 ? 'fw-bold' : '';
      var l = g.winner === 1 ? 'fw-bold' : '';
      html += '<div class="d-flex justify-content-center gap-3"><span>' + t('detail.game') + ' ' + (i + 1) +
        '</span><span class="' + w + '">' + g.scores[0] + '</span><span>-</span><span class="' + l + '">' + g.scores[1] + '</span></div>';
    });
    html += '</div>';
    html += '<div class="d-grid gap-2">';
    if (isTournament) {
      html += '<button class="btn btn-primary" id="btn-back-tournament">' +
        '<i class="bi bi-trophy me-1"></i>' + t('complete.backToTournament') + '</button>';
    }
    html += '<button class="btn btn-outline-primary" data-nav="#new-match">' + t('complete.newMatch') + '</button>';
    html += '<button class="btn btn-outline-secondary" data-nav="#home">' + t('complete.home') + '</button>';
    html += '</div>';
    return html;
  }

  // ── Match History ──
  function renderMatchHistoryList(matches) {
    if (!matches || matches.length === 0) {
      return '<p class="text-muted text-center py-4">' + t('history.noMatches') + '</p>';
    }
    var html = '<div class="list-group history-list">';
    matches.forEach(function(m) {
      var leftName = m.config.type === 'doubles' ?
        m.config.teams[0].map(function(p) { return p.name; }).join('/') :
        m.config.players[0].name;
      var rightName = m.config.type === 'doubles' ?
        m.config.teams[1].map(function(p) { return p.name; }).join('/') :
        m.config.players[1].name;
      var scores = (m.games || []).map(function(g) { return g.scores[0] + '-' + g.scores[1]; }).join(', ');
      var date = new Date(m.completedAt || m.startedAt).toLocaleDateString();
      var winnerName = m.winner === 0 ? leftName : rightName;

      html += '<a href="#match-detail/' + m.id + '" class="list-group-item list-group-item-action">';
      html += '<div class="d-flex justify-content-between"><strong>' + escHtml(leftName) + ' ' + t('history.vs') + ' ' + escHtml(rightName) + '</strong>';
      html += '<small class="text-muted">' + date + '</small></div>';
      html += '<div class="d-flex justify-content-between"><small>' + scores + '</small>';
      html += '<small class="text-success"><i class="bi bi-trophy-fill me-1"></i>' + escHtml(winnerName) + '</small></div>';
      html += '</a>';
    });
    html += '</div>';
    return html;
  }

  // ── Match Detail ──
  function renderMatchDetail(m) {
    if (!m) return '<p class="text-muted">Match not found.</p>';
    var leftName = m.config.type === 'doubles' ?
      m.config.teams[0].map(function(p) { return p.name; }).join(' / ') :
      m.config.players[0].name;
    var rightName = m.config.type === 'doubles' ?
      m.config.teams[1].map(function(p) { return p.name; }).join(' / ') :
      m.config.players[1].name;

    var html = '<div class="card mb-3"><div class="card-body text-center">';
    html += '<h5>' + escHtml(leftName) + ' <span class="text-muted">' + t('history.vs') + '</span> ' + escHtml(rightName) + '</h5>';
    if (m.winner !== null) {
      var winnerName = m.winner === 0 ? leftName : rightName;
      html += '<p class="text-success mb-1"><i class="bi bi-trophy-fill me-1"></i>' + escHtml(winnerName) + '</p>';
    }
    html += '<p class="text-muted small mb-0">' + m.config.type + ' | ' + t('setup.bestOf') + ' ' + m.config.bestOf + '</p>';
    html += '</div></div>';

    html += '<div class="card"><div class="card-body"><h6>' + t('scoring.game') + ' Scores</h6>';
    html += '<table class="table table-sm mb-0"><thead><tr><th></th><th>' + escHtml(leftName) + '</th><th>' + escHtml(rightName) + '</th></tr></thead><tbody>';
    (m.games || []).forEach(function(g, i) {
      var lw = g.winner === 0 ? ' class="fw-bold text-success"' : '';
      var rw = g.winner === 1 ? ' class="fw-bold text-success"' : '';
      html += '<tr><td>' + t('detail.game') + ' ' + (i + 1) + '</td><td' + lw + '>' + g.scores[0] + '</td><td' + rw + '>' + g.scores[1] + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    if (m.startedAt && m.completedAt) {
      var dur = Math.round((m.completedAt - m.startedAt) / 60000);
      html += '<p class="text-muted small mt-2">' + t('detail.duration') + ': ' + dur + ' min</p>';
    }
    return html;
  }

  // ── Tournament Setup ──
  function renderTournamentPlayerList(players) {
    var html = '';
    players.forEach(function(p, i) {
      html += '<div class="input-group mb-2">';
      html += '<span class="input-group-text">' + (i + 1) + '</span>';
      html += '<input type="text" class="form-control tournament-player-name" data-index="' + i + '" ' +
        'value="' + escHtml(p) + '" placeholder="' + t('setup.playerName') + '">';
      html += '<button class="btn btn-outline-danger btn-remove-tournament-player" data-index="' + i + '" ' +
        (players.length <= 3 ? 'disabled' : '') + '><i class="bi bi-x-lg"></i></button>';
      html += '</div>';
    });
    return html;
  }

  function renderFormatOptions(format) {
    var html = '';
    if (format === 'group_knockout') {
      html += '<div class="row mb-3"><div class="col-6">';
      html += '<label class="form-label">' + t('tournament.groups') + '</label>';
      html += '<select id="group-count" class="form-select"><option value="2">2</option><option value="4">4</option></select>';
      html += '</div><div class="col-6">';
      html += '<label class="form-label">' + t('tournament.advancePerGroup') + '</label>';
      html += '<select id="advance-per-group" class="form-select"><option value="1">1</option><option value="2" selected>2</option></select>';
      html += '</div></div>';
    } else if (format === 'swiss') {
      html += '<div class="mb-3">';
      html += '<label class="form-label">' + t('tournament.swissRounds') + '</label>';
      html += '<input type="number" id="swiss-rounds" class="form-control" value="4" min="2" max="10" style="max-width:120px">';
      html += '</div>';
    }
    return html;
  }

  // ── Tournament View ──
  function renderTournamentView(tournament) {
    var html = '';
    if (tournament.status === 'completed' && tournament.champion) {
      html += '<div class="alert alert-success text-center"><h5><i class="bi bi-trophy-fill me-2"></i>' +
        t('tournament.complete') + '</h5><p class="mb-0 h4">' + escHtml(tournament.champion.name) + '</p></div>';
    }

    switch (tournament.type) {
      case 'single_elim':
        html += renderSingleElimBracket(tournament);
        break;
      case 'double_elim':
        html += renderDoubleElimBracket(tournament);
        break;
      case 'round_robin':
        html += renderRoundRobinView(tournament);
        break;
      case 'group_knockout':
        html += renderGroupKnockoutView(tournament);
        break;
      case 'swiss':
        html += renderSwissView(tournament);
        break;
    }

    var nextMatches = tournament.getNextMatches();
    if (nextMatches.length > 0 && tournament.status !== 'completed') {
      html += '<div class="mt-3"><h6>' + t('tournament.nextMatch') + '</h6>';
      nextMatches.forEach(function(m) {
        html += '<div class="card mb-2"><div class="card-body d-flex justify-content-between align-items-center py-2">';
        html += '<span>' + escHtml(m.players[0].name) + ' <span class="text-muted">' + t('history.vs') + '</span> ' + escHtml(m.players[1].name) + '</span>';
        html += '<button class="btn btn-sm btn-primary btn-play-tournament-match" data-match-id="' + m.id + '">' +
          '<i class="bi bi-play-fill me-1"></i>' + t('tournament.playMatch') + '</button>';
        html += '</div></div>';
      });
      html += '</div>';
    }
    return html;
  }

  // ── Bracket rendering ──
  function renderSingleElimBracket(tournament) {
    var rounds = tournament.rounds;
    if (!rounds || rounds.length === 0) return '';
    var html = '<div class="bracket-container"><div class="bracket-grid" style="grid-template-columns: repeat(' + rounds.length + ', minmax(160px, 1fr));">';

    rounds.forEach(function(round, ri) {
      html += '<div class="bracket-round">';
      html += '<div class="text-center text-muted small mb-2">' + t('tournament.round') + ' ' + (ri + 1) + '</div>';
      round.forEach(function(m) {
        html += renderBracketMatch(tournament.matches[m.id || m]);
      });
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderDoubleElimBracket(tournament) {
    var html = '<h6 class="mb-2">' + t('tournament.winners') + '</h6>';
    html += '<div class="bracket-container"><div class="bracket-grid" style="grid-template-columns: repeat(' +
      tournament.winnersRounds.length + ', minmax(160px, 1fr));">';
    tournament.winnersRounds.forEach(function(round, ri) {
      html += '<div class="bracket-round">';
      html += '<div class="text-center text-muted small mb-2">' + t('tournament.round') + ' ' + (ri + 1) + '</div>';
      round.forEach(function(m) { html += renderBracketMatch(tournament.matches[m.id || m]); });
      html += '</div>';
    });
    html += '</div></div>';

    if (tournament.losersRounds.length > 0) {
      html += '<h6 class="mt-3 mb-2">' + t('tournament.losers') + '</h6>';
      html += '<div class="bracket-container"><div class="bracket-grid" style="grid-template-columns: repeat(' +
        tournament.losersRounds.length + ', minmax(160px, 1fr));">';
      tournament.losersRounds.forEach(function(round, ri) {
        html += '<div class="bracket-round">';
        html += '<div class="text-center text-muted small mb-2">L' + (ri + 1) + '</div>';
        round.forEach(function(m) { html += renderBracketMatch(tournament.matches[m.id || m]); });
        html += '</div>';
      });
      html += '</div></div>';
    }

    if (tournament.grandFinal) {
      html += '<h6 class="mt-3 mb-2">' + t('tournament.grandFinal') + '</h6>';
      html += renderBracketMatch(tournament.grandFinal);
    }
    if (tournament.resetMatch && tournament.resetMatch.players[0]) {
      html += '<h6 class="mt-2 mb-2">' + t('tournament.resetMatch') + '</h6>';
      html += renderBracketMatch(tournament.resetMatch);
    }
    return html;
  }

  function renderBracketMatch(m) {
    if (!m) return '';
    var html = '<div class="bracket-match mb-2"><div class="card">';
    html += '<div class="card-body">';
    for (var i = 0; i < 2; i++) {
      var pName = m.players[i] ? m.players[i].name : t('tournament.tbd');
      var cls = '';
      if (m.winner !== null) {
        cls = m.winner === i ? 'winner' : 'loser';
      }
      var score = '';
      if (m.gameScores && m.gameScores.length > 0) {
        score = m.gameScores.map(function(gs) { return gs[i]; }).reduce(function(a, b) { return a + b; }, 0);
      }
      html += '<div class="bracket-player ' + cls + '">';
      html += '<span>' + escHtml(pName) + '</span>';
      if (score !== '') html += '<span class="badge bg-secondary">' + score + '</span>';
      html += '</div>';
      if (i === 0) html += '<hr class="my-1">';
    }
    html += '</div></div></div>';
    return html;
  }

  function renderRoundRobinView(tournament) {
    var players = tournament.config.players;
    var html = '<div class="table-responsive"><table class="table table-sm table-bordered rr-table"><thead><tr><th></th>';
    players.forEach(function(p) {
      html += '<th>' + escHtml(p.name.slice(0, 3)) + '</th>';
    });
    html += '</tr></thead><tbody>';

    players.forEach(function(p1, i) {
      html += '<tr><td class="fw-semibold">' + escHtml(p1.name) + '</td>';
      players.forEach(function(p2, j) {
        if (i === j) {
          html += '<td class="rr-self"></td>';
          return;
        }
        var match = null;
        Object.keys(tournament.matches).forEach(function(mid) {
          var m = tournament.matches[mid];
          if ((m.players[0].id === p1.id && m.players[1].id === p2.id) ||
              (m.players[1].id === p1.id && m.players[0].id === p2.id)) {
            match = m;
          }
        });
        if (match && match.winner !== null) {
          var isP1 = match.players[0].id === p1.id;
          var won = (isP1 && match.winner === 0) || (!isP1 && match.winner === 1);
          html += '<td class="' + (won ? 'text-success fw-bold' : 'text-danger') + '">' + (won ? 'W' : 'L') + '</td>';
        } else {
          html += '<td class="text-muted">-</td>';
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    html += renderStandingsTable(tournament.standings);
    return html;
  }

  function renderGroupKnockoutView(tournament) {
    var html = '';
    tournament.groups.forEach(function(grp) {
      html += '<h6>' + t('tournament.group') + ' ' + grp.name + '</h6>';
      html += renderStandingsTable(grp.standings);
    });

    if (tournament.phase === 'knockout' && tournament.knockoutPhase) {
      html += '<h6 class="mt-3">Knockout</h6>';
      html += renderSingleElimBracket(tournament.knockoutPhase);
    }
    return html;
  }

  function renderSwissView(tournament) {
    var html = renderStandingsTable(tournament.standings);

    tournament.roundSchedule.forEach(function(round, ri) {
      html += '<div class="mt-3"><h6>' + t('tournament.round') + ' ' + (ri + 1) + '</h6>';
      round.forEach(function(m) {
        var match = tournament.matches[m.id || m];
        if (!match) return;
        var status = match.winner !== null ?
          (match.players[match.winner].name + ' won') : 'Pending';
        html += '<div class="card mb-1"><div class="card-body py-2 d-flex justify-content-between">';
        html += '<span>' + escHtml(match.players[0].name) + ' ' + t('history.vs') + ' ' + escHtml(match.players[1].name) + '</span>';
        html += '<small class="text-muted">' + status + '</small>';
        html += '</div></div>';
      });
      html += '</div>';
    });
    return html;
  }

  function renderStandingsTable(standings) {
    if (!standings || standings.length === 0) return '';
    var hasBuchholz = standings[0].buchholz !== undefined;
    var html = '<div class="table-responsive"><table class="table table-sm"><thead><tr>';
    html += '<th>#</th><th>' + t('setup.player') + '</th><th>' + t('tournament.w') + '</th><th>' + t('tournament.l') + '</th>';
    if (hasBuchholz) html += '<th>' + t('tournament.buchholz') + '</th>';
    html += '<th>' + t('tournament.diff') + '</th></tr></thead><tbody>';
    standings.forEach(function(s, i) {
      html += '<tr><td>' + (i + 1) + '</td><td>' + escHtml(s.player.name) + '</td>';
      html += '<td>' + s.wins + '</td><td>' + s.losses + '</td>';
      if (hasBuchholz) html += '<td>' + (s.buchholz || 0) + '</td>';
      html += '<td>' + (s.pf - s.pa) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  // ── Tournament History ──
  function renderTournamentHistoryList(tournaments) {
    if (!tournaments || tournaments.length === 0) {
      return '<p class="text-muted text-center py-4">' + t('history.noTournaments') + '</p>';
    }
    var html = '<div class="list-group history-list">';
    tournaments.forEach(function(tr) {
      var date = new Date(tr.createdAt).toLocaleDateString();
      var formatLabel = t('tournament.' + (tr.type || tr.config.format).replace('_', ''));
      var champName = tr.champion ? tr.champion.name : '...';
      html += '<a href="#tournament/' + tr.id + '" class="list-group-item list-group-item-action">';
      html += '<div class="d-flex justify-content-between"><strong>' + escHtml(tr.config.name || 'Tournament') + '</strong>';
      html += '<small class="text-muted">' + date + '</small></div>';
      html += '<div class="d-flex justify-content-between"><small>' + formatLabel + ' | ' + tr.config.players.length + ' players</small>';
      html += '<small class="text-success"><i class="bi bi-trophy-fill me-1"></i>' + escHtml(champName) + '</small></div>';
      html += '</a>';
    });
    html += '</div>';
    return html;
  }

  function escHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── i18n DOM update ──
  function updateI18nDOM() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('select option[data-i18n]').forEach(function(el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
  }

  PS.UI = {
    renderTeamInputs: renderTeamInputs,
    renderFirstServerOptions: renderFirstServerOptions,
    updateScoringView: updateScoringView,
    renderMatchComplete: renderMatchComplete,
    renderMatchHistoryList: renderMatchHistoryList,
    renderMatchDetail: renderMatchDetail,
    renderTournamentPlayerList: renderTournamentPlayerList,
    renderFormatOptions: renderFormatOptions,
    renderTournamentView: renderTournamentView,
    renderTournamentHistoryList: renderTournamentHistoryList,
    updateI18nDOM: updateI18nDOM,
    escHtml: escHtml
  };
})(window.PongScore);
