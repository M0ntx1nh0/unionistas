// Ligas, países, logos y normalización de equipos compartidos por Calendario y Equipos.
import type { ObjectivePlayerMatch } from "../types";
import countryFlags from "./countryFlags.json";
import logo1RFEF from "../../../assets/Logos/1RFEF_Logo.png";
import logo2RFEF from "../../../assets/Logos/2RFEF_Logo.png";
import logoLiga2Portugal from "../../../assets/Logos/Liga2_Portugal.png";
import logoLiga3Portugal from "../../../assets/Logos/Liga3_Portugal.png";
import logoNextGen from "../../../assets/Logos/LigaNextGen_Portugal.png";
import logoPrimavera1 from "../../../assets/Logos/LigaPrimavera1_Italia.png";
import logoLigue3 from "../../../assets/Logos/Ligue3_Francia.png";
import logoNational1 from "../../../assets/Logos/National1_Francia.png";
import logoSerieC from "../../../assets/Logos/SerieC_Italia.png";


export type TeamLogoMap = Map<string, string>;

export const COMPETITIONS = [
  "1RFEF",
  "2RFEF",
  "Serie C",
  "Primavera 1",
  "Ligue 3",
  "National 1",
  "Liga Portugal 2",
  "Liga 3",
  "Next Gen",
] as const;
export type CompetitionName = (typeof COMPETITIONS)[number];

export type CountryCode = "ES" | "IT" | "FR" | "PT";

export const COUNTRIES: Array<{ code: CountryCode; name: string }> = [
  { code: "ES", name: "España" },
  { code: "IT", name: "Italia" },
  { code: "FR", name: "Francia" },
  { code: "PT", name: "Portugal" },
];

export const COMPETITION_COUNTRY: Record<CompetitionName, CountryCode> = {
  "1RFEF": "ES",
  "2RFEF": "ES",
  "Serie C": "IT",
  "Primavera 1": "IT",
  "Ligue 3": "FR",
  "National 1": "FR",
  "Liga Portugal 2": "PT",
  "Liga 3": "PT",
  "Next Gen": "PT",
};

// Si una liga no tiene logo se muestra solo su nombre.
export const COMPETITION_LOGOS: Partial<Record<CompetitionName, string>> = {
  "1RFEF": logo1RFEF,
  "2RFEF": logo2RFEF,
  "Serie C": logoSerieC,
  "Primavera 1": logoPrimavera1,
  "Ligue 3": logoLigue3,
  "National 1": logoNational1,
  "Liga Portugal 2": logoLiga2Portugal,
  "Liga 3": logoLiga3Portugal,
  "Next Gen": logoNextGen,
};

export function CompetitionLogo({ competition, size }: { competition: CompetitionName; size: "chip" | "header" }) {
  const logo = COMPETITION_LOGOS[competition];
  if (!logo) return null;
  return (
    <span className={`calendar-competition-logo calendar-competition-logo--${size}`}>
      <img alt="" src={logo} />
    </span>
  );
}

// Banderas de flag-icons (SVG servidos por la propia app; los emojis no se ven en Windows).
// El mapa país -> ISO vive en countryFlags.json para que el sync de informes avise de países nuevos.
const COUNTRY_ISO_BY_NAME = countryFlags as Record<string, string>;
const COUNTRY_CODE_ISO: Record<CountryCode, string> = { ES: "es", IT: "it", FR: "fr", PT: "pt" };

export function countryIso(countryName: string | null | undefined) {
  const iso = COUNTRY_ISO_BY_NAME[normalizeText(countryName)];
  return iso && !iso.includes(" ") ? iso : undefined;
}

export function CountryFlag({ code, country }: { code?: CountryCode; country?: string }) {
  const iso = code ? COUNTRY_CODE_ISO[code] : countryIso(country);
  if (!iso) {
    return (
      <span aria-hidden="true" className="teams-country-initials">
        {(country || "?").slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return <span aria-hidden="true" className={`fi fi-${iso} calendar-flag`} />;
}

// Escudo de un equipo en Sofascore a partir del id guardado en calendar_matches.
// Sofascore rechaza la imagen si llega el referer de nuestra web: usar referrerPolicy="no-referrer".
export function sofascoreTeamImage(teamId: string | null | undefined) {
  const id = (teamId || "").trim();
  return /^\d+$/.test(id) ? `https://img.sofascore.com/api/v1/team/${id}/image` : undefined;
}

// En ligas extranjeras los informes usan el nombre oficial del club ("AC Trento",
// "SSC Bari") y Sofascore el corto ("Trento", "Bari"): se ignoran siglas y años.
export const LOOSE_NAME_COMPETITIONS = new Set<string>([
  "Serie C",
  "Primavera 1",
  "Ligue 3",
  "National 1",
  "Liga Portugal 2",
  "Liga 3",
  "Next Gen",
]);
export const CLUB_NAME_NOISE = new Set([
  "ac", "acf", "ad", "afc", "as", "asd", "calcio", "cd", "cf", "cfc", "fc", "futebol", "gd",
  "sad", "sc", "sl", "ss", "ssc", "ssd", "uc", "ud", "us", "usd", "u19", "u20", "u21", "u23",
]);

export const TEAM_ALIASES: Record<string, Record<string, string>> = {
  "1RFEF": {
    "racing ferrol": "racing de ferrol",
    "racing de ferrol": "racing de ferrol",
    "atletico b": "atletico madrid b",
    "atletico madrileno": "atletico madrid b",
    "atletico madrileño": "atletico madrid b",
    "sabadell": "sabadell",
    "ce sabadell": "sabadell",
    "osasuna promesas": "osasuna promesas",
    "osasuna b": "osasuna promesas",
    "europa": "europa",
    "ce europa": "europa",
    "cacereno": "cacereno",
    "cp cacereno": "cacereno",
    "athletic b": "athletic bilbao",
    "athletic club b": "athletic bilbao",
    "athletic club b u21": "athletic bilbao",
    "bilbao athletic": "athletic bilbao",
    "athletic bilbao u21": "athletic bilbao",
    "celta fortuna": "celta fortuna",
    "celta b": "celta fortuna",
    "celta vigo b": "celta fortuna",
    "villarreal b": "villarreal b",
    "villarreal cf b": "villarreal b",
    "villarreal cf b u23": "villarreal b",
    "nastic": "gimnastic tarragona",
    "nastic de tarragona": "gimnastic tarragona",
    "gimnastic de tarragona": "gimnastic tarragona",
    "gimnastic tarragona": "gimnastic tarragona",
    "at sanluqueno": "atletico sanluqueno",
    "at.sanluqueno": "atletico sanluqueno",
    "atletico sanluqueno": "atletico sanluqueno",
    "atletico sanluqueño": "atletico sanluqueno",
    "torremolinos": "juventud torremolinos",
    "juventud torremolinos": "juventud torremolinos",
    "juventud torremolinos cf": "juventud torremolinos",
    "villarreal b u23": "villarreal b",
    "merida": "merida ad",
    "ad merida": "merida ad",
    "merida ad": "merida ad",
    "mirandes": "mirandes",
    "cd mirandes": "mirandes",
    "ourense": "union deportiva ourense",
    "ud ourense": "union deportiva ourense",
    "union deportiva ourense": "union deportiva ourense",
    "real union": "real union club",
    "real union club": "real union club",
    "alcorcon": "ad alcorcon",
    "ad alcorcon": "ad alcorcon",
    "aguilas": "cda aguilas",
    "aguilas fc": "cda aguilas",
    "cda aguilas": "cda aguilas",
    "cda aguilas fc": "cda aguilas",
  },
  "Primavera 1": {
    "inter de milan u20": "inter",
  },
  "Liga Portugal 2": {
    "lusitania": "lusitania lourosa",
    "lusitania fc": "lusitania lourosa",
  },
  "Liga 3": {
    "vitoria guimaraes b": "vitoria b",
  },
  "National 1": {
    "estac troyes b": "troyes 2",
    "troyes b": "troyes 2",
    "troyes 2": "troyes 2",
  },
  "2RFEF": {
    "alaves b": "deportivo alaves b",
    "deportivo alaves b": "deportivo alaves b",
    "atletico malagueno": "atletico malagueno",
    "atletico malagueño": "atletico malagueno",
    "malagueno": "atletico malagueno",
    "malagueño": "atletico malagueno",
    "barca athletic": "barcelona atletic",
    "barca atletic": "barcelona atletic",
    "barça atletic": "barcelona atletic",
    "barcelona athletic": "barcelona atletic",
    "barcelona atletic": "barcelona atletic",
    "barcelona atlètic": "barcelona atletic",
    "deportivo fabril": "deportivo fabril",
    "deportivo de la coruna b": "deportivo fabril",
    "deportivo la coruna b": "deportivo fabril",
    "deportivo b": "deportivo fabril",
    "fabril": "deportivo fabril",
    "elche b": "elche illicitano",
    "elche ilicitano": "elche illicitano",
    "elche illicitano": "elche illicitano",
    "oviedo vetusta": "real oviedo vetusta",
    "real oviedo vetusta": "real oviedo vetusta",
    "real oviedo b": "real oviedo vetusta",
    "r majadahonda": "rayo majadahonda",
    "rayo majadahonda": "rayo majadahonda",
    "cf rayo majadahonda": "rayo majadahonda",
    "majadahonda": "rayo majadahonda",
    "segoviana": "gimnastica segoviana",
    "gimnastica segoviana": "gimnastica segoviana",
    "gimnástica segoviana": "gimnastica segoviana",
    "xerez cd": "xerez",
    "xerez": "xerez",
    "xerez deportivo": "xerez deportivo",
    "xerez deportivo fc": "xerez deportivo",
    "racing b": "racing santander ii",
    "rayo cantabria": "racing santander ii",
    "racing santander ii": "racing santander ii",
    "las palmas atletico": "las palmas atletico",
    "las palmas atletico b": "las palmas atletico",
    "intercity": "intercity sj d alacant",
    "cf intercity": "intercity sj d alacant",
    "intercity sj d alacant": "intercity sj d alacant",
    "ud sanse": "s s reyes",
    "s s reyes": "s s reyes",
    "san sebastian de los reyes": "s s reyes",
    // Desde 2026/27 la UD Ourense juega en 1RFEF; en 2RFEF "Ourense" es el Ourense CF.
    "ourense": "ourense cf",
    "ourense cf": "ourense cf",
    "lleida": "ce atletic lleida 2019",
    "atletic lleida": "ce atletic lleida 2019",
    "atletic lledia": "ce atletic lleida 2019",
    "ce atletic lleida 2019": "ce atletic lleida 2019",
    "langreo": "up langreo",
    "andratx": "ce andratx",
    "sant andreu": "ue sant andreu",
    "la union": "la union atletico",
    "fc la union atletico": "la union atletico",
    "la union atletico": "la union atletico",
    "navalcarnero": "cda navalcarnero",
    "aguilas": "cda aguilas",
    "aguilas fc": "cda aguilas",
    "deportivo aragon": "real zaragoza b",
    "rz deportivo aragon": "real zaragoza b",
    "real zaragoza b": "real zaragoza b",
    "zaragoza b": "real zaragoza b",
    "olot": "ue olot",
    "extremadura": "cd extremadura",
    "cd extremadura": "cd extremadura",
    "cd extremadura 1924": "extremadura 1924",
    "extremadura 1924": "extremadura 1924",
    "recreativo": "recreativo huelva",
    "recre": "recreativo huelva",
    "recreativo de huelva": "recreativo huelva",
    "recreativo huelva": "recreativo huelva",
    "puente genil": "salerm puente genil",
    "reus": "reus fcr",
    "reus fc reddis": "reus fcr",
    "reus fcr": "reus fcr",
    "socuellamos": "ud yugo socuellamos",
    "valladolid b": "real valladolid promesas",
    "valladolid promesas": "real valladolid promesas",
    "real valladolid b": "real valladolid promesas",
    "real valladolid promesas": "real valladolid promesas",
    "barbastro": "union deportiva barbastro",
    "porreres": "ue porreres",
    "antoniano": "club atletico antoniano",
    "marino": "marino de luanco",
    "marino luanco": "marino de luanco",
    "marino de luanco": "marino de luanco",
    "ucam": "ucam murcia",
    "ucam murcia": "ucam murcia",
    "guadalajara": "guadalajara",
    "cd guadalajara": "guadalajara",
    "conquense": "conquense",
    "ub conquense": "conquense",
    "atletico baleares": "cd atletico baleares",
    "cd atletico baleares": "cd atletico baleares",
    "salamanca cf": "salamanca uds",
    "salamanca cf uds": "salamanca uds",
    "salamanca uds": "salamanca uds",
  },
};

export function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " y ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

export function competitionKey(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (normalized.includes("2rfef") || normalized.includes("2 rfef") || normalized.includes("segunda")) {
    return "2RFEF";
  }
  if (normalized.includes("1rfef") || normalized.includes("1 rfef") || normalized.includes("primera")) {
    return "1RFEF";
  }
  if (/\bserie c\b/.test(normalized)) {
    return "Serie C";
  }
  // Desde 2026/27: Ligue 3 es el antiguo National y National 1 el antiguo National 2.
  if (/\bnational 1\b/.test(normalized)) {
    return "National 1";
  }
  if (/\bligue 3\b/.test(normalized) || normalized === "national" || normalized === "francia national") {
    return "Ligue 3";
  }
  // En los informes la Primavera 1 aparece como "Italia (U20)"; la Primavera 2 no se carga.
  if (
    /\bprimavera 1\b/.test(normalized) ||
    normalized === "italia u20" ||
    normalized.includes("supercoppa primavera")
  ) {
    return "Primavera 1";
  }
  if (/\bliga portugal 2\b/.test(normalized) || normalized === "portugal liga 2") {
    return "Liga Portugal 2";
  }
  if (normalized === "portugal liga 3" || normalized === "liga 3") {
    return "Liga 3";
  }
  if (/\bnext gen\b/.test(normalized) || normalized.includes("revelacao") || normalized === "portugal u23") {
    return "Next Gen";
  }
  return "";
}

export function canonicalTeamName(teamName: string | null | undefined, competition: string) {
  const normalized = normalizeText(teamName);
  const alias = TEAM_ALIASES[competition]?.[normalized];
  if (alias) return alias;
  if (!LOOSE_NAME_COMPETITIONS.has(competition)) return normalized;
  const loose = normalized
    .split(" ")
    .filter((token) => !CLUB_NAME_NOISE.has(token) && !/^(18|19|20)\d{2}$/.test(token))
    .join(" ");
  return loose || normalized;
}

export function playerVerdict(verdict: string | null | undefined) {
  const clean = (verdict || "").trim();
  return clean || "NC";
}

export function verdictClass(value: string | null | undefined) {
  const rawValue = playerVerdict(value);
  if (rawValue === "A+") return "verdict-a-plus";
  const normalized = normalizeText(rawValue).replace(/[^a-z0-9]+/g, "-");
  return `verdict-${normalized || "nc"}`;
}

export function verdictPriority(value: string | null | undefined) {
  const rawValue = playerVerdict(value);
  if (rawValue === "A+") return 0;

  const normalized = normalizeText(rawValue);
  const order: Record<string, number> = {
    a: 1,
    fichar: 1,
    b: 2,
    duda: 2,
    c: 3,
    "seguir valorando": 3,
    "seguir viendo": 3,
    d: 4,
    descartar: 4,
    nc: 5,
    "sin consenso": 5,
    "sin informes": 6,
    "sin valoracion": 6,
  };

  return order[normalized] ?? 7;
}

export function buildConsensus(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const verdict = playerVerdict(value);
    if (verdict === "NC") continue;
    counts.set(verdict, (counts.get(verdict) || 0) + 1);
  }
  if (!counts.size) return "NC";
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return "NC";
  return sorted[0][0];
}

export function buildTeamLogoMap(objectiveMatches: ObjectivePlayerMatch[]) {
  const logos: TeamLogoMap = new Map();
  for (const match of objectiveMatches) {
    const player = match.objective_player;
    if (!player?.current_team_logo || !player.current_team_name) continue;
    const competition =
      competitionKey(player.domestic_competition_name) || competitionKey(player.objective_dataset);
    if (!competition) continue;
    logos.set(`${competition}|${canonicalTeamName(player.current_team_name, competition)}`, player.current_team_logo);
    if (match.objective_team) {
      logos.set(`${competition}|${canonicalTeamName(match.objective_team, competition)}`, player.current_team_logo);
    }
  }
  return logos;
}

