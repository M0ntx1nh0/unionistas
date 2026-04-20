import { Fragment, type CSSProperties } from "react";
import { Document, Image, Page, PDFDownloadLink, StyleSheet, Text, View } from "@react-pdf/renderer";
import { MetricCard } from "../components/MetricCard";
import type { ScoutingReport, UserProfile } from "../types";

type CountRow = {
  label: string;
  value: number;
};

type HeatmapData = {
  columns: string[];
  columnTotals: Record<string, number>;
  grandTotal: number;
  maxValue: number;
  rows: {
    label: string;
    total: number;
    values: Record<string, number>;
  }[];
};

const VERDICT_ORDER = ["A+", "A", "B", "C", "D", "E", "Seguir Valorando", "Filial/Juvenil DH"];
const PDF_ACCENT = "#e7d21a";
const PDF_BLACK = "#0a0a0a";
const PDF_MUTED = "#5a5a55";
const UNIONISTAS_BADGE_SRC = "/escudo/unionistar.png";

const pdfStyles = StyleSheet.create({
  page: {
    backgroundColor: "#f6f6f2",
    color: PDF_BLACK,
    fontFamily: "Helvetica",
    padding: 26,
    position: "relative",
  },
  cover: {
    alignItems: "center",
    backgroundColor: "#f6f6f2",
    color: PDF_BLACK,
    display: "flex",
    fontFamily: "Helvetica",
    justifyContent: "center",
    padding: 48,
    position: "relative",
  },
  coverStrip: {
    backgroundColor: PDF_BLACK,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
    width: 54,
  },
  coverAccent: {
    backgroundColor: PDF_ACCENT,
    bottom: 0,
    left: 54,
    position: "absolute",
    top: 0,
    width: 6,
  },
  coverLogo: {
    height: 78,
    position: "absolute",
    right: 54,
    top: 42,
    width: 78,
  },
  coverWatermark: {
    height: 230,
    opacity: 0.05,
    position: "absolute",
    width: 230,
  },
  coverTitle: {
    fontSize: 31,
    fontWeight: 900,
    marginBottom: 12,
    textAlign: "center",
  },
  coverSubtitle: {
    color: PDF_MUTED,
    fontSize: 17,
    fontWeight: 700,
    marginBottom: 8,
    textAlign: "center",
  },
  coverMeta: {
    color: "#7b7110",
    fontSize: 11,
    fontWeight: 700,
    marginTop: 18,
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    backgroundColor: PDF_BLACK,
    borderRadius: 12,
    color: "#ffffff",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    padding: 10,
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
  },
  headerRight: {
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    gap: 10,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 900,
  },
  headerSubtitle: {
    color: PDF_ACCENT,
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 1.4,
    marginTop: 3,
    textTransform: "uppercase",
  },
  headerDate: {
    color: PDF_ACCENT,
    fontSize: 8,
    fontWeight: 700,
  },
  headerLogo: {
    height: 28,
    width: 28,
  },
  footer: {
    bottom: 10,
    color: PDF_MUTED,
    fontSize: 7,
    position: "absolute",
    right: 26,
  },
  pageNumber: {
    bottom: 10,
    color: PDF_MUTED,
    fontSize: 7,
    left: 0,
    position: "absolute",
    right: 0,
    textAlign: "center",
  },
  pageWatermark: {
    height: 230,
    left: 306,
    opacity: 0.035,
    position: "absolute",
    top: 150,
    width: 230,
  },
  metricsRow: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  metricBox: {
    backgroundColor: "#ffffff",
    borderLeftColor: PDF_ACCENT,
    borderLeftWidth: 4,
    borderRadius: 12,
    flex: 1,
    padding: 10,
  },
  metricLabel: {
    color: PDF_MUTED,
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 25,
    fontWeight: 900,
  },
  twoCols: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
  },
  threeCols: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    flex: 1,
    padding: 9,
  },
  cardTitle: {
    backgroundColor: PDF_BLACK,
    borderRadius: 9,
    color: "#ffffff",
    fontSize: 10,
    fontWeight: 900,
    marginBottom: 8,
    padding: 7,
  },
  barRow: {
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    gap: 6,
    marginBottom: 5,
  },
  barLabel: {
    color: "#383832",
    fontSize: 7,
    fontWeight: 700,
    width: 112,
  },
  barTrack: {
    backgroundColor: "#e9e9e2",
    borderRadius: 99,
    flex: 1,
    height: 6,
    overflow: "hidden",
  },
  barFillGold: {
    backgroundColor: "#d4b000",
    borderRadius: 99,
    height: 6,
  },
  barFillGreen: {
    backgroundColor: "#0f8a3b",
    borderRadius: 99,
    height: 6,
  },
  barFillBlue: {
    backgroundColor: "#3b82f6",
    borderRadius: 99,
    height: 6,
  },
  barFillBlack: {
    backgroundColor: PDF_BLACK,
    borderRadius: 99,
    height: 6,
  },
  barValue: {
    fontSize: 7,
    fontWeight: 900,
    textAlign: "right",
    width: 20,
  },
  heatmapWrap: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 6,
  },
  heatmapRow: {
    display: "flex",
    flexDirection: "row",
    gap: 1,
    marginBottom: 1,
  },
  heatmapCell: {
    alignItems: "center",
    borderRadius: 2,
    display: "flex",
    height: 12,
    justifyContent: "center",
    padding: 1,
  },
  heatmapHead: {
    backgroundColor: PDF_BLACK,
    color: "#ffffff",
    fontSize: 3.9,
    fontWeight: 700,
    height: 42,
    lineHeight: 1.05,
  },
  heatmapTotal: {
    backgroundColor: PDF_ACCENT,
    color: PDF_BLACK,
    fontSize: 5,
    fontWeight: 900,
  },
  heatmapRowLabel: {
    backgroundColor: "#f0efe8",
    color: PDF_BLACK,
    fontSize: 4.8,
    fontWeight: 700,
    lineHeight: 1,
    justifyContent: "center",
  },
  heatmapValue: {
    borderColor: "rgba(0,0,0,0.04)",
    borderWidth: 0.2,
    color: PDF_BLACK,
    fontSize: 5,
    fontWeight: 900,
  },
});

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeVerdict(value: unknown) {
  const raw = normalizeText(value);
  const key = normalizeKey(raw);
  if (!key) return "Sin veredicto";
  if (raw.toUpperCase() === "A+") return "A+";
  if (["a", "b", "c", "d", "e"].includes(key)) return key.toUpperCase();
  if (key.includes("seguir")) return "Seguir Valorando";
  if (key.includes("filial") || key.includes("juvenil") || key.includes("dh")) return "Filial/Juvenil DH";
  return raw;
}

function countBy<T>(items: T[], getLabel: (item: T) => string | null | undefined, fallback: string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = normalizeText(getLabel(item)) || fallback;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"));
}

function verdictDistribution(reports: ScoutingReport[]) {
  const counts = new Map<string, number>();
  for (const report of reports) {
    const label = normalizeVerdict(report.verdict);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const rows = VERDICT_ORDER.map((label) => ({ label, value: counts.get(label) || 0 }));
  const extras = Array.from(counts.entries())
    .filter(([label]) => !VERDICT_ORDER.includes(label))
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"));
  return [...rows, ...extras];
}

function uniquePlayersByCompetition(reports: ScoutingReport[]) {
  const buckets = new Map<string, Set<string>>();
  for (const report of reports) {
    const competition = normalizeText(report.competition) || "Sin competición";
    const player = normalizeText(report.player_name);
    if (!player) continue;
    const current = buckets.get(competition) || new Set<string>();
    current.add(player);
    buckets.set(competition, current);
  }
  return Array.from(buckets.entries())
    .map(([label, players]) => ({ label, value: players.size }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"));
}

function buildPositionCompetitionHeatmap(reports: ScoutingReport[]): HeatmapData {
  const competitionPlayers = new Map<string, Set<string>>();
  const positionPlayers = new Map<string, Set<string>>();
  const cellPlayers = new Map<string, Set<string>>();

  for (const report of reports) {
    const player = normalizeText(report.player_name);
    if (!player) continue;
    const competition = normalizeText(report.competition) || "Sin competición";
    const position = normalizeText(report.position) || "Sin posición";
    const playerKey = normalizeKey(player);

    const competitionSet = competitionPlayers.get(competition) || new Set<string>();
    competitionSet.add(playerKey);
    competitionPlayers.set(competition, competitionSet);

    const positionSet = positionPlayers.get(position) || new Set<string>();
    positionSet.add(playerKey);
    positionPlayers.set(position, positionSet);

    const cellKey = `${position}|||${competition}`;
    const cellSet = cellPlayers.get(cellKey) || new Set<string>();
    cellSet.add(playerKey);
    cellPlayers.set(cellKey, cellSet);
  }

  const columns = Array.from(competitionPlayers.entries())
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], "es"))
    .map(([competition]) => competition);

  const columnTotals: Record<string, number> = Object.fromEntries(columns.map((competition) => [competition, 0]));
  let grandTotal = 0;
  let maxValue = 1;
  const rows = Array.from(positionPlayers.keys())
    .map((position) => {
      const values: Record<string, number> = {};
      let total = 0;
      for (const competition of columns) {
        const value = cellPlayers.get(`${position}|||${competition}`)?.size || 0;
        values[competition] = value;
        total += value;
        columnTotals[competition] = (columnTotals[competition] || 0) + value;
        grandTotal += value;
        maxValue = Math.max(maxValue, value);
      }
      return { label: position, total, values };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "es"));

  return { columns, columnTotals, grandTotal, maxValue, rows };
}

function DashboardBars({
  rows,
  title,
  tone = "gold",
}: {
  rows: CountRow[];
  title: string;
  tone?: "gold" | "green" | "blue" | "black";
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <article className="dashboard-chart-card">
      <div className="dashboard-chart-card__head">
        <h2>{title}</h2>
        <span>{rows.length} valores</span>
      </div>
      <div className="dashboard-bars">
        {rows.map((row) => (
          <div className="dashboard-bar-row" key={row.label}>
            <span title={row.label}>{row.label}</span>
            <div>
              <i
                className={`dashboard-bar dashboard-bar--${tone}`}
                style={{ width: row.value ? `${Math.max((row.value / maxValue) * 100, 4)}%` : 0 }}
              />
            </div>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function DashboardPdfHeader({ printedAt }: { printedAt: string }) {
  return (
    <View style={pdfStyles.header} fixed>
      <View style={pdfStyles.headerLeft}>
        <Text style={pdfStyles.headerTitle}>Secretaría Técnica USCF</Text>
        <Text style={pdfStyles.headerSubtitle}>Dashboard de seguimiento · Informe Área de Scouting</Text>
      </View>
      <View style={pdfStyles.headerRight}>
        <Text style={pdfStyles.headerDate}>Fecha de impresión: {printedAt}</Text>
        <Image src={UNIONISTAS_BADGE_SRC} style={pdfStyles.headerLogo} />
      </View>
    </View>
  );
}

function DashboardPdfFooter() {
  return (
    <>
      <Text
        fixed
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        style={pdfStyles.pageNumber}
      />
      <Text fixed style={pdfStyles.footer}>
        Diseñador del Informe: Ramón Codesido | MCode Analytics
      </Text>
    </>
  );
}

function PdfMetricCard({ label, value }: CountRow) {
  return (
    <View style={pdfStyles.metricBox}>
      <Text style={pdfStyles.metricLabel}>{label}</Text>
      <Text style={pdfStyles.metricValue}>{value}</Text>
    </View>
  );
}

function PdfBars({
  rows,
  title,
  tone = "gold",
  labelWidth = 112,
}: {
  rows: CountRow[];
  title: string;
  tone?: "gold" | "green" | "blue" | "black";
  labelWidth?: number;
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const fillStyle =
    tone === "green"
      ? pdfStyles.barFillGreen
      : tone === "blue"
        ? pdfStyles.barFillBlue
        : tone === "black"
          ? pdfStyles.barFillBlack
          : pdfStyles.barFillGold;

  return (
    <View style={pdfStyles.card}>
      <Text style={pdfStyles.cardTitle}>{title}</Text>
      {rows.map((row) => (
        <View key={row.label} style={pdfStyles.barRow}>
          <Text style={[pdfStyles.barLabel, { width: labelWidth }]}>{row.label}</Text>
          <View style={pdfStyles.barTrack}>
            <View style={[fillStyle, { width: `${row.value ? Math.max((row.value / maxValue) * 100, 4) : 0}%` }]} />
          </View>
          <Text style={pdfStyles.barValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function PdfHeatmap({ data }: { data: HeatmapData }) {
  const totalWidth = 24;
  const labelWidth = 76;
  const heatmapAvailableWidth = 776;
  const columnWidth = Math.max(
    10,
    Math.min(
      18,
      Math.floor(
        (heatmapAvailableWidth - totalWidth - labelWidth - data.columns.length) /
          Math.max(data.columns.length, 1),
      ),
    ),
  );

  return (
    <View style={pdfStyles.heatmapWrap}>
      <View style={pdfStyles.heatmapRow}>
        <View style={[pdfStyles.heatmapCell, pdfStyles.heatmapTotal, { width: totalWidth }]}>
          <Text>{data.grandTotal}</Text>
        </View>
        <View style={[pdfStyles.heatmapCell, pdfStyles.heatmapHead, { width: labelWidth, height: 14 }]}>
          <Text>Total</Text>
        </View>
        {data.columns.map((column) => (
          <View key={`total-${column}`} style={[pdfStyles.heatmapCell, pdfStyles.heatmapTotal, { width: columnWidth }]}>
            <Text>{data.columnTotals[column] || 0}</Text>
          </View>
        ))}
      </View>

      <View style={pdfStyles.heatmapRow}>
        <View style={[pdfStyles.heatmapCell, pdfStyles.heatmapHead, { width: totalWidth }]}>
          <Text>#</Text>
        </View>
        <View style={[pdfStyles.heatmapCell, pdfStyles.heatmapHead, { width: labelWidth }]}>
          <Text>Posición</Text>
        </View>
        {data.columns.map((column) => (
          <View key={column} style={[pdfStyles.heatmapCell, pdfStyles.heatmapHead, { width: columnWidth }]}>
            <Text>{column}</Text>
          </View>
        ))}
      </View>

      {data.rows.map((row) => (
        <View key={row.label} style={pdfStyles.heatmapRow}>
          <View style={[pdfStyles.heatmapCell, pdfStyles.heatmapTotal, { width: totalWidth }]}>
            <Text>{row.total}</Text>
          </View>
          <View style={[pdfStyles.heatmapCell, pdfStyles.heatmapRowLabel, { width: labelWidth }]}>
            <Text>{row.label}</Text>
          </View>
          {data.columns.map((column) => {
            const value = row.values[column] || 0;
            const intensity = value / data.maxValue;
            return (
              <View
                key={`${row.label}-${column}`}
                style={[
                  pdfStyles.heatmapCell,
                  pdfStyles.heatmapValue,
                  {
                    backgroundColor: value
                      ? `rgba(212, 176, 0, ${Math.max(0.16, 0.18 + intensity * 0.72)})`
                      : "rgba(240, 240, 235, 0.76)",
                    width: columnWidth,
                  },
                ]}
              >
                <Text>{value || ""}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function DashboardPdfDocument({
  averageReports,
  competitionRows,
  heatmapData,
  playerRows,
  printedAt,
  scoutRows,
  teamRows,
  totalReports,
  uniquePlayers,
  uniqueScouts,
  verdictRows,
}: {
  averageReports: string;
  competitionRows: CountRow[];
  heatmapData: HeatmapData;
  playerRows: CountRow[];
  printedAt: string;
  scoutRows: CountRow[];
  teamRows: CountRow[];
  totalReports: number;
  uniquePlayers: number;
  uniqueScouts: number;
  verdictRows: CountRow[];
}) {
  return (
    <Document
      author="Ramón Codesido | MCode Analytics"
      subject="Dashboard de seguimiento del área de scouting"
      title="Informe Área de Scouting"
    >
      <Page size="A4" orientation="landscape" style={pdfStyles.cover}>
        <View style={pdfStyles.coverStrip} />
        <View style={pdfStyles.coverAccent} />
        <Image src={UNIONISTAS_BADGE_SRC} style={pdfStyles.coverWatermark} />
        <Image src={UNIONISTAS_BADGE_SRC} style={pdfStyles.coverLogo} />
        <Text style={pdfStyles.coverTitle}>Informe Área de Scouting</Text>
        <Text style={pdfStyles.coverSubtitle}>Dashboard de seguimiento</Text>
        <Text style={pdfStyles.coverSubtitle}>Secretaría Técnica USCF</Text>
        <Text style={pdfStyles.coverMeta}>Fecha de impresión: {printedAt}</Text>
        <Text fixed style={pdfStyles.footer}>
          Diseñador del Informe: Ramón Codesido | MCode Analytics
        </Text>
      </Page>

      <Page size="A4" orientation="landscape" style={pdfStyles.page}>
        <Image fixed src={UNIONISTAS_BADGE_SRC} style={pdfStyles.pageWatermark} />
        <DashboardPdfHeader printedAt={printedAt} />
        <View style={pdfStyles.metricsRow}>
          <PdfMetricCard label="Informes" value={totalReports} />
          <PdfMetricCard label="Jugadores" value={uniquePlayers} />
          <PdfMetricCard label="Ojeadores" value={uniqueScouts} />
          <PdfMetricCard label="Informes / jugador" value={Number(averageReports)} />
        </View>
        <View style={pdfStyles.twoCols}>
          <PdfBars rows={verdictRows} title="Distribución por veredicto" tone="gold" />
          <PdfBars rows={scoutRows} title="Informes por ojeador" tone="green" />
        </View>
        <DashboardPdfFooter />
      </Page>

      <Page size="A4" orientation="landscape" style={pdfStyles.page}>
        <Image fixed src={UNIONISTAS_BADGE_SRC} style={pdfStyles.pageWatermark} />
        <DashboardPdfHeader printedAt={printedAt} />
        <View style={pdfStyles.threeCols}>
          <PdfBars rows={competitionRows.slice(0, 20)} title="Jugadores únicos por competición" tone="blue" labelWidth={80} />
          <PdfBars rows={playerRows} title="Top 20 jugadores más vistos" tone="black" labelWidth={82} />
          <PdfBars rows={teamRows} title="Top 20 equipos más vistos" tone="gold" labelWidth={82} />
        </View>
        <DashboardPdfFooter />
      </Page>

      <Page size="A4" orientation="landscape" style={pdfStyles.page}>
        <Image fixed src={UNIONISTAS_BADGE_SRC} style={pdfStyles.pageWatermark} />
        <DashboardPdfHeader printedAt={printedAt} />
        <PdfHeatmap data={heatmapData} />
        <DashboardPdfFooter />
      </Page>
    </Document>
  );
}

function DashboardHeatmap({ data }: { data: HeatmapData }) {
  return (
    <article className="dashboard-chart-card dashboard-heatmap-card">
      <div className="dashboard-chart-card__head">
        <h2>Mapa posición / competición</h2>
        <span>
          {data.rows.length} posiciones · {data.columns.length} ligas
        </span>
      </div>
      <div className="dashboard-heatmap">
        <div className="dashboard-heatmap__grid" style={{ "--heatmap-columns": data.columns.length } as CSSProperties}>
          <div className="dashboard-heatmap__cell dashboard-heatmap__cell--grand dashboard-heatmap__cell--sticky dashboard-heatmap__cell--sticky-total dashboard-heatmap__cell--top-total">
            {data.grandTotal}
          </div>
          <div className="dashboard-heatmap__cell dashboard-heatmap__cell--head dashboard-heatmap__cell--sticky dashboard-heatmap__cell--sticky-position dashboard-heatmap__cell--top-total">
            Total
          </div>
          {data.columns.map((column) => (
            <div className="dashboard-heatmap__cell dashboard-heatmap__cell--footer dashboard-heatmap__cell--top-total" key={`total-${column}`} title={`Total ${column}`}>
              {data.columnTotals[column] || 0}
            </div>
          ))}
          <div className="dashboard-heatmap__cell dashboard-heatmap__cell--head dashboard-heatmap__cell--sticky dashboard-heatmap__cell--sticky-total dashboard-heatmap__cell--top-head">
            #
          </div>
          <div className="dashboard-heatmap__cell dashboard-heatmap__cell--head dashboard-heatmap__cell--sticky dashboard-heatmap__cell--sticky-position dashboard-heatmap__cell--top-head">
            Posición
          </div>
          {data.columns.map((column) => (
            <div className="dashboard-heatmap__cell dashboard-heatmap__cell--head dashboard-heatmap__cell--top-head" key={column} title={column}>
              {column}
            </div>
          ))}
          {data.rows.map((row) => (
            <Fragment key={row.label}>
              <div className="dashboard-heatmap__cell dashboard-heatmap__cell--row-total dashboard-heatmap__cell--sticky dashboard-heatmap__cell--sticky-total">
                {row.total}
              </div>
              <div className="dashboard-heatmap__cell dashboard-heatmap__cell--row dashboard-heatmap__cell--sticky dashboard-heatmap__cell--sticky-position" key={`${row.label}-label`}>
                <strong>{row.label}</strong>
              </div>
              {data.columns.map((column) => {
                const value = row.values[column] || 0;
                const intensity = value / data.maxValue;
                return (
                  <div
                    className="dashboard-heatmap__cell dashboard-heatmap__cell--value"
                    key={`${row.label}-${column}`}
                    style={{
                      background: value
                        ? `rgba(212, 176, 0, ${Math.max(0.16, 0.18 + intensity * 0.72)})`
                        : "rgba(240, 240, 235, 0.76)",
                    }}
                    title={`${row.label} · ${column}: ${value}`}
                  >
                    {value || ""}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </article>
  );
}

export function DashboardView({
  profile,
  reports,
}: {
  profile?: UserProfile;
  reports: ScoutingReport[];
}) {
  const totalReports = reports.length;
  const uniquePlayers = new Set(reports.map((report) => normalizeText(report.player_name)).filter(Boolean)).size;
  const uniqueScouts = new Set(reports.map((report) => normalizeText(report.scout_name)).filter(Boolean)).size;
  const averageReports = uniquePlayers ? (totalReports / uniquePlayers).toFixed(2) : "0";

  const verdictRows = verdictDistribution(reports);
  const scoutRows = countBy(reports, (report) => report.scout_name, "Sin ojeador").slice(0, 16);
  const playerRows = countBy(reports, (report) => report.player_name, "Sin jugador").slice(0, 20);
  const teamRows = countBy(reports, (report) => report.team_name, "Sin equipo").slice(0, 20);
  const competitionRows = uniquePlayersByCompetition(reports);
  const heatmapData = buildPositionCompetitionHeatmap(reports);
  const printedAt = new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(new Date());
  const isScoutScope = profile?.role === "scout";

  return (
    <section className="dashboard-view">
      {isScoutScope ? (
        <div className="role-scope-note">
          <strong>Vista scout</strong>
          <span>
            Dashboard filtrado a tus informes como {profile.scout_name || profile.full_name || profile.email}.
          </span>
        </div>
      ) : null}

      <div className="dashboard-print-actions no-print">
        <PDFDownloadLink
          document={
            <DashboardPdfDocument
              averageReports={averageReports}
              competitionRows={competitionRows}
              heatmapData={heatmapData}
              playerRows={playerRows}
              printedAt={printedAt}
              scoutRows={scoutRows}
              teamRows={teamRows}
              totalReports={totalReports}
              uniquePlayers={uniquePlayers}
              uniqueScouts={uniqueScouts}
              verdictRows={verdictRows}
            />
          }
          fileName={`Informe_Area_Scouting_Dashboard_${new Date().toISOString().slice(2, 10).replaceAll("-", "")}.pdf`}
        >
          {({ loading }) => (loading ? "Preparando PDF..." : "Descargar PDF")}
        </PDFDownloadLink>
      </div>

      <section className="dashboard-print-page dashboard-print-page--summary">
        <div className="dashboard-print-header">
          <div className="dashboard-print-titleblock">
            <strong>Informe Área de Scouting</strong>
            <span>Dashboard de seguimiento</span>
            <em>Secretaría Técnica USCF</em>
          </div>
          <small>Fecha de impresión: {printedAt}</small>
        </div>

        <section className="metrics-grid dashboard-print-metrics">
          <MetricCard label="Informes" tone="gold" value={totalReports} />
          <MetricCard label="Jugadores" tone="green" value={uniquePlayers} />
          <MetricCard label="Ojeadores" tone="blue" value={uniqueScouts} />
          <MetricCard label="Informes / jugador" value={averageReports} />
        </section>

        <section className="dashboard-grid dashboard-grid--summary">
          <DashboardBars rows={verdictRows} title="Distribución por veredicto" tone="gold" />
          <DashboardBars rows={scoutRows} title="Informes por ojeador" tone="green" />
        </section>
      </section>

      <section className="dashboard-print-page dashboard-print-page--rankings">
        <div className="dashboard-print-header">
          <div className="dashboard-print-titleblock">
            <strong>Informe Área de Scouting</strong>
            <span>Dashboard de seguimiento</span>
            <em>Secretaría Técnica USCF</em>
          </div>
          <small>Fecha de impresión: {printedAt}</small>
        </div>

        <section className="dashboard-grid dashboard-grid--rankings">
          <DashboardBars rows={competitionRows} title="Jugadores únicos por competición" tone="blue" />
          <DashboardBars rows={playerRows} title="Top 20 jugadores más vistos" tone="black" />
          <DashboardBars rows={teamRows} title="Top 20 equipos más vistos" tone="gold" />
        </section>
      </section>

      <section className="dashboard-print-page dashboard-print-page--heatmap">
        <div className="dashboard-print-header">
          <div className="dashboard-print-titleblock">
            <strong>Informe Área de Scouting</strong>
            <span>Dashboard de seguimiento</span>
            <em>Secretaría Técnica USCF</em>
          </div>
          <small>Fecha de impresión: {printedAt}</small>
        </div>

        <section className="dashboard-grid dashboard-grid--wide">
          <DashboardHeatmap data={heatmapData} />
        </section>
      </section>
    </section>
  );
}
