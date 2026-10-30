import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Waves,
  CloudRain,
  MapPin,
  Clock,
  Activity,
  RefreshCw,
  ChevronDown,
  ArrowUpDown,
  ShieldAlert,
  Database,
  Menu,
  X,
  LayoutDashboard,
  LineChart as ChartIcon,
  Table as TableIcon,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Droplets
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from "recharts";

// ============================================================================
// 1. DADOS SIMULADOS (MOCK) - 3 Estações Fictícias (RF01, RF02, RF03, RF09)
// ============================================================================
const MOCK_STATIONS = [
  {
    id: "EST-01",
    name: "Estação Foz do Vale",
    river: "Rio das Almas",
    city: "São Bento do Sul",
    state: "SC",
    status: "Operando",
    alertLevel: 3.8,
    basin: "Bacia do Itajaí",
    measurements: generateDeterministicSeries(2.15, 0.35, 48, "EST-01", false)
  },
  {
    id: "EST-02",
    name: "Estação Ponte Alta",
    river: "Rio Verde",
    city: "Ponta Grossa",
    state: "PR",
    status: "Alerta",
    alertLevel: 4.5,
    basin: "Bacia do Tibagi",
    measurements: generateDeterministicSeries(4.25, 0.65, 48, "EST-02", true)
  },
  {
    id: "EST-03",
    name: "Estação Serra Verde",
    river: "Rio Claro",
    city: "Poços de Caldas",
    state: "MG",
    status: "Sem Dados",
    alertLevel: 3.2,
    basin: "Bacia do Rio Grande",
    measurements: [] // Vazio propositalmente para cumprir o requisito RF09
  }
];

// Gerador de séries temporais consistente sem criar lacunas artificiais
function generateDeterministicSeries(baseLevel, rainProbability, totalHours, stationId, simulateRising) {
  const records = [];
  const now = new Date();

  for (let i = totalHours - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    const wave = Math.sin(i / 2.5) * 0.28;
    const upwardTrend = simulateRising ? ((totalHours - i) / totalHours) * 0.92 : 0;
    const jitter = ((i * 13) % 5) * 0.03;
    const riverLevel = parseFloat(Math.max(0.6, baseLevel + wave + upwardTrend + jitter).toFixed(2));

    const rainHash = ((i * 37 + stationId.charCodeAt(4)) % 100) / 100;
    const precipitation = rainHash < rainProbability ? parseFloat((rainHash * 19.4).toFixed(1)) : 0.0;

    const dayMonth = time.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit"
    });

    const hourMin = time.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit"
    });

    records.push({
      id: `${stationId}-${time.getTime()}`,
      epoch: time.getTime(),
      dateFormatted: dayMonth,
      hourFormatted: hourMin,
      fullLocal: `${dayMonth} ${hourMin}`,
      utcIso: time.toISOString(),
      riverLevel,
      precipitation
    });
  }
  return records;
}

// ============================================================================
// 2. COMPONENTE PRINCIPAL
// ============================================================================
export default function App() {
  // Navegação: 'overview' (Visão Geral), 'history' (Histórico), 'query' (Consulta)
  const [activeTab, setActiveTab] = useState("overview");

  // Estados globais da telemetria
  const [selectedStationId, setSelectedStationId] = useState("EST-01");
  const [timeRange, setTimeRange] = useState("24h"); // 12h | 24h | 48h
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stationDropdownOpen, setStationDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Estados da Tabela de Consulta
  const [sortField, setSortField] = useState("epoch");
  const [sortOrder, setSortOrder] = useState("desc");
  const [rainFilter, setRainFilter] = useState("all"); // 'all' | 'rain' | 'none'
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Fechar dropdown de estações ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setStationDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Obter estação ativa
  const selectedStation = useMemo(() => {
    return MOCK_STATIONS.find((s) => s.id === selectedStationId) || MOCK_STATIONS[0];
  }, [selectedStationId]);

  // Conversão de horas da janela de tempo (RF08)
  const windowHours = useMemo(() => {
    switch (timeRange) {
      case "12h":
        return 12;
      case "48h":
        return 48;
      case "24h":
      default:
        return 24;
    }
  }, [timeRange]);

  // Série filtrada pela janela temporal selecionada
  const windowedData = useMemo(() => {
    if (!selectedStation || !selectedStation.measurements.length) return [];
    const threshold = Date.now() - windowHours * 60 * 60 * 1000;
    return selectedStation.measurements.filter((m) => m.epoch >= threshold);
  }, [selectedStation, windowHours]);

  // Última e penúltima leitura
  const latestMeasure = useMemo(() => {
    if (!windowedData.length) return null;
    return windowedData[windowedData.length - 1];
  }, [windowedData]);

  const previousMeasure = useMemo(() => {
    if (windowedData.length < 2) return null;
    return windowedData[windowedData.length - 2];
  }, [windowedData]);

  const levelDelta = useMemo(() => {
    if (!latestMeasure || !previousMeasure) return 0;
    return latestMeasure.riverLevel - previousMeasure.riverLevel;
  }, [latestMeasure, previousMeasure]);

  // Dados processados para a Tabela de Consulta (RF10, RF11)
  const processedTableData = useMemo(() => {
    let list = [...windowedData];

    if (rainFilter === "rain") {
      list = list.filter((r) => r.precipitation > 0);
    } else if (rainFilter === "none") {
      list = list.filter((r) => r.precipitation === 0);
    }

    list.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (sortOrder === "asc") return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

    return list;
  }, [windowedData, rainFilter, sortField, sortOrder]);

  const totalPages = Math.ceil(processedTableData.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedTableData.slice(start, start + pageSize);
  }, [processedTableData, currentPage, pageSize]);

  // Resetar página ao mudar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStationId, timeRange, rainFilter]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 450);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-slate-800 antialiased font-sans flex flex-col selection:bg-[#e91e63] selection:text-white">

      {/* =========================================================================
          1. HEADER INSTITUCIONAL COGMO (ID VISUAL EXATA)
      ========================================================================= */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40 shadow-xs">
        {/* Banner de Aviso de Dados Fictícios */}
        <div className="bg-[#1d1841] text-slate-300 px-3 py-1 text-[11px] font-medium flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-amber-300">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <strong className="font-semibold">Ambiente Acadêmico:</strong> Dados simulados sem finalidade operacional.
            </span>
            <span className="hidden sm:inline text-slate-400 text-[10px]">
              UTC-3 (América/São Paulo)
            </span>
          </div>
        </div>

        {/* Barra de Navegação Principal */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          
          {/* Logo Cogmo Technology */}
          <div 
            onClick={() => setActiveTab("overview")}
            className="cursor-pointer flex flex-col leading-none select-none group"
          >
            <span className="text-2xl font-black text-[#1d1841] tracking-tight group-hover:text-[#e91e63] transition-colors">
              cogmo
            </span>
            <span className="text-[9px] tracking-widest text-[#1d1841]/70 font-semibold uppercase -mt-1 ml-4">
              technology
            </span>
          </div>

          {/* Menus Desktop (Abas) */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "overview"
                  ? "bg-[#1d1841] text-white shadow-sm"
                  : "text-slate-600 hover:text-[#1d1841] hover:bg-white/60"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Visão Geral
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "history"
                  ? "bg-[#1d1841] text-white shadow-sm"
                  : "text-slate-600 hover:text-[#1d1841] hover:bg-white/60"
              }`}
            >
              <ChartIcon className="w-3.5 h-3.5" />
              Histórico de Medições
            </button>

            <button
              onClick={() => setActiveTab("query")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "query"
                  ? "bg-[#1d1841] text-white shadow-sm"
                  : "text-slate-600 hover:text-[#1d1841] hover:bg-white/60"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              Consulta de Medições
            </button>
          </nav>

          {/* Botão de Ação Let's talk / Vamos Conversar + Hambúrguer Mobile */}
          <div className="flex items-center gap-2">
            <a
              href="mailto:contato@cogmo.com.br"
              className="bg-[#e91e63] hover:bg-[#d81b60] active:scale-95 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>Vamos Conversar?</span>
            </a>

            {/* Botão Hambúrguer Mobile */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-[#1d1841] hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Abrir Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-header Fixo Operacional: Seletor de Estação + Filtro 12/24/48h */}
        <div className="bg-slate-50 border-t border-slate-200/90 py-2 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
            
            {/* Seletor Customizado de Estação (RF01, RF02) */}
            <div className="relative flex-1 min-w-[210px] max-w-xs" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setStationDropdownOpen(!stationDropdownOpen)}
                className="w-full flex items-center justify-between bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-left shadow-xs transition-colors"
              >
                <div className="truncate">
                  <span className="font-bold text-[#1d1841] block truncate">{selectedStation.name}</span>
                  <span className="text-[10px] text-slate-500 truncate flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      selectedStation.status === 'Operando' ? 'bg-emerald-500' :
                      selectedStation.status === 'Alerta' ? 'bg-[#e91e63] animate-pulse' : 'bg-slate-400'
                    }`} />
                    {selectedStation.river} • {selectedStation.city}/{selectedStation.state}
                  </span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${stationDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {stationDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-full sm:w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                  {MOCK_STATIONS.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => {
                        setSelectedStationId(st.id);
                        setStationDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        st.id === selectedStationId ? "bg-pink-50/70 text-[#1d1841] font-bold" : "text-slate-700"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-semibold text-slate-800">{st.name}</div>
                        <div className="text-[10px] text-slate-500">{st.river} - {st.city}/{st.state}</div>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        st.status === 'Operando' ? 'bg-emerald-100 text-emerald-800' :
                        st.status === 'Alerta' ? 'bg-pink-100 text-[#e91e63]' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {st.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Controle de Janela Temporal (RF08) + Refresh */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">
                Janela:
              </span>
              <div className="inline-flex bg-white p-0.5 rounded-lg border border-slate-300 shadow-xs">
                {["12h", "24h", "48h"].map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                      timeRange === range
                        ? "bg-[#1d1841] text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                title="Atualizar leituras"
                className="p-1.5 bg-white hover:bg-slate-100 active:scale-95 border border-slate-300 rounded-lg text-slate-700 transition-all shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#e91e63]" : ""}`} />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* =========================================================================
          2. MENU MOBILE DRAWER (ESCURO #1d1841 CONFORME VÍDEO DA COGMO)
      ========================================================================= */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end md:hidden">
          {/* Overlay translúcido */}
          <div 
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
          />

          {/* Drawer Lateral */}
          <div className="relative w-72 bg-[#1d1841] text-white h-full shadow-2xl p-6 flex flex-col justify-between z-10 animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-white/10">
                <div className="flex flex-col leading-none">
                  <span className="text-2xl font-black text-white tracking-tight">cogmo</span>
                  <span className="text-[9px] tracking-widest text-pink-400 font-semibold uppercase -mt-1 ml-4">
                    technology
                  </span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-6 space-y-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-pink-400 px-3 mb-2">
                  Navegação do Dashboard
                </div>

                <button
                  onClick={() => {
                    setActiveTab("overview");
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === "overview" ? "bg-[#e91e63] text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4" /> Visão Geral
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                </button>

                <button
                  onClick={() => {
                    setActiveTab("history");
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === "history" ? "bg-[#e91e63] text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ChartIcon className="w-4 h-4" /> Histórico de Medições
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                </button>

                <button
                  onClick={() => {
                    setActiveTab("query");
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === "query" ? "bg-[#e91e63] text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <TableIcon className="w-4 h-4" /> Consulta de Medições
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                </button>
              </div>
            </div>

            {/* Contato Drawer (Conforme o vídeo) */}
            <div className="border-t border-white/10 pt-4 space-y-2">
              <div className="text-xs font-semibold text-white">Chat with us!</div>
              <div className="text-[11px] text-pink-400 font-mono">contato@cogmo.com.br</div>
              <div className="text-[10px] text-white/50 pt-2">
                Applied Artificial Intelligence &amp; Hydrological Solutions
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          3. CONTEÚDO PRINCIPAL (COM ALTERNÂNCIA DE PÁGINAS)
      ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">

        {/* PÁGINA 1: VISÃO GERAL */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            
            {/* Metadados da Estação Selecionada (RF03) */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#e91e63]">
                    Estação Hidrométrica
                  </span>
                  <h1 className="text-lg sm:text-xl font-black text-[#1d1841]">
                    {selectedStation.name}
                  </h1>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase flex items-center gap-1.5 ${
                    selectedStation.status === 'Operando' ? 'bg-emerald-100 text-emerald-800' :
                    selectedStation.status === 'Alerta' ? 'bg-pink-100 text-[#e91e63]' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      selectedStation.status === 'Operando' ? 'bg-emerald-500' :
                      selectedStation.status === 'Alerta' ? 'bg-[#e91e63]' : 'bg-slate-400'
                    }`} />
                    Status: {selectedStation.status}
                  </span>
                </div>
              </div>

              {/* Grid de Informações Geográficas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-100 rounded text-[#1d1841]">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-600 uppercase font-semibold block">Município / UF</span>
                    <strong className="text-slate-800">{selectedStation.city} - {selectedStation.state}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-100 rounded text-cyan-600">
                    <Waves className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-600 uppercase font-semibold block">Corpo Hídrico</span>
                    <strong className="text-slate-800">{selectedStation.river}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-100 rounded text-indigo-600">
                    <Droplets className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-600 uppercase font-semibold block">Bacia Hidrográfica</span>
                    <strong className="text-slate-800">{selectedStation.basin}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-pink-50 rounded text-[#e91e63]">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-600 uppercase font-semibold block">Cota de Alerta</span>
                    <strong className="text-[#e91e63] font-mono">{selectedStation.alertLevel.toFixed(2)} m</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Caso de Ausência de Dados (RF09) */}
            {windowedData.length === 0 ? (
              <EmptyStateNotice 
                stationName={selectedStation.name} 
                onSelectAlternative={() => setSelectedStationId("EST-01")} 
              />
            ) : (
              <>
                {/* Cards das Últimas Medições (RF04, RF05) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  
                  {/* Card Nível do Rio */}
                  <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs relative overflow-hidden flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-[#1d1841] flex items-center gap-1.5 uppercase tracking-wide">
                        <Waves className="w-4 h-4 text-cyan-600" /> Nível Atual do Rio (m)
                      </span>
                      {levelDelta > 0 ? (
                        <span className="text-[10px] font-bold text-[#e91e63] bg-pink-50 px-1.5 py-0.5 rounded">
                          +{levelDelta.toFixed(2)}m
                        </span>
                      ) : levelDelta < 0 ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          {levelDelta.toFixed(2)}m
                        </span>
                      ) : null}
                    </div>

                    <div className="my-3 flex items-baseline gap-1.5">
                      <span className={`text-4xl font-black font-mono tracking-tight ${
                        (latestMeasure?.riverLevel || 0) >= selectedStation.alertLevel ? "text-[#e91e63]" : "text-[#1d1841]"
                      }`}>
                        {latestMeasure?.riverLevel.toFixed(2)}
                      </span>
                      <span className="text-base font-bold text-slate-600">m</span>
                    </div>

                    <div className="text-[11px] text-slate-600 flex items-center justify-between pt-2 border-t border-slate-100">
                      <span>Horário: <strong>{latestMeasure?.hourFormatted}</strong> (BRT)</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        (latestMeasure?.riverLevel || 0) >= selectedStation.alertLevel
                          ? "bg-pink-100 text-[#e91e63]"
                          : "bg-emerald-50 text-emerald-800"
                      }`}>
                        {(latestMeasure?.riverLevel || 0) >= selectedStation.alertLevel ? "Cota de Alerta" : "Normal"}
                      </span>
                    </div>
                  </div>

                  {/* Card Precipitação */}
                  <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-[#1d1841] flex items-center gap-1.5 uppercase tracking-wide">
                        <CloudRain className="w-4 h-4 text-indigo-600" /> Precipitação Recente
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        (latestMeasure?.precipitation || 0) > 0 ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {(latestMeasure?.precipitation || 0) > 0 ? "Chuva Ativa" : "Sem Chuva"}
                      </span>
                    </div>

                    <div className="my-3 flex items-baseline gap-1.5">
                      <span className="text-4xl font-black font-mono tracking-tight text-[#1d1841]">
                        {latestMeasure?.precipitation.toFixed(1)}
                      </span>
                      <span className="text-base font-bold text-slate-600">mm/h</span>
                    </div>

                    <div className="text-[11px] text-slate-600 flex items-center justify-between pt-2 border-t border-slate-100">
                      <span>Horário: <strong>{latestMeasure?.hourFormatted}</strong> (BRT)</span>
                      <span className="text-slate-600">Acumulado Horário</span>
                    </div>
                  </div>

                  {/* Card Resumo do Sistema */}
                  <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between sm:col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-[#1d1841] flex items-center gap-1.5 uppercase tracking-wide">
                        <Activity className="w-4 h-4 text-pink-600" /> Diagnóstico Telemétrico
                      </span>
                      <span className="text-[10px] text-slate-600 font-mono">Janela {timeRange}</span>
                    </div>

                    <div className="my-2 space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Total de Leituras Válidas:</span>
                        <strong className="text-slate-800 font-mono">{windowedData.length} amostras</strong>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Fuso Registrado / Apresentado:</span>
                        <strong className="text-slate-800">UTC / BRT (UTC-3)</strong>
                      </div>
                    </div>

                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => setActiveTab("history")}
                        className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#1d1841] rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                      >
                        Ver Gráficos <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setActiveTab("query")}
                        className="flex-1 py-1.5 bg-pink-50 hover:bg-pink-100 text-[#e91e63] rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                      >
                        Ver Tabela <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>

                {/* Banner de Atalho para Gráficos */}
                <div className="bg-gradient-to-r from-[#1d1841] to-[#2b245e] text-white p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-pink-400" /> Monitoramento Contínuo de Séries
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Análise visual independente para cotas de cheia e precipitação acumulada nas últimas {timeRange}.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("history")}
                    className="bg-[#e91e63] hover:bg-[#d81b60] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
                  >
                    Acessar Histórico de Séries
                  </button>
                </div>
              </>
            )}

          </div>
        )}

        {/* PÁGINA 2: HISTÓRICO DE MEDIÇÕES (GRÁFICOS SEPARADOS RF06, RF07) */}
        {activeTab === "history" && (
          <div className="space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-[#1d1841]">
                  Histórico de Séries Temporais
                </h2>
                <p className="text-xs text-slate-600">
                  Estação <strong>{selectedStation.name}</strong> • Janela de {timeRange} ({windowedData.length} leituras)
                </p>
              </div>

              <div className="text-[11px] text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-600" />
                <span>Horários plotados em horário de Brasília <strong>(BRT / UTC-3)</strong></span>
              </div>
            </div>

            {windowedData.length === 0 ? (
              <EmptyStateNotice 
                stationName={selectedStation.name} 
                onSelectAlternative={() => setSelectedStationId("EST-01")} 
              />
            ) : (
              <div className="space-y-4">
                
                {/* GRÁFICO 1: NÍVEL DO RIO (ÁREA EM METROS - RF06) */}
                <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-cyan-50 text-cyan-700 rounded-lg">
                        <Waves className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-[#1d1841]">
                          Série Histórica do Nível do Rio (m)
                        </h3>
                        <span className="text-[10px] text-slate-600">Unidade: metros (m)</span>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono font-bold text-[#e91e63] bg-pink-50 border border-pink-200 px-2 py-0.5 rounded">
                      Cota Alerta: {selectedStation.alertLevel.toFixed(2)}m
                    </span>
                  </div>

                  <div className="w-full h-56 sm:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={windowedData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="cogmoRiverGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="hourFormatted"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                          tickFormatter={(v) => `${v}m`}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#1d1841",
                            borderRadius: "10px",
                            border: "none",
                            color: "#fff",
                            fontSize: "11px",
                            padding: "8px 12px"
                          }}
                          formatter={(v) => [`${v} m`, "Cota do Rio"]}
                          labelFormatter={(label) => `Horário Local: ${label} (BRT, UTC-3)`}
                        />
                        <Area
                          type="monotone"
                          dataKey="riverLevel"
                          stroke="#0284c7"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#cogmoRiverGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* GRÁFICO 2: PRECIPITAÇÃO (BARRAS EM MM/H - RF07 SEPARADO) */}
                <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
                        <CloudRain className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-[#1d1841]">
                          Histórico de Precipitação Pluviométrica (mm/h)
                        </h3>
                        <span className="text-[10px] text-slate-600">Unidade: milímetros por hora (mm/h)</span>
                      </div>
                    </div>

                    <span className="text-[10px] text-slate-600 font-mono bg-slate-100 px-2 py-0.5 rounded">
                      Chuva Horária
                    </span>
                  </div>

                  <div className="w-full h-48 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={windowedData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="hourFormatted"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                          tickFormatter={(v) => `${v}`}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#1d1841",
                            borderRadius: "10px",
                            border: "none",
                            color: "#fff",
                            fontSize: "11px",
                            padding: "8px 12px"
                          }}
                          formatter={(v) => [`${v} mm/h`, "Precipitação"]}
                          labelFormatter={(label) => `Horário Local: ${label} (BRT, UTC-3)`}
                        />
                        <Bar
                          dataKey="precipitation"
                          fill="#e91e63"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* PÁGINA 3: CONSULTA DE MEDIÇÕES (TABELA COMPLETA RF10, RF11) */}
        {activeTab === "query" && (
          <div className="space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-[#1d1841]">
                  Consulta Detalhada de Leituras
                </h2>
                <p className="text-xs text-slate-600">
                  Estação <strong>{selectedStation.name}</strong> • Total de registros filtrados: {processedTableData.length}
                </p>
              </div>

              {/* Filtros em Pílulas */}
              <div className="inline-flex bg-white p-1 rounded-xl border border-slate-200 shadow-xs self-start sm:self-auto text-xs">
                <button
                  onClick={() => setRainFilter("all")}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                    rainFilter === "all" ? "bg-[#1d1841] text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Todas
                </button>
                <button
                  onClick={() => setRainFilter("rain")}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                    rainFilter === "rain" ? "bg-[#e91e63] text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Com Chuva
                </button>
                <button
                  onClick={() => setRainFilter("none")}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                    rainFilter === "none" ? "bg-cyan-700 text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Sem Chuva
                </button>
              </div>
            </div>

            {windowedData.length === 0 ? (
              <EmptyStateNotice 
                stationName={selectedStation.name} 
                onSelectAlternative={() => setSelectedStationId("EST-01")} 
              />
            ) : (
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600 tracking-wider">
                        
                        {/* Data / Hora */}
                        <th
                          style={{ width: "35%" }}
                          onClick={() => handleSort("epoch")}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Data / Hora (BRT)</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </div>
                        </th>

                        {/* Nível (m) */}
                        <th
                          style={{ width: "35%" }}
                          onClick={() => handleSort("riverLevel")}
                          className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <span>Nível do Rio</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </div>
                        </th>

                        {/* Chuva (mm/h) */}
                        <th
                          style={{ width: "30%" }}
                          onClick={() => handleSort("precipitation")}
                          className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <span>Chuva (mm/h)</span>
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          </div>
                        </th>

                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {paginatedRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-slate-600">
                            Nenhum registro encontrado para o filtro selecionado.
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((row) => {
                          const isAlert = row.riverLevel >= selectedStation.alertLevel;
                          return (
                            <tr key={row.id} className="hover:bg-pink-50/20 transition-colors">
                              
                              {/* Data/Hora empilhada mobile-first */}
                              <td className="py-2 px-4">
                                <div className="leading-tight">
                                  <span className="font-bold text-slate-800 font-mono text-xs block">
                                    {row.hourFormatted}
                                  </span>
                                  <span className="text-[10px] text-slate-600 font-mono block">
                                    {row.dateFormatted}
                                  </span>
                                </div>
                              </td>

                              {/* Nível do Rio */}
                              <td className="py-2 px-4 text-right">
                                <div className="leading-tight">
                                  <span className={`font-bold font-mono text-xs block ${
                                    isAlert ? "text-[#e91e63]" : "text-[#1d1841]"
                                  }`}>
                                    {row.riverLevel.toFixed(2)} m
                                  </span>
                                  <span className={`text-[9px] font-bold px-1 rounded inline-block uppercase ${
                                    isAlert ? "bg-pink-100 text-[#e91e63]" : "text-slate-600"
                                  }`}>
                                    {isAlert ? "Alerta" : "Normal"}
                                  </span>
                                </div>
                              </td>

                              {/* Precipitação */}
                              <td className="py-2 px-4 text-right">
                                {row.precipitation > 0 ? (
                                  <span className="font-mono text-xs font-bold text-[#e91e63] bg-pink-50 px-2 py-0.5 rounded border border-pink-200">
                                    {row.precipitation.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="font-mono text-xs text-slate-600">0.0</span>
                                )}
                              </td>

                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginação da Tabela */}
                {totalPages > 1 && (
                  <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-500">
                      Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 font-semibold"
                      >
                        Anterior
                      </button>
                      <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 font-semibold"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </main>

      {/* =========================================================================
          4. RODAPÉ INSTITUCIONAL COGMO TECHNOLOGY
      ========================================================================= */}
      <footer className="bg-[#1d1841] text-white border-t border-slate-800 py-6 px-4 sm:px-6 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          
          <div className="flex flex-col leading-none">
            <span className="text-xl font-black text-white tracking-tight">cogmo</span>
            <span className="text-[8px] tracking-widest text-pink-400 font-semibold uppercase -mt-1 ml-3">
              technology
            </span>
          </div>

          <div className="text-xs text-slate-300 space-y-0.5">
            <p className="font-semibold text-white">Desafio Frontend de Monitoramento Hidrológico</p>
            <p className="text-[11px] text-slate-400">
              Transformando dados hidrológicos simulados em inteligência telemétrica. Fuso de exibição: UTC-3 (BRT).
            </p>
          </div>

          <div>
            <a
              href="mailto:contato@cogmo.com.br"
              className="text-xs font-bold text-pink-400 hover:text-pink-300 transition-colors flex items-center gap-1"
            >
              contato@cogmo.com.br <ExternalLink className="w-3 h-3" />
            </a>
          </div>

        </div>
      </footer>

    </div>
  );
}

// ============================================================================
// 5. COMPONENTE DE AUSÊNCIA DE DADOS (EMPTY STATE - RF09)
// ============================================================================
function EmptyStateNotice({ stationName, onSelectAlternative }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-8 sm:p-12 text-center shadow-xs my-4">
      <div className="w-12 h-12 bg-pink-50 text-[#e91e63] rounded-full flex items-center justify-center mx-auto mb-3">
        <Database className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-[#1d1841] mb-1">
        Nenhum registro telemétrico disponível
      </h3>
      <p className="text-xs text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
        A <strong>{stationName}</strong> encontra-se sem transmissões telemétricas armazenadas para esta janela de monitoramento (requisito RF09). Nenhuma medição fictícia adicional foi inventada.
      </p>
      <button
        onClick={onSelectAlternative}
        className="px-4 py-2 bg-[#1d1841] hover:bg-[#2b245e] text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
      >
        Alternar para Estação Foz do Vale
      </button>
    </div>
  );
}