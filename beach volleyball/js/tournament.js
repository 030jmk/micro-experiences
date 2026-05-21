window.BeachVolley = window.BeachVolley || {};

(function(BV) {
  var uid = BV.uid;

  function nextPow2(n) { var p = 1; while (p < n) p *= 2; return p; }

  function Tournament(config) {
    this.id = config.id || uid();
    this.config = config;
    this.status = 'in_progress';
    this.matches = {};
    this.createdAt = Date.now();
    this.completedAt = null;
    this.champion = null;
  }

  Tournament.prototype.reportResult = function(matchId, winnerSide, setScores) {
    var m = this.matches[matchId];
    if (!m || m.winner !== null) return;
    m.winner = winnerSide;
    m.setScores = setScores || [];
    this._onMatchComplete(matchId);
  };

  Tournament.prototype._onMatchComplete = function() {};

  Tournament.prototype.getNextMatches = function() {
    var self = this;
    return Object.keys(this.matches).filter(function(id) {
      var m = self.matches[id];
      return m.winner === null && m.players[0] !== null && m.players[1] !== null;
    }).map(function(id) { return self.matches[id]; });
  };

  Tournament.prototype.toJSON = function() {
    return {
      id: this.id,
      type: this.type,
      config: this.config,
      status: this.status,
      matches: this.matches,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      champion: this.champion,
      extra: this._extraJSON ? this._extraJSON() : {}
    };
  };

  // ── Single Elimination ──
  function SingleElim(config) {
    Tournament.call(this, config);
    this.type = 'single_elim';
    this.rounds = [];
    this._buildBracket();
  }
  SingleElim.prototype = Object.create(Tournament.prototype);

  SingleElim.prototype._buildBracket = function() {
    var players = this.config.players.slice();
    var n = players.length;
    var size = nextPow2(n);

    var seeds = [];
    for (var i = 0; i < size; i++) seeds.push(i < n ? players[i] : null);

    var ordered = this._seededOrder(size);
    var slotted = ordered.map(function(idx) { return seeds[idx]; });

    var numRounds = Math.log2(size);
    var round1 = [];
    for (var j = 0; j < size; j += 2) {
      var m = {
        id: uid(), round: 0, index: j / 2,
        players: [slotted[j], slotted[j + 1]],
        winner: null, setScores: [],
        bracket: 'winners', nextMatchId: null, nextSlot: null
      };
      if (m.players[0] !== null && m.players[1] === null) m.winner = 0;
      else if (m.players[0] === null && m.players[1] !== null) m.winner = 1;
      round1.push(m);
      this.matches[m.id] = m;
    }
    this.rounds.push(round1);

    for (var r = 1; r < numRounds; r++) {
      var prevRound = this.rounds[r - 1];
      var round = [];
      for (var k = 0; k < prevRound.length; k += 2) {
        var m2 = {
          id: uid(), round: r, index: k / 2,
          players: [null, null],
          winner: null, setScores: [],
          bracket: 'winners', nextMatchId: null, nextSlot: null
        };
        prevRound[k].nextMatchId = m2.id; prevRound[k].nextSlot = 0;
        prevRound[k + 1].nextMatchId = m2.id; prevRound[k + 1].nextSlot = 1;
        round.push(m2);
        this.matches[m2.id] = m2;
      }
      this.rounds.push(round);
    }

    this._propagateByes();
  };

  SingleElim.prototype._seededOrder = function(size) {
    if (size === 1) return [0];
    var half = this._seededOrder(size / 2);
    var result = [];
    half.forEach(function(s) {
      result.push(s);
      result.push(size - 1 - s);
    });
    return result;
  };

  SingleElim.prototype._propagateByes = function() {
    var changed = true;
    while (changed) {
      changed = false;
      var self = this;
      Object.keys(this.matches).forEach(function(id) {
        var m = self.matches[id];
        if (m.winner !== null && m.nextMatchId) {
          var next = self.matches[m.nextMatchId];
          var winnerPlayer = m.players[m.winner];
          if (next.players[m.nextSlot] === null && winnerPlayer !== null) {
            next.players[m.nextSlot] = winnerPlayer;
            if (next.players[0] !== null && next.players[1] === null && self._isBye(next)) {
              next.winner = 0; changed = true;
            } else if (next.players[1] !== null && next.players[0] === null && self._isBye(next)) {
              next.winner = 1; changed = true;
            }
          }
        }
      });
    }
  };

  SingleElim.prototype._isBye = function(m) {
    return (m.players[0] === null) !== (m.players[1] === null);
  };

  SingleElim.prototype._onMatchComplete = function(matchId) {
    var m = this.matches[matchId];
    if (m.nextMatchId) {
      var next = this.matches[m.nextMatchId];
      next.players[m.nextSlot] = m.players[m.winner];
    }
    var lastRound = this.rounds[this.rounds.length - 1];
    if (lastRound.length === 1 && lastRound[0].winner !== null) {
      this.status = 'completed';
      this.champion = lastRound[0].players[lastRound[0].winner];
      this.completedAt = Date.now();
    }
  };

  SingleElim.prototype._extraJSON = function() {
    return { rounds: this.rounds.map(function(r) { return r.map(function(m) { return m.id; }); }) };
  };

  // ── Double Elimination ──
  function DoubleElim(config) {
    Tournament.call(this, config);
    this.type = 'double_elim';
    this.winnersRounds = [];
    this.losersRounds = [];
    this.grandFinal = null;
    this.resetMatch = null;
    this._buildBracket();
  }
  DoubleElim.prototype = Object.create(Tournament.prototype);

  DoubleElim.prototype._buildBracket = function() {
    var players = this.config.players.slice();
    var n = players.length;
    var size = nextPow2(n);
    var seeds = [];
    for (var i = 0; i < size; i++) seeds.push(i < n ? players[i] : null);

    var ordered = SingleElim.prototype._seededOrder(size);
    var slotted = ordered.map(function(idx) { return seeds[idx]; });

    var numWRounds = Math.log2(size);

    var round1 = [];
    for (var j = 0; j < size; j += 2) {
      var m = {
        id: uid(), round: 0, index: j / 2,
        players: [slotted[j], slotted[j + 1]],
        winner: null, setScores: [],
        bracket: 'winners', nextMatchId: null, nextSlot: null,
        losersMatchId: null, losersSlot: null
      };
      if (m.players[0] !== null && m.players[1] === null) m.winner = 0;
      else if (m.players[0] === null && m.players[1] !== null) m.winner = 1;
      round1.push(m);
      this.matches[m.id] = m;
    }
    this.winnersRounds.push(round1);

    for (var r = 1; r < numWRounds; r++) {
      var prev = this.winnersRounds[r - 1];
      var round = [];
      for (var k = 0; k < prev.length; k += 2) {
        var m2 = {
          id: uid(), round: r, index: k / 2,
          players: [null, null],
          winner: null, setScores: [],
          bracket: 'winners', nextMatchId: null, nextSlot: null,
          losersMatchId: null, losersSlot: null
        };
        prev[k].nextMatchId = m2.id; prev[k].nextSlot = 0;
        prev[k + 1].nextMatchId = m2.id; prev[k + 1].nextSlot = 1;
        round.push(m2);
        this.matches[m2.id] = m2;
      }
      this.winnersRounds.push(round);
    }

    var numLRounds = (numWRounds - 1) * 2;
    var prevLosers = null;

    for (var lr = 0; lr < numLRounds; lr++) {
      var lRound = [];
      var isDropRound = lr % 2 === 0;
      var wRoundIdx = Math.floor(lr / 2);
      var wDroppers = this.winnersRounds[wRoundIdx + 1] ? this.winnersRounds[wRoundIdx + 1] : [];

      if (lr === 0) {
        var wr0 = this.winnersRounds[0];
        var matchCount = Math.floor(wr0.length / 2);
        for (var li = 0; li < matchCount; li++) {
          var lm = {
            id: uid(), round: lr, index: li,
            players: [null, null],
            winner: null, setScores: [],
            bracket: 'losers', nextMatchId: null, nextSlot: null
          };
          wr0[li * 2].losersMatchId = lm.id; wr0[li * 2].losersSlot = 0;
          wr0[li * 2 + 1].losersMatchId = lm.id; wr0[li * 2 + 1].losersSlot = 1;
          lRound.push(lm);
          this.matches[lm.id] = lm;
        }
      } else if (isDropRound && prevLosers) {
        for (var di = 0; di < prevLosers.length; di++) {
          var dm = {
            id: uid(), round: lr, index: di,
            players: [null, null],
            winner: null, setScores: [],
            bracket: 'losers', nextMatchId: null, nextSlot: null
          };
          prevLosers[di].nextMatchId = dm.id; prevLosers[di].nextSlot = 0;
          if (wDroppers[di]) {
            wDroppers[di].losersMatchId = dm.id;
            wDroppers[di].losersSlot = 1;
          }
          lRound.push(dm);
          this.matches[dm.id] = dm;
        }
      } else if (prevLosers) {
        for (var pi = 0; pi < prevLosers.length; pi += 2) {
          var pm = {
            id: uid(), round: lr, index: pi / 2,
            players: [null, null],
            winner: null, setScores: [],
            bracket: 'losers', nextMatchId: null, nextSlot: null
          };
          prevLosers[pi].nextMatchId = pm.id; prevLosers[pi].nextSlot = 0;
          if (prevLosers[pi + 1]) {
            prevLosers[pi + 1].nextMatchId = pm.id; prevLosers[pi + 1].nextSlot = 1;
          }
          lRound.push(pm);
          this.matches[pm.id] = pm;
        }
      }
      this.losersRounds.push(lRound);
      prevLosers = lRound;
    }

    var gf = {
      id: uid(), round: -1, index: 0,
      players: [null, null],
      winner: null, setScores: [],
      bracket: 'grand_final', nextMatchId: null, nextSlot: null
    };
    this.grandFinal = gf;
    this.matches[gf.id] = gf;

    var wFinal = this.winnersRounds[this.winnersRounds.length - 1][0];
    wFinal.nextMatchId = gf.id; wFinal.nextSlot = 0;

    if (this.losersRounds.length > 0) {
      var lFinal = this.losersRounds[this.losersRounds.length - 1];
      if (lFinal.length > 0) {
        lFinal[lFinal.length - 1].nextMatchId = gf.id;
        lFinal[lFinal.length - 1].nextSlot = 1;
      }
    }

    var rm = {
      id: uid(), round: -2, index: 0,
      players: [null, null],
      winner: null, setScores: [],
      bracket: 'reset', nextMatchId: null, nextSlot: null
    };
    this.resetMatch = rm;
    this.matches[rm.id] = rm;

    this._propagateByes();
  };

  DoubleElim.prototype._propagateByes = SingleElim.prototype._propagateByes;
  DoubleElim.prototype._isBye = SingleElim.prototype._isBye;

  DoubleElim.prototype._onMatchComplete = function(matchId) {
    var m = this.matches[matchId];
    var winnerPlayer = m.players[m.winner];
    var loserPlayer = m.players[1 - m.winner];

    if (m.nextMatchId) {
      var next = this.matches[m.nextMatchId];
      next.players[m.nextSlot] = winnerPlayer;
    }

    if (m.bracket === 'winners' && m.losersMatchId && loserPlayer) {
      var lm = this.matches[m.losersMatchId];
      lm.players[m.losersSlot] = loserPlayer;
    }

    if (m.bracket === 'grand_final') {
      if (m.winner === 0) {
        this.status = 'completed';
        this.champion = winnerPlayer;
        this.completedAt = Date.now();
      } else {
        this.resetMatch.players[0] = m.players[0];
        this.resetMatch.players[1] = m.players[1];
      }
    }

    if (m.bracket === 'reset') {
      this.status = 'completed';
      this.champion = winnerPlayer;
      this.completedAt = Date.now();
    }

    this._propagateByes();
  };

  DoubleElim.prototype._extraJSON = function() {
    return {
      winnersRounds: this.winnersRounds.map(function(r) { return r.map(function(m) { return m.id; }); }),
      losersRounds: this.losersRounds.map(function(r) { return r.map(function(m) { return m.id; }); }),
      grandFinalId: this.grandFinal ? this.grandFinal.id : null,
      resetMatchId: this.resetMatch ? this.resetMatch.id : null
    };
  };

  // ── Round Robin ──
  function RoundRobin(config) {
    Tournament.call(this, config);
    this.type = 'round_robin';
    this.schedule = [];
    this.standings = [];
    this._build();
  }
  RoundRobin.prototype = Object.create(Tournament.prototype);

  RoundRobin.prototype._build = function() {
    var players = this.config.players.slice();
    var n = players.length;
    var hasBye = n % 2 !== 0;
    if (hasBye) players.push(null);
    var total = players.length;
    var rounds = total - 1;

    var list = players.slice(1);

    for (var r = 0; r < rounds; r++) {
      var roundMatches = [];
      var top = [players[0]].concat(list);
      for (var j = 0; j < total / 2; j++) {
        var p1 = top[j];
        var p2 = top[total - 1 - j];
        if (p1 === null || p2 === null) continue;
        var m = {
          id: uid(), round: r, index: j,
          players: [p1, p2], winner: null, setScores: [],
          bracket: 'round_robin'
        };
        roundMatches.push(m);
        this.matches[m.id] = m;
      }
      this.schedule.push(roundMatches);
      list.unshift(list.pop());
    }

    this._updateStandings();
  };

  RoundRobin.prototype._updateStandings = function() {
    var map = {};
    this.config.players.forEach(function(p) {
      map[p.id] = { player: p, wins: 0, losses: 0, pf: 0, pa: 0 };
    });
    var self = this;
    Object.keys(this.matches).forEach(function(id) {
      var m = self.matches[id];
      if (m.winner === null) return;
      var w = m.players[m.winner];
      var l = m.players[1 - m.winner];
      map[w.id].wins++;
      map[l.id].losses++;
      (m.setScores || []).forEach(function(gs) {
        map[m.players[0].id].pf += gs[0];
        map[m.players[0].id].pa += gs[1];
        map[m.players[1].id].pf += gs[1];
        map[m.players[1].id].pa += gs[0];
      });
    });
    this.standings = Object.values(map).sort(function(a, b) {
      return b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa);
    });
  };

  RoundRobin.prototype._onMatchComplete = function() {
    this._updateStandings();
    var self = this;
    var allDone = Object.keys(this.matches).every(function(id) {
      return self.matches[id].winner !== null;
    });
    if (allDone) {
      this.status = 'completed';
      this.champion = this.standings[0].player;
      this.completedAt = Date.now();
    }
  };

  RoundRobin.prototype._extraJSON = function() {
    return {
      schedule: this.schedule.map(function(r) { return r.map(function(m) { return m.id; }); }),
      standings: this.standings
    };
  };

  // ── Group + Knockout ──
  function GroupKnockout(config) {
    Tournament.call(this, config);
    this.type = 'group_knockout';
    this.groups = [];
    this.knockoutPhase = null;
    this.phase = 'groups';
    this._build();
  }
  GroupKnockout.prototype = Object.create(Tournament.prototype);

  GroupKnockout.prototype._build = function() {
    var players = this.config.players.slice();
    var groupCount = this.config.groupCount || 2;
    var groups = [];
    for (var g = 0; g < groupCount; g++) groups.push([]);

    for (var i = 0; i < players.length; i++) {
      var cycle = Math.floor(i / groupCount);
      var pos = i % groupCount;
      var gIdx = cycle % 2 === 0 ? pos : groupCount - 1 - pos;
      groups[gIdx].push(players[i]);
    }

    for (var gi = 0; gi < groups.length; gi++) {
      var grp = {
        name: String.fromCharCode(65 + gi),
        players: groups[gi],
        matches: [],
        standings: []
      };
      for (var a = 0; a < groups[gi].length; a++) {
        for (var b = a + 1; b < groups[gi].length; b++) {
          var m = {
            id: uid(), round: 0, index: 0,
            players: [groups[gi][a], groups[gi][b]],
            winner: null, setScores: [],
            bracket: 'group', groupIndex: gi
          };
          grp.matches.push(m.id);
          this.matches[m.id] = m;
        }
      }
      this.groups.push(grp);
    }
    this._updateGroupStandings();
  };

  GroupKnockout.prototype._updateGroupStandings = function() {
    var self = this;
    this.groups.forEach(function(grp) {
      var map = {};
      grp.players.forEach(function(p) {
        map[p.id] = { player: p, wins: 0, losses: 0, pf: 0, pa: 0 };
      });
      grp.matches.forEach(function(mid) {
        var m = self.matches[mid];
        if (m.winner === null) return;
        map[m.players[m.winner].id].wins++;
        map[m.players[1 - m.winner].id].losses++;
        (m.setScores || []).forEach(function(gs) {
          map[m.players[0].id].pf += gs[0];
          map[m.players[0].id].pa += gs[1];
          map[m.players[1].id].pf += gs[1];
          map[m.players[1].id].pa += gs[0];
        });
      });
      grp.standings = Object.values(map).sort(function(a, b) {
        return b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa);
      });
    });
  };

  GroupKnockout.prototype._checkGroupsDone = function() {
    var self = this;
    return this.groups.every(function(grp) {
      return grp.matches.every(function(mid) { return self.matches[mid].winner !== null; });
    });
  };

  GroupKnockout.prototype._buildKnockout = function() {
    var advancePerGroup = this.config.advancePerGroup || 2;
    var qualified = [];
    var groupCount = this.groups.length;

    for (var slot = 0; slot < advancePerGroup; slot++) {
      for (var gi = 0; gi < groupCount; gi++) {
        if (this.groups[gi].standings[slot]) {
          qualified.push({
            player: this.groups[gi].standings[slot].player,
            groupIdx: gi,
            seed: slot
          });
        }
      }
    }

    var koPlayers = [];
    if (advancePerGroup === 2 && groupCount >= 2) {
      for (var g1 = 0; g1 < groupCount; g1++) {
        var g2 = (g1 + 1) % groupCount;
        var first = qualified.find(function(q) { return q.groupIdx === g1 && q.seed === 0; });
        var second = qualified.find(function(q) { return q.groupIdx === g2 && q.seed === 1; });
        if (first) koPlayers.push(first.player);
        if (second) koPlayers.push(second.player);
      }
    } else {
      qualified.forEach(function(q) { koPlayers.push(q.player); });
    }

    var self = this;
    var koConfig = {
      id: this.id + '_ko',
      players: koPlayers,
      bestOf: 3
    };
    this.knockoutPhase = new SingleElim(koConfig);
    Object.keys(this.knockoutPhase.matches).forEach(function(mid) {
      self.matches[mid] = self.knockoutPhase.matches[mid];
    });
    this.phase = 'knockout';
  };

  GroupKnockout.prototype._onMatchComplete = function(matchId) {
    var m = this.matches[matchId];
    if (m.bracket === 'group') {
      this._updateGroupStandings();
      if (this._checkGroupsDone()) {
        this._buildKnockout();
      }
    } else {
      this.knockoutPhase._onMatchComplete.call(this.knockoutPhase, matchId);
      if (this.knockoutPhase.status === 'completed') {
        this.status = 'completed';
        this.champion = this.knockoutPhase.champion;
        this.completedAt = Date.now();
      }
    }
  };

  GroupKnockout.prototype.getNextMatches = function() {
    var self = this;
    if (this.phase === 'knockout' && this.knockoutPhase) {
      return this.knockoutPhase.getNextMatches();
    }
    return Object.keys(this.matches).filter(function(id) {
      var m = self.matches[id];
      return m.winner === null && m.players[0] !== null && m.players[1] !== null;
    }).map(function(id) { return self.matches[id]; });
  };

  GroupKnockout.prototype._extraJSON = function() {
    return {
      groups: this.groups.map(function(g) {
        return { name: g.name, players: g.players, matches: g.matches, standings: g.standings };
      }),
      phase: this.phase,
      knockoutRounds: this.knockoutPhase ? this.knockoutPhase.rounds.map(function(r) {
        return r.map(function(m) { return m.id; });
      }) : null
    };
  };

  // ── Swiss System ──
  function Swiss(config) {
    Tournament.call(this, config);
    this.type = 'swiss';
    this.totalRounds = config.swissRounds || Math.ceil(Math.log2(config.players.length));
    this.currentRound = 0;
    this.roundSchedule = [];
    this.standings = [];
    this.playedPairs = {};
    this._buildRound();
  }
  Swiss.prototype = Object.create(Tournament.prototype);

  Swiss.prototype._pairKey = function(a, b) {
    return a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
  };

  Swiss.prototype._updateStandings = function() {
    var map = {};
    var self = this;
    this.config.players.forEach(function(p) {
      map[p.id] = { player: p, wins: 0, losses: 0, pf: 0, pa: 0, opponents: [], buchholz: 0 };
    });
    Object.keys(this.matches).forEach(function(id) {
      var m = self.matches[id];
      if (m.winner === null) return;
      var w = m.players[m.winner];
      var l = m.players[1 - m.winner];
      map[w.id].wins++;
      map[l.id].losses++;
      map[w.id].opponents.push(l.id);
      map[l.id].opponents.push(w.id);
      (m.setScores || []).forEach(function(gs) {
        map[m.players[0].id].pf += gs[0];
        map[m.players[0].id].pa += gs[1];
        map[m.players[1].id].pf += gs[1];
        map[m.players[1].id].pa += gs[0];
      });
    });
    Object.values(map).forEach(function(s) {
      s.buchholz = s.opponents.reduce(function(sum, oppId) {
        return sum + (map[oppId] ? map[oppId].wins : 0);
      }, 0);
    });
    this.standings = Object.values(map).sort(function(a, b) {
      return b.wins - a.wins || b.buchholz - a.buchholz || (b.pf - b.pa) - (a.pf - a.pa);
    });
  };

  Swiss.prototype._buildRound = function() {
    this._updateStandings();
    var sorted = this.standings.map(function(s) { return s.player; });
    var paired = {};
    var roundMatches = [];
    var self = this;

    for (var i = 0; i < sorted.length; i++) {
      if (paired[sorted[i].id]) continue;
      for (var j = i + 1; j < sorted.length; j++) {
        if (paired[sorted[j].id]) continue;
        var key = this._pairKey(sorted[i], sorted[j]);
        if (!this.playedPairs[key]) {
          var m = {
            id: uid(), round: this.currentRound, index: roundMatches.length,
            players: [sorted[i], sorted[j]],
            winner: null, setScores: [],
            bracket: 'swiss'
          };
          roundMatches.push(m);
          this.matches[m.id] = m;
          paired[sorted[i].id] = true;
          paired[sorted[j].id] = true;
          this.playedPairs[key] = true;
          break;
        }
      }
    }
    this.roundSchedule.push(roundMatches);
  };

  Swiss.prototype._onMatchComplete = function() {
    this._updateStandings();
    var self = this;
    var currentRoundDone = this.roundSchedule[this.currentRound].every(function(m) {
      return self.matches[m.id].winner !== null;
    });

    if (currentRoundDone) {
      this.currentRound++;
      if (this.currentRound >= this.totalRounds) {
        this.status = 'completed';
        this.champion = this.standings[0].player;
        this.completedAt = Date.now();
      } else {
        this._buildRound();
      }
    }
  };

  Swiss.prototype._extraJSON = function() {
    return {
      totalRounds: this.totalRounds,
      currentRound: this.currentRound,
      roundSchedule: this.roundSchedule.map(function(r) { return r.map(function(m) { return m.id; }); }),
      standings: this.standings,
      playedPairs: this.playedPairs
    };
  };

  // ── Factory ──
  function createTournament(config) {
    switch (config.format) {
      case 'single_elim': return new SingleElim(config);
      case 'double_elim': return new DoubleElim(config);
      case 'round_robin': return new RoundRobin(config);
      case 'group_knockout': return new GroupKnockout(config);
      case 'swiss': return new Swiss(config);
      default: return new SingleElim(config);
    }
  }

  function restoreTournament(json) {
    var t = createTournament(json.config);
    t.id = json.id;
    t.status = json.status;
    t.createdAt = json.createdAt;
    t.completedAt = json.completedAt;
    t.champion = json.champion;
    Object.keys(json.matches).forEach(function(mid) {
      if (t.matches[mid]) {
        t.matches[mid].winner = json.matches[mid].winner;
        t.matches[mid].setScores = json.matches[mid].setScores || [];
        t.matches[mid].players = json.matches[mid].players;
      }
    });
    if (json.extra) {
      if (t.type === 'round_robin') {
        t.standings = json.extra.standings || t.standings;
      } else if (t.type === 'swiss') {
        t.currentRound = json.extra.currentRound || 0;
        t.playedPairs = json.extra.playedPairs || {};
        t.standings = json.extra.standings || t.standings;
      } else if (t.type === 'group_knockout') {
        t.phase = json.extra.phase || 'groups';
        if (json.extra.groups) {
          json.extra.groups.forEach(function(g, i) {
            if (t.groups[i]) t.groups[i].standings = g.standings || [];
          });
        }
      }
    }
    return t;
  }

  BV.Tournament = {
    create: createTournament,
    restore: restoreTournament,
    SingleElim: SingleElim,
    DoubleElim: DoubleElim,
    RoundRobin: RoundRobin,
    GroupKnockout: GroupKnockout,
    Swiss: Swiss
  };
})(window.BeachVolley);
