import React, { useEffect, useMemo, useState } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  BarChart3,
  LogOut,
  Lock,
  ShieldCheck,
  Target,
} from 'lucide-react';

const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

const ALLOWED_EMAILS = [
  'gerencia@maritex.cl',
  'finanzas@maritex.cl',
  'comercial@maritex.cl',
];

const MESES_NOMBRES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const METAS_MENSUALES = {
  enero: { venta: 1514000000, margen: 503367000, rentabilidad: 33.2 },
  febrero: { venta: 1489000000, margen: 491883000, rentabilidad: 33.0 },
  marzo: { venta: 1935000000, margen: 641791000, rentabilidad: 33.2 },
  abril: { venta: 2182000000, margen: 724859000, rentabilidad: 33.2 },
  mayo: { venta: 2022000000, margen: 675059000, rentabilidad: 33.4 },
  junio: { venta: 1657000000, margen: 554167000, rentabilidad: 33.4 },
  julio: { venta: 1272000000, margen: 425939000, rentabilidad: 33.5 },
  agosto: { venta: 1230000000, margen: 411747000, rentabilidad: 33.5 },
  septiembre: { venta: 1347000000, margen: 446057000, rentabilidad: 33.1 },
  octubre: { venta: 1720000000, margen: 573899000, rentabilidad: 33.4 },
  noviembre: { venta: 1800000000, margen: 600591000, rentabilidad: 33.4 },
  diciembre: { venta: 1332000000, margen: 444641000, rentabilidad: 33.4 },
};

const App = () => {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [detectedEmail, setDetectedEmail] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [salesData, setSalesData] = useState([]);
  const [selectedAno, setSelectedAno] = useState('');
  const [selectedMes, setSelectedMes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || accounts.length === 0) {
      setUser(null);
      return;
    }

    const activeAccount = accounts[0];
    const claims = activeAccount.idTokenClaims || {};
    const candidateEmails = [
      activeAccount.username,
      claims.email,
      claims.preferred_username,
      ...(Array.isArray(claims.emails) ? claims.emails : []),
      claims.upn,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase().trim());
    const uniqueCandidates = [...new Set(candidateEmails)];
    const allowedEmail = uniqueCandidates.find((email) => ALLOWED_EMAILS.includes(email));
    const primaryEmail = uniqueCandidates[0] || '';
    setDetectedEmail(primaryEmail);

    if (allowedEmail) {
      setUser({
        email: allowedEmail,
        name: activeAccount.name || allowedEmail,
      });
      setAuthError(null);
      return;
    }

    setUser(null);
    setAuthError('Acceso Denegado: Su cuenta no esta autorizada para ver este dashboard.');
    instance.logoutPopup().catch(() => {
      // no-op
    });
  }, [accounts, instance, isAuthenticated]);

  const handleLogin = async () => {
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      await instance.loginPopup(loginRequest);
    } catch (e) {
      setAuthError('Error de conexion con Microsoft Entra ID.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    setUser(null);
    setSalesData([]);
    await instance.logoutPopup();
  };

  const formatMoney = (val) => Math.round(val).toLocaleString('es-CL');
  const formatPct = (val) => val.toFixed(2);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
        const separator = lines[0].includes(';') ? ';' : ',';
        const processed = lines
          .slice(1)
          .map((line) => {
            const values = line.split(separator).map((v) => v.trim().replace(/"/g, ''));
            const parseContable = (v) => {
              if (!v) return 0;
              let clean = v.replace(/\s/g, '');
              clean = clean.includes('.') && clean.includes(',')
                ? clean.replace(/\./g, '').replace(',', '.')
                : clean.replace(',', '.');
              return parseFloat(clean) || 0;
            };
            const periodoStr = values[0]?.split('.')[0] || '';
            return {
              ano: periodoStr.substring(0, 4),
              mes: MESES_NOMBRES[parseInt(periodoStr.substring(4, 6), 10) - 1] || '',
              vendedor: values[27] || 'Sin Vendedor',
              cliente: values[26] || 'Sin Cliente',
              neto: parseContable(values[32]),
              costo: parseContable(values[34]),
              marca: values[111]?.toUpperCase().includes('MARITEX')
                ? 'MARITEX'
                : (values[111]?.toUpperCase().includes('NOLK') ? 'NOLK' : 'OTRO'),
            };
          })
          .filter((r) => r.ano && (r.neto !== 0 || r.costo !== 0));

        setSalesData(processed);
        const anos = [...new Set(processed.map((d) => d.ano))].sort().reverse();
        setSelectedAno(anos[0]);
        setSelectedMes(processed[0]?.mes || 'enero');
      } catch (err) {
        setError('Error al procesar el archivo CSV.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  const filtered = useMemo(
    () => salesData.filter((d) => d.ano === selectedAno && d.mes === selectedMes),
    [salesData, selectedAno, selectedMes]
  );

  const stats = useMemo(() => {
    const n = filtered.reduce((a, b) => a + b.neto, 0);
    const c = filtered.reduce((a, b) => a + b.costo, 0);
    return { neto: n, costo: c, margen: n - c, pct: n !== 0 ? ((n - c) / n) * 100 : 0 };
  }, [filtered]);

  const metaActual = METAS_MENSUALES[selectedMes] || METAS_MENSUALES.enero;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-10 text-center">
          <div className="bg-[#E30613] w-20 h-20 rounded-3xl shadow-xl shadow-red-100 flex items-center justify-center mx-auto mb-8">
            <Lock className="text-white" size={40} />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900 mb-2">Acceso Seguro</h1>
          <p className="text-slate-400 text-sm font-medium mb-10 leading-relaxed">
            Identifiquese con su cuenta de Maritex para acceder a los indicadores financieros.
          </p>

          {authError && (
            <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 text-xs font-bold text-left">
              <AlertCircle size={18} className="shrink-0" />
              <span>
                {authError}
                {detectedEmail ? ` Correo detectado: ${detectedEmail}` : ''}
              </span>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={isAuthenticating}
            className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 shadow-xl shadow-slate-200"
          >
            {isAuthenticating ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
            Entrar con Microsoft Azure
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900">
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-[#E30613] p-2.5 rounded-xl">
            <BarChart3 className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter text-slate-900 leading-none">Maritex Analytics</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Usuario: {user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {salesData.length > 0 && (
            <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              <select
                value={selectedAno}
                onChange={(e) => setSelectedAno(e.target.value)}
                className="bg-white border-none rounded-lg px-3 py-1.5 text-xs font-black uppercase"
              >
                {[...new Set(salesData.map((d) => d.ano))].sort().reverse().map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select
                value={selectedMes}
                onChange={(e) => setSelectedMes(e.target.value)}
                className="bg-white border-none rounded-lg px-3 py-1.5 text-xs font-black uppercase"
              >
                {MESES_NOMBRES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          <label className="bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase cursor-pointer transition-all flex items-center gap-2 shadow-lg shadow-slate-100">
            <Upload size={16} /> Cargar Datos
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>

          <button
            onClick={handleLogout}
            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
            title="Cerrar Sesion"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <div className="p-8 max-w-7xl mx-auto">
        {isProcessing ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="animate-spin text-[#E30613] mb-4" size={48} />
            <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Procesando registros...</p>
          </div>
        ) : salesData.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-[3rem] p-24 text-center">
            <FileSpreadsheet className="text-slate-200 mx-auto mb-6" size={80} />
            <h2 className="text-2xl font-black uppercase text-slate-800 mb-4">Portal de Gestion Maritex</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-10 leading-relaxed">Por favor, cargue el reporte de ventas en formato CSV para visualizar el analisis financiero.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {error && <p className="text-red-600 text-sm font-bold">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Venta Neta</p>
                <h3 className="text-2xl font-black text-slate-900">${formatMoney(stats.neto)}</h3>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Costo Total</p>
                <h3 className="text-2xl font-black text-slate-900">${formatMoney(stats.costo)}</h3>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 border-b-4 border-b-red-600">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Margen Bruto</p>
                <h3 className="text-2xl font-black text-[#E30613]">${formatMoney(stats.margen)}</h3>
              </div>
              <div className="bg-slate-900 p-6 rounded-[2rem] shadow-xl text-white">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Rentabilidad %</p>
                <h3 className="text-3xl font-black text-white">{formatPct(stats.pct)}%</h3>
              </div>
            </div>

            <div className="border-[3px] border-slate-900 bg-white p-8 rounded-[2rem] shadow-xl">
              <h4 className="text-[13px] font-black uppercase tracking-widest text-slate-900 mb-6 flex items-center gap-2">
                <Target size={18} className="text-[#E30613]" /> Meta de {selectedMes} {selectedAno}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Venta vs Meta</p>
                  <div className="flex items-end gap-3 mb-2">
                    <span className="text-2xl font-black text-slate-900">${formatMoney(stats.neto)}</span>
                    <span className="text-xs font-bold text-slate-400 mb-1">/ ${formatMoney(metaActual.venta)}</span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.min((stats.neto / metaActual.venta) * 100, 100)}%` }} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 mt-2 text-right">{formatPct((stats.neto / metaActual.venta) * 100)}% de avance</p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Margen vs Meta</p>
                  <div className="flex items-end gap-3 mb-2">
                    <span className="text-2xl font-black text-slate-900">${formatMoney(stats.margen)}</span>
                    <span className="text-xs font-bold text-slate-400 mb-1">/ ${formatMoney(metaActual.margen)}</span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.min((stats.margen / metaActual.margen) * 100, 100)}%` }} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 mt-2 text-right">{formatPct((stats.margen / metaActual.margen) * 100)}% de avance</p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Rentabilidad Meta</p>
                  <div className="flex items-end gap-3 mb-2">
                    <span className="text-2xl font-black text-[#E30613]">{formatPct(stats.pct)}%</span>
                    <span className="text-xs font-bold text-slate-400 mb-1">/ {formatPct(metaActual.rentabilidad)}%</span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${stats.pct >= metaActual.rentabilidad ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: '100%' }} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 mt-2 text-right">{stats.pct >= metaActual.rentabilidad ? 'Meta Lograda' : 'Bajo Meta'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
