window.PongScore = window.PongScore || {};

(function(PS) {
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function MatchEngine(config) {
    this.id = config.id || uid();
    this.config = config;
    this.gamesWon = [0, 0];
    this.games = [];
    this.actionLog = [];
    this.status = 'in_progress';
    this.winner = null;
    this.startedAt = Date.now();
    this.completedAt = null;
    this._initGame();
  }

  MatchEngine.prototype._initGame = function() {
    var serviceOrder;
    if (this.config.type === 'doubles') {
      var teamA = this.config.teams[0];
      var teamB = this.config.teams[1];
      serviceOrder = [];
      var maxLen = Math.max(teamA.length, teamB.length);
      for (var i = 0; i < maxLen; i++) {
        serviceOrder.push({ side: 0, playerIdx: i % teamA.length });
        serviceOrder.push({ side: 1, playerIdx: i % teamB.length });
      }
    } else {
      serviceOrder = [
        { side: 0, playerIdx: 0 },
        { side: 1, playerIdx: 0 }
      ];
    }

    var gameNum = this.games.length;
    var firstServerIdx = (this.config.firstServerIndex + gameNum) % serviceOrder.length;
    var rotated = serviceOrder.slice(firstServerIdx).concat(serviceOrder.slice(0, firstServerIdx));

    this.currentGame = {
      scores: [0, 0],
      serviceOrder: rotated,
      serverPointer: 0,
      pointsServed: 0
    };
  };

  MatchEngine.prototype.getServer = function() {
    var g = this.currentGame;
    return g.serviceOrder[g.serverPointer % g.serviceOrder.length];
  };

  MatchEngine.prototype._advanceServer = function() {
    var g = this.currentGame;
    var isDeuce = g.scores[0] >= 10 && g.scores[1] >= 10;
    var interval = isDeuce ? 1 : 2;
    g.pointsServed++;
    if (g.pointsServed >= interval) {
      g.pointsServed = 0;
      g.serverPointer = (g.serverPointer + 1) % g.serviceOrder.length;
    }
  };

  MatchEngine.prototype.pointFor = function(side) {
    if (this.status !== 'in_progress') return;
    var g = this.currentGame;

    this.actionLog.push({
      type: 'point',
      side: side,
      scores: [g.scores[0], g.scores[1]],
      serverPointer: g.serverPointer,
      pointsServed: g.pointsServed,
      timestamp: Date.now()
    });

    g.scores[side]++;
    this._advanceServer();

    if (this._isGameWon()) {
      var gameSide = g.scores[0] > g.scores[1] ? 0 : 1;
      this.gamesWon[gameSide]++;
      this.games.push({
        scores: [g.scores[0], g.scores[1]],
        winner: gameSide
      });

      var needed = Math.ceil(this.config.bestOf / 2);
      if (this.gamesWon[gameSide] >= needed) {
        this.status = 'completed';
        this.winner = gameSide;
        this.completedAt = Date.now();
      } else {
        this._initGame();
      }
    }
  };

  MatchEngine.prototype._isGameWon = function() {
    var s = this.currentGame.scores;
    if (s[0] >= 11 && s[0] - s[1] >= 2) return true;
    if (s[1] >= 11 && s[1] - s[0] >= 2) return true;
    return false;
  };

  MatchEngine.prototype.undo = function() {
    if (this.actionLog.length === 0) return;
    var last = this.actionLog.pop();

    if (this.status === 'completed') {
      this.status = 'in_progress';
      this.winner = null;
      this.completedAt = null;
      if (this.games.length > 0) {
        var lastGame = this.games.pop();
        var gameSide = lastGame.winner;
        this.gamesWon[gameSide]--;
      }
    }

    this.currentGame.scores = [last.scores[0], last.scores[1]];
    this.currentGame.serverPointer = last.serverPointer;
    this.currentGame.pointsServed = last.pointsServed;
  };

  MatchEngine.prototype.getLeftName = function() {
    if (this.config.type === 'doubles') {
      return this.config.teams[0].map(function(p) { return p.name; }).join(' / ');
    }
    return this.config.players[0].name;
  };

  MatchEngine.prototype.getRightName = function() {
    if (this.config.type === 'doubles') {
      return this.config.teams[1].map(function(p) { return p.name; }).join(' / ');
    }
    return this.config.players[1].name;
  };

  MatchEngine.prototype.getServerName = function() {
    var srv = this.getServer();
    if (this.config.type === 'doubles') {
      return this.config.teams[srv.side][srv.playerIdx].name;
    }
    return this.config.players[srv.side].name;
  };

  MatchEngine.prototype.getServerSide = function() {
    return this.getServer().side;
  };

  MatchEngine.prototype.isDeuce = function() {
    var s = this.currentGame.scores;
    return s[0] >= 10 && s[1] >= 10;
  };

  MatchEngine.prototype.isGamePoint = function() {
    var s = this.currentGame.scores;
    if (s[0] >= 10 && s[0] > s[1]) return { side: 0 };
    if (s[1] >= 10 && s[1] > s[0]) return { side: 1 };
    return null;
  };

  MatchEngine.prototype.isMatchPoint = function() {
    var gp = this.isGamePoint();
    if (!gp) return null;
    var needed = Math.ceil(this.config.bestOf / 2);
    if (this.gamesWon[gp.side] === needed - 1) return gp;
    return null;
  };

  MatchEngine.prototype.toJSON = function() {
    return {
      id: this.id,
      config: this.config,
      gamesWon: this.gamesWon,
      games: this.games,
      actionLog: this.actionLog,
      status: this.status,
      winner: this.winner,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      currentGame: this.currentGame
    };
  };

  MatchEngine.fromJSON = function(data) {
    var eng = Object.create(MatchEngine.prototype);
    eng.id = data.id;
    eng.config = data.config;
    eng.gamesWon = data.gamesWon;
    eng.games = data.games;
    eng.actionLog = data.actionLog;
    eng.status = data.status;
    eng.winner = data.winner;
    eng.startedAt = data.startedAt;
    eng.completedAt = data.completedAt;
    eng.currentGame = data.currentGame;
    return eng;
  };

  PS.MatchEngine = MatchEngine;
  PS.uid = uid;
})(window.PongScore);
