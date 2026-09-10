CREATE TABLE players (
  name TEXT PRIMARY KEY,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finished_at INTEGER NOT NULL,
  target REAL NOT NULL,
  low_wins INTEGER NOT NULL
);
CREATE TABLE game_players (
  game_id INTEGER NOT NULL REFERENCES games(id),
  name TEXT NOT NULL REFERENCES players(name),
  total REAL NOT NULL,
  rank INTEGER NOT NULL,
  is_last INTEGER NOT NULL,
  PRIMARY KEY (game_id, name)
);
