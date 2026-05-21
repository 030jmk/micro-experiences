window.BeachVolley = window.BeachVolley || {};

(function(BV) {
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function MatchEngine(config) {
    this.id = config.id || uid();
    this.config = config;
    this.setsWon = [0, 0];
    this.sets = [];
    this.actionLog = [];
    this.status = 'in_progress';
    this.winner = null;
    this.startedAt = Date.now();
    this.completedAt = null;
    this._initSet();
  }

  MatchEngine.prototype._initSet = function() {
    var setNum = this.sets.length;
    var servingTeam = (this.config.firstServingTeam + setNum) % 2;

    this.currentSet = {
      scores: [0, 0],
      servingTeam: servingTeam,
      nextServerIdx: [0, 0]
    };
  };

  MatchEngine.prototype._setTarget = function() {
    return this.sets.length < 2 ? 21 : 15;
  };

  MatchEngine.prototype._switchInterval = function() {
    return this.sets.length < 2 ? 7 : 5;
  };

  MatchEngine.prototype.getServer = function() {
    var g = this.currentSet;
    return { side: g.servingTeam, playerIdx: g.nextServerIdx[g.servingTeam] };
  };

  MatchEngine.prototype.pointFor = function(side) {
    if (this.status !== 'in_progress') return;
    var g = this.currentSet;

    this.actionLog.push({
      type: 'point',
      side: side,
      scores: [g.scores[0], g.scores[1]],
      servingTeam: g.servingTeam,
      nextServerIdx: [g.nextServerIdx[0], g.nextServerIdx[1]],
      timestamp: Date.now()
    });

    g.scores[side]++;

    if (side !== g.servingTeam) {
      var losingTeam = g.servingTeam;
      g.nextServerIdx[losingTeam] = (g.nextServerIdx[losingTeam] + 1) % 2;
      g.servingTeam = side;
    }

    if (this._isSetWon()) {
      var setSide = g.scores[0] > g.scores[1] ? 0 : 1;
      this.setsWon[setSide]++;
      this.sets.push({
        scores: [g.scores[0], g.scores[1]],
        winner: setSide
      });

      if (this.setsWon[setSide] >= 2) {
        this.status = 'completed';
        this.winner = setSide;
        this.completedAt = Date.now();
      } else {
        this._initSet();
      }
    }
  };

  MatchEngine.prototype._isSetWon = function() {
    var s = this.currentSet.scores;
    var target = this._setTarget();
    if (s[0] >= target && s[0] - s[1] >= 2) return true;
    if (s[1] >= target && s[1] - s[0] >= 2) return true;
    return false;
  };

  MatchEngine.prototype.shouldSwitchSides = function() {
    var total = this.currentSet.scores[0] + this.currentSet.scores[1];
    if (total === 0) return false;
    return total % this._switchInterval() === 0;
  };

  MatchEngine.prototype.undo = function() {
    if (this.actionLog.length === 0) return;
    var last = this.actionLog.pop();

    if (this.status === 'completed') {
      this.status = 'in_progress';
      this.winner = null;
      this.completedAt = null;
      if (this.sets.length > 0) {
        var lastSet = this.sets.pop();
        this.setsWon[lastSet.winner]--;
      }
    }

    this.currentSet.scores = [last.scores[0], last.scores[1]];
    this.currentSet.servingTeam = last.servingTeam;
    this.currentSet.nextServerIdx = [last.nextServerIdx[0], last.nextServerIdx[1]];
  };

  MatchEngine.prototype.getLeftName = function() {
    return this.config.teams[0].map(function(p) { return p.name; }).join(' / ');
  };

  MatchEngine.prototype.getRightName = function() {
    return this.config.teams[1].map(function(p) { return p.name; }).join(' / ');
  };

  MatchEngine.prototype.getServerName = function() {
    var srv = this.getServer();
    return this.config.teams[srv.side][srv.playerIdx].name;
  };

  MatchEngine.prototype.getServerSide = function() {
    return this.getServer().side;
  };

  MatchEngine.prototype.isDeuce = function() {
    var s = this.currentSet.scores;
    var target = this._setTarget();
    return s[0] >= target - 1 && s[1] >= target - 1 && s[0] === s[1];
  };

  MatchEngine.prototype.isSetPoint = function() {
    var s = this.currentSet.scores;
    var target = this._setTarget();
    if (s[0] >= target - 1 && s[0] - s[1] >= 1) return { side: 0 };
    if (s[1] >= target - 1 && s[1] - s[0] >= 1) return { side: 1 };
    return null;
  };

  MatchEngine.prototype.isMatchPoint = function() {
    var sp = this.isSetPoint();
    if (!sp) return null;
    if (this.setsWon[sp.side] === 1) return sp;
    return null;
  };

  MatchEngine.prototype.toJSON = function() {
    return {
      id: this.id,
      config: this.config,
      setsWon: this.setsWon,
      sets: this.sets,
      actionLog: this.actionLog,
      status: this.status,
      winner: this.winner,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      currentSet: this.currentSet
    };
  };

  MatchEngine.fromJSON = function(data) {
    var eng = Object.create(MatchEngine.prototype);
    eng.id = data.id;
    eng.config = data.config;
    eng.setsWon = data.setsWon;
    eng.sets = data.sets;
    eng.actionLog = data.actionLog;
    eng.status = data.status;
    eng.winner = data.winner;
    eng.startedAt = data.startedAt;
    eng.completedAt = data.completedAt;
    eng.currentSet = data.currentSet;
    return eng;
  };

  BV.MatchEngine = MatchEngine;
  BV.uid = uid;
})(window.BeachVolley);
