-- Launch scope: 5 leagues. Sport keys and codes to be confirmed against /v4/sports and /v4/competitions.
insert into public.competitions (external_id, football_data_code, name, country) values
  ('soccer_epl', 'PL', 'Premier League', 'Angleterre'),
  ('soccer_spain_la_liga', 'PD', 'LaLiga', 'Espagne'),
  ('soccer_italy_serie_a', 'SA', 'Serie A', 'Italie'),
  ('soccer_germany_bundesliga', 'BL1', 'Bundesliga', 'Allemagne'),
  ('soccer_france_ligue_one', 'FL1', 'Ligue 1', 'France')
on conflict (external_id) do nothing;
