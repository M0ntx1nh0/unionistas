export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  scout_name: string | null;
  role: "admin" | "coordinator" | "scout" | "viewer";
  active: boolean;
};

export type Season = {
  id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
};

export type CalendarMatch = {
  id: string;
  competition: string;
  group_name: string | null;
  matchday: number | null;
  match_date: string | null;
  kickoff_time: string | null;
  home_team_name: string;
  away_team_name: string;
  normalized_home_team_name: string | null;
  normalized_away_team_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  status: string | null;
  venue: string | null;
  city: string | null;
  slug: string | null;
};

export type DashboardCounts = {
  scoutingReports: number;
  calendarMatches: number;
  campogramPlayers: number;
  campogramReports: number;
};

export type PlayerSummary = {
  player_name: string;
  team_name: string | null;
  competition: string | null;
  position: string | null;
  verdict: string | null;
  report_date: string | null;
  reports_count: number;
  scouts_count: number;
};

export type ScoutingReport = {
  id: string;
  player_name: string;
  scout_name: string | null;
  scout_email: string | null;
  team_name: string | null;
  competition: string | null;
  group_name: string | null;
  position: string | null;
  verdict: string | null;
  birth_year: number | null;
  birth_place: string | null;
  nationality: string | null;
  foot: string | null;
  secondary_position: string | null;
  contract_until: string | null;
  agency: string | null;
  contract_status: string | null;
  matchday: number | null;
  watched_match: string | null;
  viewing_type: string | null;
  positive_aspects: string | null;
  negative_aspects: string | null;
  times_seen_same_scout: number | null;
  report_date: string | null;
  rating_technical: string | null;
  rating_physical: string | null;
  rating_psychological: string | null;
  comments: string | null;
  raw_data: Record<string, unknown>;
};

export type ObjectivePlayer = {
  id: string;
  objective_dataset: string;
  source_player_id: string;
  name: string | null;
  full_name: string | null;
  birth_year: number | null;
  birth_date: string | null;
  birth_country_name: string | null;
  passport_country_names: string | null;
  image: string | null;
  current_team_name: string | null;
  domestic_competition_name: string | null;
  current_team_logo: string | null;
  current_team_color: string | null;
  last_club_name: string | null;
  contract_expires: string | null;
  market_value: number | null;
  on_loan: boolean | null;
  positions: string | null;
  primary_position: string | null;
  primary_position_label: string | null;
  secondary_position: string | null;
  secondary_position_label: string | null;
  third_position: string | null;
  third_position_label: string | null;
  foot: string | null;
  height: number | null;
  weight: number | null;
  metrics: Record<string, unknown>;
};

export type ObjectivePlayerMatch = {
  id: string;
  objective_player_id: string;
  objective_dataset: string;
  scouting_player_name: string | null;
  normalized_scouting_player_name: string | null;
  objective_full_name: string | null;
  objective_birth_year: number | null;
  objective_team: string | null;
  objective_last_club: string | null;
  name_similarity: number | null;
  team_similarity: number | null;
  match_score: number | null;
  match_status: "seguro" | "probable" | "dudoso" | "sin_match";
  objective_player?: ObjectivePlayer;
};

export type Campogram = {
  id: string;
  name: string;
  display_order: number;
};

export type CampogramPlayer = {
  id: string;
  campogram_id: string;
  player_name: string;
  team_name: string | null;
  loaned: boolean | null;
  owner_team_name: string | null;
  category: string | null;
  birth_year: number | null;
  position: string | null;
  agent: string | null;
  foot: string | null;
  raw_data: Record<string, unknown> | null;
};

export type CampogramReport = {
  id: string;
  campogram_id: string | null;
  campogram_player_id: string | null;
  player_name: string;
  scout_name: string | null;
  scout_email: string | null;
  team_name: string | null;
  category: string | null;
  loaned: boolean | null;
  owner_team_name: string | null;
  campogram_name: string | null;
  position: string | null;
  verdict: string | null;
  technical_comment: string | null;
  physical_comment: string | null;
  psychological_comment: string | null;
  report_date: string | null;
  raw_data: Record<string, unknown> | null;
};
