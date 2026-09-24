import { useEffect, useRef, useState } from "react";
import {
  Document as PdfDocument,
  Image as PdfImage,
  Page as PdfPage,
  PDFDownloadLink,
  StyleSheet as PdfStyleSheet,
  Text as PdfText,
  View as PdfView,
} from "@react-pdf/renderer";
import { supabase } from "../lib/supabase";
import type {
  PlayerSummary,
  ScoutingReport,
  Season,
  UserProfile,
  UScoutBoard,
  UScoutBoardSlot,
  UScoutShortlist,
  UScoutShortlistPlayer,
} from "../types";

type FormationSlot = {
  key: string;
  label: string;
  left: number;
  top: number;
};

type BoardCandidate = {
  birthYear: number | null;
  competition: string | null;
  id: string;
  name: string;
  playerId: string | null;
  position: string | null;
  shortlistPlayerId: string | null;
  sourceKind: "database" | "manual";
  team: string | null;
};

type PositionFamily = "goalkeeper" | "defender" | "midfielder" | "forward" | "unclassified";

const POSITION_FAMILIES: Array<{
  key: PositionFamily;
  label: string;
}> = [
  { key: "goalkeeper", label: "Porteros" },
  { key: "defender", label: "Defensas" },
  { key: "midfielder", label: "Centrocampistas" },
  { key: "forward", label: "Delanteros" },
  { key: "unclassified", label: "Sin clasificar" },
];

const SLOT_FAMILIES: Record<string, PositionFamily> = {
  GK: "goalkeeper",
  LB: "defender",
  LCB: "defender",
  RCB: "defender",
  RB: "defender",
  LDM: "midfielder",
  RDM: "midfielder",
  LCM: "midfielder",
  CM: "midfielder",
  RCM: "midfielder",
  LM: "midfielder",
  RM: "midfielder",
  CAM: "midfielder",
  LAM: "forward",
  RAM: "forward",
  LW: "forward",
  ST: "forward",
  RW: "forward",
  LST: "forward",
  RST: "forward",
};

function positionFamily(position: string | null): PositionFamily {
  const key = normalizeKey(position || "");
  if (!key) return "unclassified";
  if (/portero|guardameta|goalkeeper|\bpor\b/.test(key)) return "goalkeeper";
  if (/defensa|central|lateral|carrilero|\bdfc\b|\bld\b|\bli\b/.test(key)) return "defender";
  if (/centrocamp|mediocamp|pivote|interior|mediapunta|volante|\bmc\b|\bmp\b/.test(key)) return "midfielder";
  if (/delantero|extremo|punta|atacante|\bdc\b|\bed\b|\bei\b/.test(key)) return "forward";
  return "unclassified";
}

function baseSlotKey(slotKey: string) {
  return slotKey.split(":")[0];
}

const FORMATIONS: Record<string, FormationSlot[]> = {
  "4-3-3": [
    { key: "GK", label: "POR", left: 50, top: 89 },
    { key: "LB", label: "LI", left: 15, top: 70 },
    { key: "LCB", label: "DFC", left: 38, top: 74 },
    { key: "RCB", label: "DFC", left: 62, top: 74 },
    { key: "RB", label: "LD", left: 85, top: 70 },
    { key: "LCM", label: "MC", left: 25, top: 49 },
    { key: "CM", label: "MC", left: 50, top: 55 },
    { key: "RCM", label: "MC", left: 75, top: 49 },
    { key: "LW", label: "EI", left: 17, top: 24 },
    { key: "ST", label: "DC", left: 50, top: 15 },
    { key: "RW", label: "ED", left: 83, top: 24 },
  ],
  "4-2-3-1": [
    { key: "GK", label: "POR", left: 50, top: 89 },
    { key: "LB", label: "LI", left: 15, top: 70 },
    { key: "LCB", label: "DFC", left: 38, top: 74 },
    { key: "RCB", label: "DFC", left: 62, top: 74 },
    { key: "RB", label: "LD", left: 85, top: 70 },
    { key: "LDM", label: "MC", left: 35, top: 56 },
    { key: "RDM", label: "MC", left: 65, top: 56 },
    { key: "LAM", label: "EI", left: 20, top: 35 },
    { key: "CAM", label: "MP", left: 50, top: 38 },
    { key: "RAM", label: "ED", left: 80, top: 35 },
    { key: "ST", label: "DC", left: 50, top: 15 },
  ],
  "4-4-2": [
    { key: "GK", label: "POR", left: 50, top: 89 },
    { key: "LB", label: "LI", left: 15, top: 70 },
    { key: "LCB", label: "DFC", left: 38, top: 74 },
    { key: "RCB", label: "DFC", left: 62, top: 74 },
    { key: "RB", label: "LD", left: 85, top: 70 },
    { key: "LM", label: "MI", left: 16, top: 46 },
    { key: "LCM", label: "MC", left: 39, top: 51 },
    { key: "RCM", label: "MC", left: 61, top: 51 },
    { key: "RM", label: "MD", left: 84, top: 46 },
    { key: "LST", label: "DC", left: 36, top: 19 },
    { key: "RST", label: "DC", left: 64, top: 19 },
  ],
};

const USCOUT_PDF_ACCENT = "#e7d21a";
const USCOUT_PDF_BLACK = "#0a0a0a";
const USCOUT_PDF_MUTED = "#66665f";
const USCOUT_BADGE_SRC = "/escudo/unionistar.png";
const USCOUT_PDF_FAMILY_COLORS: Record<PositionFamily, string> = {
  goalkeeper: "#d4b800",
  defender: "#337ee8",
  midfielder: "#16883b",
  forward: "#e46521",
  unclassified: "#777770",
};

const uscoutPdfStyles = PdfStyleSheet.create({
  page: { backgroundColor: "#f6f6f2", color: USCOUT_PDF_BLACK, fontFamily: "Helvetica", padding: "78 34 42" },
  cover: { alignItems: "center", backgroundColor: "#f6f6f2", color: USCOUT_PDF_BLACK, display: "flex", fontFamily: "Helvetica", justifyContent: "center", padding: 44, position: "relative" },
  coverStrip: { backgroundColor: USCOUT_PDF_BLACK, bottom: 0, left: 0, position: "absolute", top: 0, width: 42 },
  coverAccent: { backgroundColor: USCOUT_PDF_ACCENT, bottom: 0, left: 42, position: "absolute", top: 0, width: 5 },
  coverLogo: { height: 82, position: "absolute", right: 46, top: 40, width: 82 },
  coverWatermark: { height: 250, opacity: 0.045, position: "absolute", width: 250 },
  coverKicker: { color: "#887a00", fontSize: 11, fontWeight: 700, letterSpacing: 2.2, marginBottom: 14, textTransform: "uppercase" },
  coverTitle: { fontSize: 33, fontWeight: 900, marginBottom: 14, textAlign: "center", textTransform: "uppercase" },
  coverSubtitle: { color: USCOUT_PDF_MUTED, fontSize: 17, fontWeight: 700, marginBottom: 7, textAlign: "center" },
  coverMeta: { color: USCOUT_PDF_MUTED, fontSize: 10, marginTop: 20 },
  header: { alignItems: "center", backgroundColor: USCOUT_PDF_BLACK, borderRadius: 12, display: "flex", flexDirection: "row", height: 48, justifyContent: "space-between", left: 34, padding: "8 12", position: "absolute", right: 34, top: 20 },
  headerTitle: { color: "#ffffff", fontSize: 13, fontWeight: 900 },
  headerSubtitle: { color: USCOUT_PDF_ACCENT, fontSize: 7.5, fontWeight: 700, marginTop: 2 },
  headerRight: { alignItems: "center", display: "flex", flexDirection: "row", gap: 8 },
  headerDate: { color: USCOUT_PDF_ACCENT, fontSize: 7.5, fontWeight: 700 },
  headerLogo: { height: 29, width: 29 },
  footer: { bottom: 17, color: USCOUT_PDF_MUTED, fontSize: 7, left: 34, position: "absolute" },
  pageNumber: { bottom: 17, color: USCOUT_PDF_MUTED, fontSize: 7, position: "absolute", right: 34 },
  titleBar: { alignItems: "center", backgroundColor: USCOUT_PDF_BLACK, borderRadius: 9, display: "flex", flexDirection: "row", justifyContent: "space-between", marginBottom: 10, padding: "9 11" },
  titleBarText: { color: "#ffffff", fontSize: 14, fontWeight: 900 },
  titleBarCount: { color: USCOUT_PDF_ACCENT, fontSize: 10, fontWeight: 900 },
  family: { backgroundColor: "#ffffff", borderRadius: 9, marginBottom: 8, overflow: "hidden" },
  familyHead: { alignItems: "center", display: "flex", flexDirection: "row", justifyContent: "space-between", padding: "6 8" },
  familyTitle: { color: "#ffffff", fontSize: 9, fontWeight: 900 },
  familyCount: { color: "#ffffff", fontSize: 8, fontWeight: 900 },
  shortlistRow: { alignItems: "center", borderTopColor: "#e8e8e3", borderTopWidth: 0.7, display: "flex", flexDirection: "row", minHeight: 30, padding: "5 7" },
  shortlistIdentity: { width: "30%" },
  shortlistName: { fontSize: 8.5, fontWeight: 900 },
  shortlistTeam: { color: USCOUT_PDF_MUTED, fontSize: 6.5, marginTop: 1.5 },
  shortlistCell: { color: USCOUT_PDF_MUTED, fontSize: 6.7, paddingRight: 5, width: "13%" },
  shortlistState: { fontSize: 6.7, fontWeight: 700, paddingRight: 5, width: "14%" },
  shortlistNotes: { color: USCOUT_PDF_MUTED, fontSize: 6.2, width: "30%" },
  pitch: { backgroundColor: "#187d3d", borderColor: "#9bc5a8", borderRadius: 18, borderWidth: 2, height: 650, marginTop: 2, overflow: "hidden", position: "relative", width: "100%" },
  pitchStripe: { bottom: 0, position: "absolute", top: 0, width: "12.5%" },
  halfway: { backgroundColor: "rgba(255,255,255,0.65)", height: 1.3, left: 0, position: "absolute", right: 0, top: "50%" },
  centerCircle: { borderColor: "rgba(255,255,255,0.65)", borderRadius: 46, borderWidth: 1.3, height: 92, left: "41%", position: "absolute", top: "43%", width: 92 },
  penaltyTop: { borderBottomColor: "rgba(255,255,255,0.65)", borderBottomWidth: 1.3, borderLeftColor: "rgba(255,255,255,0.65)", borderLeftWidth: 1.3, borderRightColor: "rgba(255,255,255,0.65)", borderRightWidth: 1.3, height: 78, left: "27%", position: "absolute", top: 0, width: "46%" },
  penaltyBottom: { borderLeftColor: "rgba(255,255,255,0.65)", borderLeftWidth: 1.3, borderRightColor: "rgba(255,255,255,0.65)", borderRightWidth: 1.3, borderTopColor: "rgba(255,255,255,0.65)", borderTopWidth: 1.3, bottom: 0, height: 78, left: "27%", position: "absolute", width: "46%" },
  slot: { alignItems: "center", position: "absolute", width: 105 },
  slotLabel: { backgroundColor: USCOUT_PDF_ACCENT, borderRadius: 7, color: USCOUT_PDF_BLACK, fontSize: 6.2, fontWeight: 900, marginBottom: 2, padding: "2 4" },
  slotPlayer: { backgroundColor: "rgba(255,255,255,0.96)", borderColor: "#111111", borderRadius: 5, borderWidth: 0.8, marginBottom: 2, padding: "3 4", width: "100%" },
  slotPlayerName: { fontSize: 6.2, fontWeight: 900, textAlign: "center" },
  slotPlayerMeta: { color: USCOUT_PDF_MUTED, fontSize: 4.9, marginTop: 1, textAlign: "center" },
  emptyBoard: { color: "#ffffff", fontSize: 11, fontWeight: 700, marginTop: 300, textAlign: "center" },
});

const STATUS_LABELS: Record<UScoutShortlistPlayer["status"], string> = {
  pendiente: "Pendiente",
  proximo: "Próximo a ver",
  visto: "Visto",
  descartado: "Descartado",
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ageFromBirthYear(birthYear: number | null) {
  return birthYear ? `${new Date().getFullYear() - birthYear} años` : "Edad no disponible";
}

function filterValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
    .sort((left, right) => left.localeCompare(right, "es"));
}

function isMissingUSCoutSchema(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("uscout_") && (
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find")
  );
}

function UScoutPdfCover({ printedAt, scoutName, title }: { printedAt: string; scoutName: string; title: string }) {
  return (
    <PdfPage orientation="portrait" size="A4" style={uscoutPdfStyles.cover}>
      <PdfView style={uscoutPdfStyles.coverStrip} />
      <PdfView style={uscoutPdfStyles.coverAccent} />
      <PdfImage src={USCOUT_BADGE_SRC} style={uscoutPdfStyles.coverLogo} />
      <PdfImage src={USCOUT_BADGE_SRC} style={uscoutPdfStyles.coverWatermark} />
      <PdfText style={uscoutPdfStyles.coverKicker}>Informe Área de Scouting</PdfText>
      <PdfText style={uscoutPdfStyles.coverTitle}>{title}</PdfText>
      <PdfText style={uscoutPdfStyles.coverSubtitle}>{scoutName}</PdfText>
      <PdfText style={uscoutPdfStyles.coverSubtitle}>Secretaría Técnica USCF</PdfText>
      <PdfText style={uscoutPdfStyles.coverMeta}>Fecha de impresión: {printedAt}</PdfText>
    </PdfPage>
  );
}

function UScoutPdfHeader({ printedAt, scoutName, title }: { printedAt: string; scoutName: string; title: string }) {
  return (
    <PdfView fixed style={uscoutPdfStyles.header}>
      <PdfView>
        <PdfText style={uscoutPdfStyles.headerTitle}>{title}</PdfText>
        <PdfText style={uscoutPdfStyles.headerSubtitle}>{scoutName} · Secretaría Técnica USCF</PdfText>
      </PdfView>
      <PdfView style={uscoutPdfStyles.headerRight}>
        <PdfText style={uscoutPdfStyles.headerDate}>{printedAt}</PdfText>
        <PdfImage src={USCOUT_BADGE_SRC} style={uscoutPdfStyles.headerLogo} />
      </PdfView>
    </PdfView>
  );
}

function UScoutPdfFooter() {
  return (
    <>
      <PdfText fixed style={uscoutPdfStyles.footer}>Unionistas de Salamanca CF · Área de Scouting</PdfText>
      <PdfText fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} style={uscoutPdfStyles.pageNumber} />
    </>
  );
}

function UScoutShortlistPdf({
  players,
  printedAt,
  scoutName,
}: {
  players: UScoutShortlistPlayer[];
  printedAt: string;
  scoutName: string;
}) {
  return (
    <PdfDocument title={`Short List Personal · ${scoutName}`}>
      <UScoutPdfCover printedAt={printedAt} scoutName={scoutName} title="Short List Personal" />
      <PdfPage orientation="portrait" size="A4" style={uscoutPdfStyles.page} wrap>
        <UScoutPdfHeader printedAt={printedAt} scoutName={scoutName} title="Short List Personal" />
        <PdfView style={uscoutPdfStyles.titleBar}>
          <PdfText style={uscoutPdfStyles.titleBarText}>Listado personal</PdfText>
          <PdfText style={uscoutPdfStyles.titleBarCount}>{players.length} jugadores</PdfText>
        </PdfView>
        {POSITION_FAMILIES.map((family) => {
          const familyPlayers = players.filter((player) => positionFamily(player.position) === family.key);
          if (!familyPlayers.length) return null;
          return (
            <PdfView key={family.key} style={uscoutPdfStyles.family}>
              <PdfView style={[uscoutPdfStyles.familyHead, { backgroundColor: USCOUT_PDF_FAMILY_COLORS[family.key] }]} wrap={false}>
                <PdfText style={uscoutPdfStyles.familyTitle}>{family.label}</PdfText>
                <PdfText style={uscoutPdfStyles.familyCount}>{familyPlayers.length}</PdfText>
              </PdfView>
              {familyPlayers.map((player) => (
                <PdfView key={player.id} style={uscoutPdfStyles.shortlistRow} wrap={false}>
                  <PdfView style={uscoutPdfStyles.shortlistIdentity}>
                    <PdfText style={uscoutPdfStyles.shortlistName}>{player.player_name}</PdfText>
                    <PdfText style={uscoutPdfStyles.shortlistTeam}>{player.team_name || "Sin equipo"} · {player.birth_year || "Año n/d"}</PdfText>
                  </PdfView>
                  <PdfText style={uscoutPdfStyles.shortlistCell}>{player.position || "Sin posición"}</PdfText>
                  <PdfText style={uscoutPdfStyles.shortlistCell}>{player.reports_count} informes</PdfText>
                  <PdfText style={uscoutPdfStyles.shortlistState}>{STATUS_LABELS[player.status]} · {player.priority}</PdfText>
                  <PdfText style={uscoutPdfStyles.shortlistNotes}>{player.notes || "Sin notas"}</PdfText>
                </PdfView>
              ))}
            </PdfView>
          );
        })}
        <UScoutPdfFooter />
      </PdfPage>
    </PdfDocument>
  );
}

function UScoutBoardsPdf({
  boards,
  printedAt,
  scoutName,
  slots,
}: {
  boards: UScoutBoard[];
  printedAt: string;
  scoutName: string;
  slots: UScoutBoardSlot[];
}) {
  const pitchWidth = 527;
  const pitchHeight = 650;
  const slotWidth = 105;
  return (
    <PdfDocument title={`Campogramas · ${scoutName}`}>
      <UScoutPdfCover printedAt={printedAt} scoutName={scoutName} title="Campogramas" />
      {boards.map((selectedBoard) => {
        const formationSlots = FORMATIONS[selectedBoard.formation] || FORMATIONS["4-3-3"];
        const selectedSlots = slots.filter((slot) => slot.board_id === selectedBoard.id);
        return (
          <PdfPage key={selectedBoard.id} orientation="portrait" size="A4" style={uscoutPdfStyles.page}>
            <UScoutPdfHeader printedAt={printedAt} scoutName={scoutName} title="Campogramas" />
            <PdfView style={uscoutPdfStyles.titleBar}>
              <PdfText style={uscoutPdfStyles.titleBarText}>{selectedBoard.name}</PdfText>
              <PdfText style={uscoutPdfStyles.titleBarCount}>{selectedBoard.formation} · {selectedSlots.length} jugadores</PdfText>
            </PdfView>
            <PdfView style={uscoutPdfStyles.pitch}>
              {Array.from({ length: 8 }, (_, index) => (
                <PdfView key={index} style={[uscoutPdfStyles.pitchStripe, { backgroundColor: index % 2 ? "#197f40" : "#16783a", left: `${index * 12.5}%` }]} />
              ))}
              <PdfView style={uscoutPdfStyles.halfway} />
              <PdfView style={uscoutPdfStyles.centerCircle} />
              <PdfView style={uscoutPdfStyles.penaltyTop} />
              <PdfView style={uscoutPdfStyles.penaltyBottom} />
              {formationSlots.map((formationSlot) => {
                const assignedPlayers = selectedSlots
                  .filter((slot) => baseSlotKey(slot.slot_key) === formationSlot.key)
                  .sort((left, right) => left.slot_key.localeCompare(right.slot_key));
                const left = Math.max(0, Math.min(pitchWidth - slotWidth, (formationSlot.left / 100) * pitchWidth - slotWidth / 2));
                const top = Math.max(5, Math.min(pitchHeight - 76, (formationSlot.top / 100) * pitchHeight - 22));
                return (
                  <PdfView key={formationSlot.key} style={[uscoutPdfStyles.slot, { left, top }]}>
                    <PdfText style={uscoutPdfStyles.slotLabel}>{formationSlot.label}</PdfText>
                    {assignedPlayers.map((player) => (
                      <PdfView key={player.id} style={uscoutPdfStyles.slotPlayer}>
                        <PdfText style={uscoutPdfStyles.slotPlayerName}>{player.player_name}</PdfText>
                        <PdfText style={uscoutPdfStyles.slotPlayerMeta}>{player.team_name || "Sin equipo"} · {player.birth_year || "Año n/d"}</PdfText>
                      </PdfView>
                    ))}
                  </PdfView>
                );
              })}
              {!selectedSlots.length ? <PdfText style={uscoutPdfStyles.emptyBoard}>Campograma sin jugadores</PdfText> : null}
            </PdfView>
            <UScoutPdfFooter />
          </PdfPage>
        );
      })}
    </PdfDocument>
  );
}

export function UScoutView({
  players,
  profile,
  reports,
  season,
}: {
  players: PlayerSummary[];
  profile: UserProfile;
  reports: ScoutingReport[];
  season: Season;
}) {
  const isStaff = profile.role === "admin" || profile.role === "coordinator";
  const [owners, setOwners] = useState<UserProfile[]>(profile.role === "scout" ? [profile] : []);
  const [selectedOwnerId, setSelectedOwnerId] = useState(profile.role === "scout" ? profile.id : "");
  const [shortlist, setShortlist] = useState<UScoutShortlist | null>(null);
  const [shortlistPlayers, setShortlistPlayers] = useState<UScoutShortlistPlayer[]>([]);
  const [boards, setBoards] = useState<UScoutBoard[]>([]);
  const [board, setBoard] = useState<UScoutBoard | null>(null);
  const [boardSlots, setBoardSlots] = useState<UScoutBoardSlot[]>([]);
  const [allBoardSlots, setAllBoardSlots] = useState<UScoutBoardSlot[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [printBoardIds, setPrintBoardIds] = useState<string[]>([]);
  const [newBoardName, setNewBoardName] = useState("");
  const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerTeamFilter, setPlayerTeamFilter] = useState("");
  const [playerPositionFilter, setPlayerPositionFilter] = useState("");
  const [playerCompetitionFilter, setPlayerCompetitionFilter] = useState("");
  const [selectedPlayerKey, setSelectedPlayerKey] = useState("");
  const [shortlistViewSearch, setShortlistViewSearch] = useState("");
  const [shortlistViewPosition, setShortlistViewPosition] = useState("");
  const [boardPlayerSearch, setBoardPlayerSearch] = useState("");
  const [boardTeamFilter, setBoardTeamFilter] = useState("");
  const [boardPositionFilter, setBoardPositionFilter] = useState("");
  const [boardCompetitionFilter, setBoardCompetitionFilter] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);
  const workspaceKeyRef = useRef("");
  const [manualPlayer, setManualPlayer] = useState({
    birthYear: "",
    competition: "",
    name: "",
    notes: "",
    position: "",
    team: "",
  });

  const canEdit = selectedOwnerId === profile.id || profile.role === "admin";
  const selectedOwner = owners.find((owner) => owner.id === selectedOwnerId) || profile;

  const latestReportByPlayer = new Map<string, ScoutingReport>();
  for (const report of reports) {
    const key = normalizeKey(report.player_name);
    const current = latestReportByPlayer.get(key);
    if (!current || new Date(report.report_date || 0) > new Date(current.report_date || 0)) {
      latestReportByPlayer.set(key, report);
    }
  }
  const shortlistKeys = new Set(shortlistPlayers.map((player) => player.normalized_player_name));
  const normalizedSearch = normalizeKey(playerSearch);
  const competitionOptions = filterValues(players.map((player) => player.competition));
  const playersByCompetition = players.filter(
    (player) => !playerCompetitionFilter || player.competition === playerCompetitionFilter,
  );
  const teamOptions = filterValues(playersByCompetition.map((player) => player.team_name));
  const playersByTeam = playersByCompetition.filter(
    (player) => !playerTeamFilter || player.team_name === playerTeamFilter,
  );
  const positionOptions = filterValues(playersByTeam.map((player) => player.position));
  const hasPlayerFilters = Boolean(
    normalizedSearch || playerTeamFilter || playerPositionFilter || playerCompetitionFilter,
  );
  const candidatePlayers = players
    .filter((player) => !shortlistKeys.has(normalizeKey(player.player_name)))
    .filter((player) => {
      const matchesSearch = !normalizedSearch || normalizeKey(
        `${player.player_name} ${player.team_name || ""} ${player.position || ""}`,
      ).includes(normalizedSearch);
      return matchesSearch
        && (!playerTeamFilter || player.team_name === playerTeamFilter)
        && (!playerPositionFilter || player.position === playerPositionFilter)
        && (!playerCompetitionFilter || player.competition === playerCompetitionFilter);
    })
    .slice(0, 50);
  const selectedCandidate = candidatePlayers.find(
    (player) => `${player.player_id || normalizeKey(player.player_name)}:${player.birth_year || 0}` === selectedPlayerKey,
  );

  const filteredShortlistPlayers = shortlistPlayers.filter((player) => {
    const matchesSearch = !normalizeKey(shortlistViewSearch)
      || normalizeKey(`${player.player_name} ${player.team_name || ""}`).includes(normalizeKey(shortlistViewSearch));
    return matchesSearch && (!shortlistViewPosition || positionFamily(player.position) === shortlistViewPosition);
  });

  const boardCandidates: BoardCandidate[] = [
    ...shortlistPlayers.map((player) => ({
      birthYear: player.birth_year,
      competition: player.competition,
      id: `shortlist:${player.id}`,
      name: player.player_name,
      playerId: player.player_id,
      position: player.position,
      shortlistPlayerId: player.id,
      sourceKind: player.source_kind,
      team: player.team_name,
    })),
    ...players
      .filter((player) => !shortlistKeys.has(normalizeKey(player.player_name)))
      .map((player) => ({
          birthYear: player.birth_year,
          competition: player.competition,
          id: `database:${player.player_id || normalizeKey(player.player_name)}:${player.birth_year || 0}`,
          name: player.player_name,
          playerId: player.player_id,
          position: player.position,
          shortlistPlayerId: null,
          sourceKind: "database" as const,
          team: player.team_name,
        })),
  ];
  const activeSlotFamily = activeSlotKey ? SLOT_FAMILIES[activeSlotKey] : null;
  const filteredBoardCandidates = boardCandidates.filter((candidate) => {
    const matchesSearch = !normalizeKey(boardPlayerSearch)
      || normalizeKey(`${candidate.name} ${candidate.team || ""} ${candidate.position || ""}`)
        .includes(normalizeKey(boardPlayerSearch));
    return matchesSearch
      && (!activeSlotFamily || positionFamily(candidate.position) === activeSlotFamily)
      && (!boardTeamFilter || candidate.team === boardTeamFilter)
      && (!boardPositionFilter || candidate.position === boardPositionFilter)
      && (!boardCompetitionFilter || candidate.competition === boardCompetitionFilter);
  });
  const boardCompetitionOptions = filterValues(boardCandidates.map((candidate) => candidate.competition));
  const boardTeamOptions = filterValues(
    boardCandidates
      .filter((candidate) => !boardCompetitionFilter || candidate.competition === boardCompetitionFilter)
      .map((candidate) => candidate.team),
  );
  const boardPositionOptions = filterValues(
    boardCandidates
      .filter((candidate) => !boardCompetitionFilter || candidate.competition === boardCompetitionFilter)
      .filter((candidate) => !boardTeamFilter || candidate.team === boardTeamFilter)
      .map((candidate) => candidate.position),
  );

  useEffect(() => {
    if (!isStaff) return;
    let ignore = false;
    async function loadOwners() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,scout_name,role,active")
        .eq("active", true)
        .eq("role", "scout")
        .order("full_name", { ascending: true });
      if (ignore) return;
      if (error) {
        setMessage({ tone: "error", text: `No se pudieron cargar los scouts: ${error.message}` });
        return;
      }
      const availableOwners = (data || []) as UserProfile[];
      setOwners(availableOwners);
      setSelectedOwnerId((current) => current || availableOwners[0]?.id || "");
    }
    loadOwners();
    return () => {
      ignore = true;
    };
  }, [isStaff]);

  useEffect(() => {
    const availableIds = new Set(boards.map((item) => item.id));
    setPrintBoardIds((current) => {
      const retained = current.filter((id) => availableIds.has(id));
      return retained.length ? retained : boards.map((item) => item.id);
    });
  }, [boards]);

  useEffect(() => {
    if (!selectedOwnerId) {
      setIsLoading(false);
      return;
    }
    let ignore = false;
    async function loadWorkspace() {
      const nextWorkspaceKey = `${season.id}:${selectedOwnerId}`;
      if (workspaceKeyRef.current !== nextWorkspaceKey) {
        workspaceKeyRef.current = nextWorkspaceKey;
        setIsLoading(true);
      }
      setMessage(null);
      const [shortlistResult, boardsResult] = await Promise.all([
        supabase
          .from("uscout_shortlists")
          .select("*")
          .eq("season_id", season.id)
          .eq("owner_id", selectedOwnerId)
          .eq("name", "Shortlist principal")
          .maybeSingle(),
        supabase
          .from("uscout_boards")
          .select("*")
          .eq("season_id", season.id)
          .eq("owner_id", selectedOwnerId)
          .order("created_at", { ascending: true }),
      ]);
      if (ignore) return;
      const firstError = shortlistResult.error || boardsResult.error;
      if (firstError) {
        setSchemaMissing(isMissingUSCoutSchema(firstError.message));
        setMessage({ tone: "error", text: firstError.message });
        setIsLoading(false);
        return;
      }
      setSchemaMissing(false);
      const loadedShortlist = shortlistResult.data as UScoutShortlist | null;
      const loadedBoards = (boardsResult.data || []) as UScoutBoard[];
      const loadedBoard = loadedBoards.find((item) => item.id === selectedBoardId) || loadedBoards[0] || null;
      setShortlist(loadedShortlist);
      setBoards(loadedBoards);
      setBoard(loadedBoard);
      setSelectedBoardId(loadedBoard?.id || "");
      setActiveSlotKey(null);

      const [playersResult, slotsResult, allSlotsResult] = await Promise.all([
        loadedShortlist
          ? supabase
              .from("uscout_shortlist_players")
              .select("*")
              .eq("shortlist_id", loadedShortlist.id)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        loadedBoard
          ? supabase
              .from("uscout_board_slots")
              .select("*")
              .eq("board_id", loadedBoard.id)
          : Promise.resolve({ data: [], error: null }),
        loadedBoards.length
          ? supabase
              .from("uscout_board_slots")
              .select("*")
              .in("board_id", loadedBoards.map((item) => item.id))
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (ignore) return;
      const childError = playersResult.error || slotsResult.error || allSlotsResult.error;
      if (childError) {
        setMessage({ tone: "error", text: childError.message });
      } else {
        setShortlistPlayers((playersResult.data || []) as UScoutShortlistPlayer[]);
        setBoardSlots((slotsResult.data || []) as UScoutBoardSlot[]);
        setAllBoardSlots((allSlotsResult.data || []) as UScoutBoardSlot[]);
      }
      setIsLoading(false);
    }
    loadWorkspace();
    return () => {
      ignore = true;
    };
  }, [season.id, selectedBoardId, selectedOwnerId]);

  async function ensureShortlist() {
    if (shortlist) return shortlist;
    const { data, error } = await supabase
      .from("uscout_shortlists")
      .insert({ name: "Shortlist principal", owner_id: selectedOwnerId, season_id: season.id })
      .select("*")
      .single();
    if (error) throw error;
    const created = data as UScoutShortlist;
    setShortlist(created);
    return created;
  }

  async function ensureBoard(createNew = false) {
    if (board && !createNew) return board;
    if (boards.length >= 6) throw new Error("Cada scout puede tener un máximo de 6 campogramas.");
    const requestedName = newBoardName.trim();
    const fallbackName = `Campograma ${boards.length + 1}`;
    const { data, error } = await supabase
      .from("uscout_boards")
      .insert({ formation: "4-3-3", name: requestedName || fallbackName, owner_id: selectedOwnerId, season_id: season.id })
      .select("*")
      .single();
    if (error) throw error;
    const created = data as UScoutBoard;
    setBoards((current) => [...current, created]);
    setBoard(created);
    setSelectedBoardId(created.id);
    setPrintBoardIds((current) => [...current, created.id]);
    setNewBoardName("");
    return created;
  }

  async function createBoard() {
    if (boards.length >= 6) {
      setMessage({ tone: "error", text: "Ya se ha alcanzado el máximo de 6 campogramas para este scout." });
      return;
    }
    try {
      const created = await ensureBoard(true);
      setBoardSlots([]);
      setMessage({ tone: "ok", text: `${created.name} creado correctamente.` });
    } catch (error) {
      setMessage({ tone: "error", text: `No se pudo crear el campograma: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  async function deleteBoard() {
    if (!board) return;
    if (!window.confirm(`¿Eliminar ${board.name}? Esta acción retirará también su alineación.`)) return;
    const { error } = await supabase.from("uscout_boards").delete().eq("id", board.id);
    if (error) {
      setMessage({ tone: "error", text: `No se pudo eliminar el campograma: ${error.message}` });
      return;
    }
    const remaining = boards.filter((item) => item.id !== board.id);
    setBoards(remaining);
    setBoard(remaining[0] || null);
    setSelectedBoardId(remaining[0]?.id || "");
    setBoardSlots([]);
    setAllBoardSlots((current) => current.filter((slot) => slot.board_id !== board.id));
    setPrintBoardIds((current) => current.filter((id) => id !== board.id));
    setMessage({ tone: "ok", text: "Campograma eliminado." });
  }

  async function addExistingPlayer(player: PlayerSummary) {
    const positionKey = positionFamily(player.position);
    const playersInPosition = shortlistPlayers.filter(
      (item) => positionFamily(item.position) === positionKey,
    ).length;
    if (playersInPosition >= 6) {
      setMessage({
        tone: "error",
        text: `Ya hay 6 jugadores en la familia ${POSITION_FAMILIES.find((item) => item.key === positionKey)?.label || "sin clasificar"}. Retira uno antes de añadir otro.`,
      });
      return;
    }
    try {
      setMessage(null);
      const targetShortlist = await ensureShortlist();
      const { data, error } = await supabase
        .from("uscout_shortlist_players")
        .insert({
          birth_year: player.birth_year,
          competition: player.competition,
          normalized_player_name: normalizeKey(player.player_name),
          player_id: player.player_id,
          player_name: player.player_name,
          position: player.position,
          reports_count: player.reports_count,
          shortlist_id: targetShortlist.id,
          source_kind: "database",
          team_name: player.team_name,
          verdict: player.verdict,
        })
        .select("*")
        .single();
      if (error) throw error;
      setShortlistPlayers((current) => [data as UScoutShortlistPlayer, ...current]);
      setPlayerSearch("");
      setSelectedPlayerKey("");
      setMessage({ tone: "ok", text: `${player.player_name} añadido a la shortlist.` });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage({
        tone: "error",
        text: text.includes("uq_uscout_shortlist_player_identity")
          ? "El jugador ya está incluido en esta shortlist."
          : `No se pudo añadir el jugador: ${text}`,
      });
    }
  }

  async function addManualPlayer() {
    if (!manualPlayer.name.trim()) {
      setMessage({ tone: "error", text: "El nombre del jugador es obligatorio." });
      return;
    }
    const positionKey = positionFamily(manualPlayer.position);
    const playersInPosition = shortlistPlayers.filter(
      (item) => positionFamily(item.position) === positionKey,
    ).length;
    if (playersInPosition >= 6) {
      setMessage({
        tone: "error",
        text: `Ya hay 6 jugadores en ${POSITION_FAMILIES.find((item) => item.key === positionKey)?.label || "esta familia"}.`,
      });
      return;
    }
    try {
      const targetShortlist = await ensureShortlist();
      const { data, error } = await supabase
        .from("uscout_shortlist_players")
        .insert({
          birth_year: manualPlayer.birthYear ? Number(manualPlayer.birthYear) : null,
          competition: manualPlayer.competition.trim() || null,
          normalized_player_name: normalizeKey(manualPlayer.name),
          notes: manualPlayer.notes.trim() || null,
          player_name: manualPlayer.name.trim(),
          position: manualPlayer.position.trim() || null,
          shortlist_id: targetShortlist.id,
          source_kind: "manual",
          team_name: manualPlayer.team.trim() || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      setShortlistPlayers((current) => [data as UScoutShortlistPlayer, ...current]);
      setManualPlayer({ birthYear: "", competition: "", name: "", notes: "", position: "", team: "" });
      setShowManualForm(false);
      setMessage({ tone: "ok", text: "Jugador manual añadido a la shortlist." });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage({ tone: "error", text: `No se pudo crear el jugador: ${text}` });
    }
  }

  async function updateShortlistPlayer(
    playerId: string,
    patch: Partial<Pick<UScoutShortlistPlayer, "notes" | "priority" | "status">>,
  ) {
    const previous = shortlistPlayers;
    setShortlistPlayers((current) =>
      current.map((player) => (player.id === playerId ? { ...player, ...patch } : player)),
    );
    const { error } = await supabase
      .from("uscout_shortlist_players")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", playerId);
    if (error) {
      setShortlistPlayers(previous);
      setMessage({ tone: "error", text: `No se pudo guardar el cambio: ${error.message}` });
    }
  }

  async function removeShortlistPlayer(player: UScoutShortlistPlayer) {
    const { error } = await supabase.from("uscout_shortlist_players").delete().eq("id", player.id);
    if (error) {
      setMessage({ tone: "error", text: `No se pudo retirar el jugador: ${error.message}` });
      return;
    }
    setShortlistPlayers((current) => current.filter((item) => item.id !== player.id));
    setMessage({
      tone: "ok",
      text: `${player.player_name} retirado de la shortlist. Si estaba en el equipo ideal, se mantiene allí como selección independiente.`,
    });
  }

  async function changeFormation(nextFormation: string) {
    try {
      const targetBoard = await ensureBoard();
      const nextSlots = FORMATIONS[nextFormation];
      const assignedPlayers = [...boardSlots].sort((left, right) => left.slot_key.localeCompare(right.slot_key));
      const { error: deleteError } = await supabase
        .from("uscout_board_slots")
        .delete()
        .eq("board_id", targetBoard.id);
      if (deleteError) throw deleteError;
      const { error: boardError } = await supabase
        .from("uscout_boards")
        .update({ formation: nextFormation, updated_at: new Date().toISOString() })
        .eq("id", targetBoard.id);
      if (boardError) throw boardError;
      const familyCounts = new Map<PositionFamily, number>();
      const replacements = assignedPlayers.flatMap((slot) => {
        const family = positionFamily(slot.position);
        const compatibleSlots = nextSlots.filter((nextSlot) => SLOT_FAMILIES[nextSlot.key] === family);
        const familyIndex = familyCounts.get(family) || 0;
        const targetSlot = compatibleSlots[Math.floor(familyIndex / 3)];
        if (!targetSlot) return [];
        familyCounts.set(family, familyIndex + 1);
        return [{
          birth_year: slot.birth_year,
          board_id: targetBoard.id,
          normalized_player_name: slot.normalized_player_name,
          player_id: slot.player_id,
          player_name: slot.player_name,
          position: slot.position,
          shortlist_player_id: slot.shortlist_player_id,
          slot_key: `${targetSlot.key}:${familyIndex % 3}`,
          source_kind: slot.source_kind,
          team_name: slot.team_name,
        }];
      });
      let savedSlots: UScoutBoardSlot[] = [];
      if (replacements.length) {
        const { data, error } = await supabase
          .from("uscout_board_slots")
          .insert(replacements)
          .select("*");
        if (error) throw error;
        savedSlots = (data || []) as UScoutBoardSlot[];
      }
      setBoard({ ...targetBoard, formation: nextFormation });
      setBoardSlots(savedSlots);
      setAllBoardSlots((current) => [
        ...current.filter((slot) => slot.board_id !== targetBoard.id),
        ...savedSlots,
      ]);
      setMessage({ tone: "ok", text: "Formación actualizada y composición reorganizada." });
    } catch (error) {
      setMessage({ tone: "error", text: `No se pudo cambiar la formación: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  async function assignPlayer(slotKey: string, candidateId: string) {
    try {
      const targetBoard = await ensureBoard();
      const candidate = boardCandidates.find((item) => item.id === candidateId);
      if (!candidate) return;
      const family = SLOT_FAMILIES[slotKey];
      if (positionFamily(candidate.position) !== family) {
        throw new Error("El jugador no pertenece a la familia compatible con este puesto.");
      }
      const assignedToPosition = boardSlots.filter((slot) => baseSlotKey(slot.slot_key) === slotKey);
      if (assignedToPosition.length >= 3) {
        throw new Error("Este puesto ya tiene el máximo de 3 jugadores.");
      }
      const usedIndexes = new Set(
        assignedToPosition.map((slot) => Number(slot.slot_key.split(":")[1] || 0)),
      );
      const nextIndex = [0, 1, 2].find((index) => !usedIndexes.has(index));
      if (nextIndex === undefined) throw new Error("No hay huecos disponibles en este puesto.");
      const payload = {
        birth_year: candidate.birthYear,
        board_id: targetBoard.id,
        normalized_player_name: normalizeKey(candidate.name),
        player_id: candidate.playerId,
        player_name: candidate.name,
        position: candidate.position,
        shortlist_player_id: candidate.shortlistPlayerId,
        slot_key: `${slotKey}:${nextIndex}`,
        source_kind: candidate.sourceKind,
        team_name: candidate.team,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("uscout_board_slots")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      const savedSlot = data as UScoutBoardSlot;
      setBoardSlots((current) => [...current, savedSlot]);
      setAllBoardSlots((current) => [...current, savedSlot]);
      setActiveSlotKey(null);
      setBoardPlayerSearch("");
    } catch (error) {
      setMessage({ tone: "error", text: `No se pudo guardar el equipo: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  async function removeBoardPlayer(slot: UScoutBoardSlot) {
    const { error } = await supabase.from("uscout_board_slots").delete().eq("id", slot.id);
    if (error) {
      setMessage({ tone: "error", text: `No se pudo retirar el jugador: ${error.message}` });
      return;
    }
    setBoardSlots((current) => current.filter((item) => item.id !== slot.id));
    setAllBoardSlots((current) => current.filter((item) => item.id !== slot.id));
  }

  if (schemaMissing) {
    return (
      <section className="content-card uscout-setup-card">
        <span>Configuración pendiente</span>
        <h2>UScout está preparado en local</h2>
        <p>
          Para activar el guardado hay que ejecutar en Supabase la migración
          <strong> 009_uscout_workspace.sql</strong>. No modifica los datos existentes.
        </p>
      </section>
    );
  }

  const formation = board?.formation || "4-3-3";
  const formationSlots = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  const usedPlayerNames = new Set(boardSlots.map((slot) => slot.normalized_player_name));
  const activeFormationSlot = formationSlots.find((slot) => slot.key === activeSlotKey);
  const activeAssignedSlots = boardSlots.filter((slot) => baseSlotKey(slot.slot_key) === activeSlotKey);
  const printedAt = new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(new Date());
  const scoutName = selectedOwner.full_name || selectedOwner.scout_name || selectedOwner.email;
  const selectedPrintBoards = boards.filter((item) => printBoardIds.includes(item.id));
  const pdfDateKey = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  return (
    <section className="uscout-view">
      <header className="uscout-hero">
        <div>
          <span>Espacio personal de scouting</span>
          <h2>UScout</h2>
          <p>Shortlist y equipo ideal de {selectedOwner.full_name || selectedOwner.scout_name || "scout"}.</p>
        </div>
        <div className="uscout-hero__meta">
          <strong>{season.label}</strong>
          <span>{canEdit ? "Edición habilitada" : "Modo consulta"}</span>
        </div>
      </header>

      {isStaff ? (
        <section className="uscout-owner-selector">
          <label>
            Espacio del scout
            <select onChange={(event) => setSelectedOwnerId(event.target.value)} value={selectedOwnerId}>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.full_name || owner.scout_name || owner.email}
                </option>
              ))}
            </select>
          </label>
          <p>Los scouts no pueden consultar las selecciones de otros compañeros.</p>
        </section>
      ) : null}

      {message ? <div className={`uscout-message is-${message.tone}`}>{message.text}</div> : null}
      {isLoading ? <div className="empty-state">Cargando espacio UScout...</div> : null}

      {!isLoading ? (
        <>
          <section className="uscout-section">
            <div className="uscout-section__head">
              <div>
                <span>Bloque 01</span>
                <h2>Shortlist personal</h2>
                <p>Jugadores priorizados por el scout durante la temporada.</p>
              </div>
              <div className="uscout-section__actions">
                <strong>{shortlistPlayers.length} jugadores</strong>
                <PDFDownloadLink
                  document={<UScoutShortlistPdf players={shortlistPlayers} printedAt={printedAt} scoutName={scoutName} />}
                  fileName={`Short_List_Personal_${normalizeKey(scoutName).replaceAll(" ", "_")}_${pdfDateKey}.pdf`}
                >
                  {({ loading }) => (loading ? "Preparando..." : "Imprimir shortlist")}
                </PDFDownloadLink>
              </div>
            </div>

            {canEdit ? (
              <div className="uscout-add-panel">
                <label>
                  Competición
                  <select
                    onChange={(event) => {
                      setPlayerCompetitionFilter(event.target.value);
                      setPlayerTeamFilter("");
                      setPlayerPositionFilter("");
                      setSelectedPlayerKey("");
                    }}
                    value={playerCompetitionFilter}
                  >
                    <option value="">Todas</option>
                    {competitionOptions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  Equipo
                  <select
                    onChange={(event) => {
                      setPlayerTeamFilter(event.target.value);
                      setPlayerPositionFilter("");
                      setSelectedPlayerKey("");
                    }}
                    value={playerTeamFilter}
                  >
                    <option value="">Todos</option>
                    {teamOptions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  Posición
                  <select
                    onChange={(event) => {
                      setPlayerPositionFilter(event.target.value);
                      setSelectedPlayerKey("");
                    }}
                    value={playerPositionFilter}
                  >
                    <option value="">Todas</option>
                    {positionOptions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  Jugador
                  <select onChange={(event) => setSelectedPlayerKey(event.target.value)} value={selectedPlayerKey}>
                    <option value="">Selecciona un jugador</option>
                    {candidatePlayers.map((player) => (
                      <option
                        key={`${player.player_id || normalizeKey(player.player_name)}:${player.birth_year || 0}`}
                        value={`${player.player_id || normalizeKey(player.player_name)}:${player.birth_year || 0}`}
                      >
                        {player.player_name} · {player.team_name || "Sin equipo"}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={!selectedCandidate} onClick={() => selectedCandidate && addExistingPlayer(selectedCandidate)} type="button">
                  Añadir a shortlist
                </button>
                <label className="uscout-add-panel__search">
                  Buscar en la base de jugadores
                  <input
                    onChange={(event) => {
                      setPlayerSearch(event.target.value);
                      setSelectedPlayerKey("");
                    }}
                    placeholder="Escribe nombre, equipo o posición..."
                    type="search"
                    value={playerSearch}
                  />
                </label>
                <button className="uscout-add-panel__manual" onClick={() => setShowManualForm((current) => !current)} type="button">
                  {showManualForm ? "Cancelar alta manual" : "+ Jugador provisional"}
                </button>
                {normalizedSearch && candidatePlayers.length ? (
                  <div className="uscout-candidate-list">
                    {candidatePlayers.map((player) => (
                      <button key={`${player.player_id || player.player_name}-${player.birth_year || 0}`} onClick={() => addExistingPlayer(player)} type="button">
                        <span>
                          <strong>{player.player_name}</strong>
                          <small>
                            {player.team_name || "Sin equipo"} · {ageFromBirthYear(player.birth_year)} · {player.position || "Sin posición"}
                          </small>
                        </span>
                        <b>Añadir</b>
                      </button>
                    ))}
                  </div>
                ) : null}
                {hasPlayerFilters && !candidatePlayers.length ? (
                  <p className="uscout-filter-empty">No hay coincidencias disponibles con estos filtros.</p>
                ) : null}
                {showManualForm ? (
                  <div className="uscout-manual-form">
                    <label>Nombre<input value={manualPlayer.name} onChange={(event) => setManualPlayer({ ...manualPlayer, name: event.target.value })} /></label>
                    <label>Equipo<input value={manualPlayer.team} onChange={(event) => setManualPlayer({ ...manualPlayer, team: event.target.value })} /></label>
                    <label>Año nacimiento<input inputMode="numeric" value={manualPlayer.birthYear} onChange={(event) => setManualPlayer({ ...manualPlayer, birthYear: event.target.value })} /></label>
                    <label>Posición<input value={manualPlayer.position} onChange={(event) => setManualPlayer({ ...manualPlayer, position: event.target.value })} /></label>
                    <label>Competición<input value={manualPlayer.competition} onChange={(event) => setManualPlayer({ ...manualPlayer, competition: event.target.value })} /></label>
                    <label className="uscout-manual-form__notes">Notas<textarea value={manualPlayer.notes} onChange={(event) => setManualPlayer({ ...manualPlayer, notes: event.target.value })} /></label>
                    <button onClick={addManualPlayer} type="button">Guardar jugador</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="uscout-list-filters">
              <label>
                Buscar dentro de la shortlist
                <input onChange={(event) => setShortlistViewSearch(event.target.value)} placeholder="Nombre o equipo..." type="search" value={shortlistViewSearch} />
              </label>
              <label>
                Familia
                <select onChange={(event) => setShortlistViewPosition(event.target.value)} value={shortlistViewPosition}>
                  <option value="">Todas</option>
                  {POSITION_FAMILIES.filter((family) => shortlistPlayers.some((player) => positionFamily(player.position) === family.key)).map((family) => (
                    <option key={family.key} value={family.key}>{family.label}</option>
                  ))}
                </select>
              </label>
              <span>{filteredShortlistPlayers.length} visibles · máximo 6 por familia</span>
            </div>

            <div className="uscout-shortlist-list">
              {!shortlistPlayers.length ? (
                <div className="empty-state">Todavía no hay jugadores en esta shortlist.</div>
              ) : null}
              {shortlistPlayers.length > 0 && !filteredShortlistPlayers.length ? (
                <div className="empty-state">No hay jugadores que coincidan con los filtros.</div>
              ) : null}
              {POSITION_FAMILIES.map((family) => {
                const familyPlayers = filteredShortlistPlayers.filter((player) => positionFamily(player.position) === family.key);
                if (!familyPlayers.length) return null;
                return (
                  <section className={`uscout-shortlist-family is-${family.key}`} key={family.key}>
                    <header><h3>{family.label}</h3><span>{familyPlayers.length}</span></header>
                    <div className="uscout-shortlist-family__rows">
                      {familyPlayers.map((player) => (
                        <article className={`uscout-player-row is-${player.status}`} key={player.id}>
                          <div className="uscout-player-row__identity">
                            <span>{player.source_kind === "manual" ? `Provisional · ${season.label}` : season.label}</span>
                            <strong>{player.player_name}</strong>
                            <small>{player.team_name || "Sin equipo"} · {player.birth_year || "Año n/d"}</small>
                          </div>
                          <div className="uscout-player-row__facts">
                            <span>{player.position || "Sin posición"}</span>
                            <span>{player.reports_count} inf.</span>
                            <b>{player.verdict || "-"}</b>
                          </div>
                          <label>Estado<select disabled={!canEdit} value={player.status} onChange={(event) => updateShortlistPlayer(player.id, { status: event.target.value as UScoutShortlistPlayer["status"] })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                          <label>Prioridad<select disabled={!canEdit} value={player.priority} onChange={(event) => updateShortlistPlayer(player.id, { priority: event.target.value as UScoutShortlistPlayer["priority"] })}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
                          <label className="uscout-player-row__notes">Notas<input disabled={!canEdit} onBlur={(event) => updateShortlistPlayer(player.id, { notes: event.target.value })} onChange={(event) => setShortlistPlayers((current) => current.map((item) => item.id === player.id ? { ...item, notes: event.target.value } : item))} placeholder="Apunte privado del scout..." value={player.notes || ""} /></label>
                          {canEdit ? <button className="uscout-player-row__remove" onClick={() => removeShortlistPlayer(player)} type="button" aria-label={`Retirar a ${player.player_name}`}>×</button> : null}
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>

          <section className="uscout-section">
            <div className="uscout-section__head">
              <div><span>Bloque 02</span><h2>Campogramas del scout</h2><p>Hasta 6 composiciones personales con guardado automático.</p></div>
              <div className="uscout-section__actions">
                <strong>{boards.length}/6 creados</strong>
                {selectedPrintBoards.length ? (
                  <PDFDownloadLink
                    document={<UScoutBoardsPdf boards={selectedPrintBoards} printedAt={printedAt} scoutName={scoutName} slots={allBoardSlots} />}
                    fileName={`Campogramas_${normalizeKey(scoutName).replaceAll(" ", "_")}_${pdfDateKey}.pdf`}
                  >
                    {({ loading }) => (loading ? "Preparando..." : "Imprimir campogramas")}
                  </PDFDownloadLink>
                ) : null}
              </div>
            </div>
            {boards.length ? (
              <div className="uscout-print-selector">
                <div>
                  <strong>Campogramas incluidos en el PDF</strong>
                  <span>{selectedPrintBoards.length} de {boards.length} seleccionados</span>
                </div>
                <div className="uscout-print-selector__options">
                  {boards.map((item) => (
                    <label key={item.id}>
                      <input
                        checked={printBoardIds.includes(item.id)}
                        onChange={(event) => setPrintBoardIds((current) => event.target.checked
                          ? [...new Set([...current, item.id])]
                          : current.filter((id) => id !== item.id))}
                        type="checkbox"
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
                <div className="uscout-print-selector__quick">
                  <button onClick={() => setPrintBoardIds(boards.map((item) => item.id))} type="button">Todos</button>
                  <button onClick={() => setPrintBoardIds([])} type="button">Ninguno</button>
                </div>
              </div>
            ) : null}
            <div className="uscout-board-manager">
              <label>
                Campograma activo
                <select disabled={!boards.length} onChange={(event) => setSelectedBoardId(event.target.value)} value={selectedBoardId}>
                  {!boards.length ? <option value="">Sin campogramas</option> : null}
                  {boards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="uscout-formation-select">
                Formación
                <select disabled={!canEdit || !board} onChange={(event) => changeFormation(event.target.value)} value={formation}>
                  {Object.keys(FORMATIONS).map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              {canEdit ? (
                <>
                  <label>
                    Nuevo campograma
                    <input disabled={boards.length >= 6} maxLength={40} onChange={(event) => setNewBoardName(event.target.value)} placeholder={`Campograma ${boards.length + 1}`} value={newBoardName} />
                  </label>
                  <button disabled={boards.length >= 6} onClick={createBoard} type="button">+ Crear</button>
                  {board ? <button className="is-danger" onClick={deleteBoard} type="button">Eliminar</button> : null}
                </>
              ) : null}
            </div>

            {activeSlotKey && activeFormationSlot && board ? (
              <div className="uscout-board-picker">
                <div className="uscout-board-picker__head">
                  <div>
                    <span>Añadir en {activeFormationSlot.label}</span>
                    <strong>{activeAssignedSlots.length}/3 jugadores · {board.name}</strong>
                  </div>
                  <button onClick={() => setActiveSlotKey(null)} type="button">Cerrar</button>
                </div>
                {activeAssignedSlots.length ? (
                  <div className="uscout-board-picker__assigned">
                    {activeAssignedSlots.map((slot) => (
                      <span key={slot.id}>
                        <b>{slot.player_name}</b>
                        {canEdit ? <button onClick={() => removeBoardPlayer(slot)} type="button" aria-label={`Quitar a ${slot.player_name}`}>×</button> : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="uscout-board-picker__filters">
                  <label>Competición<select onChange={(event) => { setBoardCompetitionFilter(event.target.value); setBoardTeamFilter(""); setBoardPositionFilter(""); }} value={boardCompetitionFilter}><option value="">Todas</option>{boardCompetitionOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Equipo<select onChange={(event) => { setBoardTeamFilter(event.target.value); setBoardPositionFilter(""); }} value={boardTeamFilter}><option value="">Todos</option>{boardTeamOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Posición<select onChange={(event) => setBoardPositionFilter(event.target.value)} value={boardPositionFilter}><option value="">Todas</option>{boardPositionOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Buscar jugador<input onChange={(event) => setBoardPlayerSearch(event.target.value)} placeholder="Nombre, equipo o posición..." type="search" value={boardPlayerSearch} /></label>
                </div>
                <div className="uscout-board-picker__results">
                  {activeAssignedSlots.length >= 3 ? (
                    <p>Este puesto ya tiene el máximo de tres jugadores. Retira uno para añadir otro.</p>
                  ) : filteredBoardCandidates
                    .filter((candidate) => !usedPlayerNames.has(normalizeKey(candidate.name)))
                    .slice(0, 30)
                    .map((candidate) => (
                      <button key={candidate.id} onClick={() => assignPlayer(activeSlotKey, candidate.id)} type="button">
                        <strong>{candidate.name}</strong>
                        <span>{candidate.team || "Sin equipo"} · {ageFromBirthYear(candidate.birthYear)}</span>
                        <small>{candidate.position || "Sin posición"}</small>
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            {!board ? (
              <div className="empty-state">Crea el primer campograma para empezar a colocar jugadores.</div>
            ) : (
              <div className="uscout-board-scroll">
                <div className="uscout-board">
                  <div className="uscout-board__center-circle" />
                  <div className="uscout-board__box uscout-board__box--top" />
                  <div className="uscout-board__box uscout-board__box--bottom" />
                  {formationSlots.map((slot) => {
                    const assigned = boardSlots
                      .filter((item) => baseSlotKey(item.slot_key) === slot.key)
                      .sort((left, right) => left.slot_key.localeCompare(right.slot_key));
                    return (
                      <div className="uscout-board-slot" key={slot.key} style={{ left: `${slot.left}%`, top: `${slot.top}%` }}>
                        <span>{slot.label}</span>
                        <div className="uscout-board-slot__players">
                          {assigned.map((player) => (
                            <article key={player.id}>
                              <strong>{player.player_name}</strong>
                              <small>{player.team_name || "Sin equipo"} · {player.birth_year || "Año n/d"}</small>
                              {canEdit ? <button onClick={() => removeBoardPlayer(player)} type="button" aria-label={`Quitar a ${player.player_name}`}>×</button> : null}
                            </article>
                          ))}
                          {canEdit && assigned.length < 3 ? (
                            <button className="uscout-board-slot__add" onClick={() => setActiveSlotKey(slot.key)} type="button">
                              + Añadir jugador
                            </button>
                          ) : null}
                          {!canEdit && !assigned.length ? <small className="uscout-board-slot__empty">Sin jugadores</small> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
