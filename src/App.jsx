import React, { useEffect, useMemo, useState } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Briefcase,
  ChevronRight,
  ShieldCheck,
  ArrowLeft,
  ArrowUpDown,
  Tag,
  LogOut,
  Lock,
} from 'lucide-react';

const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

const ALLOWED_EMAILS = [
  'gerencia@maritex.cl',
  'finanzas@maritex.cl',
  'comercial@maritex.cl',
  'matiaschomali@grupomaritex.cl',
];

const MESES_NOMBRES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const METAS_MENSUALES = {
  enero: { venta: 1514000000, margen: 503367000, rentabilidad: 33.20 },
  febrero: { venta: 1489000000, margen: 491883000, rentabilidad: 33.00 },
  marzo: { venta: 1935000000, margen: 641791000, rentabilidad: 33.20 },
  abril: { venta: 2182000000, margen: 724859000, rentabilidad: 33.20 },
  mayo: { venta: 2022000000, margen: 675059000, rentabilidad: 33.40 },
  junio: { venta: 1657000000, margen: 554167000, rentabilidad: 33.40 },
  julio: { venta: 1272000000, margen: 425939000, rentabilidad: 33.50 },
  agosto: { venta: 1230000000, margen: 411747000, rentabilidad: 33.50 },
  septiembre: { venta: 1347000000, margen: 446057000, rentabilidad: 33.10 },
  octubre: { venta: 1720000000, margen: 573899000, rentabilidad: 33.40 },
  noviembre: { venta: 1800000000, margen: 600591000, rentabilidad: 33.40 },
  diciembre: { venta: 1332000000, margen: 444641000, rentabilidad: 33.40 },
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
  const [currentView, setCurrentView] = useState('main');
  const [sortConfig, setSortConfig] = useState({ key: 'neto', direction: 'desc' });

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
  const formatPct = (val) => `${(val || 0).toFixed(1)}%`;

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
        const processed = lines.slice(1).map((line) => {
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
          const rawMarca = (values[111] || '').toUpperCase();
          let marcaFinal = 'OTRO';
          if (['MARITEX', 'MTX', 'VICSA'].some((m) => rawMarca.includes(m))) marcaFinal = 'MARITEX';
          else if (['NOLK', 'NO'].some((m) => rawMarca === m || rawMarca.startsWith('NOLK'))) marcaFinal = 'NOLK';

          return {
            ano: periodoStr.substring(0, 4),
            mes: MESES_NOMBRES[parseInt(periodoStr.substring(4, 6), 10) - 1] || '',
            numMes: parseInt(periodoStr.substring(4, 6), 10),
            cliente: values[26] || 'Sin Cliente',
            vendedor: values[27] || 'Sin Vendedor',
            producto: values[8] || 'Sin Producto',
            neto: parseContable(values[32]),
            costo: parseContable(values[34]),
            marca: marcaFinal,
          };
        }).filter((r) => r.ano && (r.neto !== 0 || r.costo !== 0));

        setSalesData(processed);
        const anos = [...new Set(processed.map((d) => d.ano))].sort().reverse();
        setSelectedAno(anos[0] || '');
        setSelectedMes(processed[0]?.mes || 'marzo');
      } catch (err) {
        setError('Error al procesar el reporte.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  const dataFiltrada = useMemo(
    () => salesData.filter((d) => d.ano === selectedAno && d.mes === selectedMes),
    [salesData, selectedAno, selectedMes]
  );

  const dataAcumulada = useMemo(() => {
    const numMesActual = MESES_NOMBRES.indexOf(selectedMes) + 1;
    return salesData.filter((d) => d.ano === selectedAno && d.numMes <= numMesActual);
  }, [salesData, selectedAno, selectedMes]);

  const getStats = (dataset) => {
    const n = dataset.reduce((a, b) => a + b.neto, 0);
    const c = dataset.reduce((a, b) => a + b.costo, 0);
    return { neto: n, costo: c, margen: n - c, rent: n !== 0 ? ((n - c) / n) * 100 : 0 };
  };

  const mainStats = useMemo(() => getStats(dataFiltrada), [dataFiltrada]);
  const ytdStats = useMemo(() => getStats(dataAcumulada), [dataAcumulada]);
  const metaActual = METAS_MENSUALES[selectedMes] || { venta: 0, margen: 0, rentabilidad: 0 };

  const groupData = (dataset, key) => {
    const map = {};
    dataset.forEach((d) => {
      if (!map[d[key]]) map[d[key]] = { neto: 0, costo: 0 };
      map[d[key]].neto += d.neto;
      map[d[key]].costo += d.costo;
    });
    const list = Object.entries(map).map(([name, v]) => ({
      name,
      neto: v.neto,
      margen: v.neto - v.costo,
      rent: v.neto !== 0 ? ((v.neto - v.costo) / v.neto) * 100 : 0,
    }));
    return list.sort((a, b) => {
      const field = sortConfig.key;
      return sortConfig.direction === 'desc' ? b[field] - a[field] : a[field] - b[field];
    });
  };

  const sortTable = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const Header = () => (
    <nav className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-40">
      <div className="flex items-center gap-4 cursor-pointer" onClick={() => setCurrentView('main')}>
        <div className="bg-[#E30613] p-2 rounded-xl"><BarChart3 className="text-white" size={24} /></div>
        <div>
          <h1 className="text-lg font-black uppercase tracking-tighter">Maritex Analytics</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Usuario: {user?.email}</p>
        </div>
      </div>
      <div className="flex gap-4 items-center">
        <select value={selectedAno} onChange={(e) => setSelectedAno(e.target.value)} className="bg-slate-100 border-none rounded-lg px-3 py-2 text-xs font-bold uppercase">
          {[...new Set(salesData.map((d) => d.ano))].sort().reverse().map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={selectedMes} onChange={(e) => setSelectedMes(e.target.value)} className="bg-slate-100 border-none rounded-lg px-3 py-2 text-xs font-bold uppercase">
          {MESES_NOMBRES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {currentView === 'main' && (
          <label className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase cursor-pointer flex items-center gap-2">
            <Upload size={14} /> Subir CSV <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>
        )}
        <button onClick={handleLogout} className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Cerrar sesion">
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );

  const TableHeader = ({ label, sortKey }) => (
    <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => sortTable(sortKey)}>
      <div className="flex items-center justify-end gap-2 text-right">
        {label} <ArrowUpDown size={12} className="text-slate-400" />
      </div>
    </th>
  );

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

  if (isProcessing) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-[#E30613]" size={48} /></div>;

  if (salesData.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-10 text-center">
        <FileSpreadsheet className="text-slate-200 mb-6" size={80} />
        <h2 className="text-2xl font-black uppercase text-slate-800 mb-4">Dashboard de Ventas</h2>
        <label className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase cursor-pointer hover:scale-105 transition-transform">
          Cargar Archivo Maritex <input type="file" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>
    );
  }

  if (currentView === 'finance') {
    const monthlyData = MESES_NOMBRES.slice(0, MESES_NOMBRES.indexOf(selectedMes) + 1).map((m) => {
      const monthStats = getStats(salesData.filter((d) => d.ano === selectedAno && d.mes === m));
      return { month: m, ...monthStats };
    });

    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="p-8 max-w-6xl mx-auto space-y-8">
          <button onClick={() => setCurrentView('main')} className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 hover:text-slate-900"><ArrowLeft size={16} /> Volver</button>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Analisis Acumulado (YTD) {selectedAno}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border-b-4 border-blue-500"><p className="text-[10px] font-black uppercase text-slate-400 mb-2">Venta Acum.</p><h3 className="text-xl font-black">${formatMoney(ytdStats.neto)}</h3></div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border-b-4 border-slate-300"><p className="text-[10px] font-black uppercase text-slate-400 mb-2">Costo Acum.</p><h3 className="text-xl font-black">${formatMoney(ytdStats.costo)}</h3></div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border-b-4 border-[#E30613]"><p className="text-[10px] font-black uppercase text-slate-400 mb-2">Margen Acum.</p><h3 className="text-xl font-black text-[#E30613]">${formatMoney(ytdStats.margen)}</h3></div>
            <div className="bg-slate-900 p-6 rounded-3xl shadow-xl text-white"><p className="text-[10px] font-black uppercase text-slate-500 mb-2">Rentabilidad</p><h3 className="text-xl font-black">{formatPct(ytdStats.rent)}</h3></div>
          </div>
          <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                <tr><th className="px-6 py-4">Mes</th><th className="px-6 py-4 text-right">Venta</th><th className="px-6 py-4 text-right">Margen</th><th className="px-6 py-4 text-right">Rent.</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyData.map((m, i) => (
                  <tr key={i} className="text-xs font-bold uppercase">
                    <td className="px-6 py-4 font-black">{m.month}</td>
                    <td className="px-6 py-4 text-right">${formatMoney(m.neto)}</td>
                    <td className="px-6 py-4 text-right text-[#E30613]">${formatMoney(m.margen)}</td>
                    <td className="px-6 py-4 text-right">{formatPct(m.rent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'sellers' || currentView === 'clients') {
    const list = groupData(dataFiltrada, currentView === 'sellers' ? 'vendedor' : 'cliente');
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="p-8 max-w-6xl mx-auto space-y-6">
          <button onClick={() => setCurrentView('main')} className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 hover:text-slate-900"><ArrowLeft size={16} /> Volver al Panel</button>
          <div className="bg-white rounded-[2.5rem] shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-black uppercase tracking-tight">{currentView === 'sellers' ? 'Reporte por Vendedor' : 'Reporte por Cliente'}</h2>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedMes} {selectedAno}</div>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">{currentView === 'sellers' ? 'Vendedor' : 'Cliente'}</th>
                  <TableHeader label="Venta Neta" sortKey="neto" />
                  <TableHeader label="Margen Bruto" sortKey="margen" />
                  <TableHeader label="Rentabilidad" sortKey="rent" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors text-xs font-bold uppercase">
                    <td className="px-6 py-4 font-black truncate max-w-[250px]">{item.name}</td>
                    <td className="px-6 py-4 text-right font-mono">${formatMoney(item.neto)}</td>
                    <td className="px-6 py-4 text-right text-[#E30613] font-mono">${formatMoney(item.margen)}</td>
                    <td className="px-6 py-4 text-right font-black">{formatPct(item.rent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'brands') {
    const brandGroups = groupData(dataFiltrada, 'marca');
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="p-8 max-w-6xl mx-auto space-y-8">
          <button onClick={() => setCurrentView('main')} className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 hover:text-slate-900"><ArrowLeft size={16} /> Volver</button>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Productos mas vendidos por Marca</h2>
          {brandGroups.map((b, i) => {
            const products = groupData(dataFiltrada.filter((d) => d.marca === b.name), 'producto');
            return (
              <div key={i} className="bg-white rounded-[2rem] shadow-sm overflow-hidden border border-slate-100">
                <div className="bg-slate-900 p-6 flex justify-between items-center">
                  <h3 className="text-white font-black uppercase tracking-widest">{b.name}</h3>
                  <div className="flex gap-6 text-[10px] font-black text-slate-400 uppercase">
                    <span>Venta: ${formatMoney(b.neto)}</span>
                    <span className="text-[#E30613]">Margen: ${formatMoney(b.margen)}</span>
                    <span className="text-white">Rent: {formatPct(b.rent)}</span>
                  </div>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400">
                    <tr><th className="px-6 py-3">Producto</th><th className="px-6 py-3 text-right">Venta</th><th className="px-6 py-3 text-right">Margen</th><th className="px-6 py-3 text-right">Rent.</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {products.slice(0, 20).map((p, pi) => (
                      <tr key={pi} className="text-[11px] font-bold uppercase hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 truncate max-w-xs">{p.name}</td>
                        <td className="px-6 py-3 text-right font-mono">${formatMoney(p.neto)}</td>
                        <td className="px-6 py-3 text-right text-[#E30613] font-mono">${formatMoney(p.margen)}</td>
                        <td className="px-6 py-3 text-right">{formatPct(p.rent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header />
      <div className="p-8 max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
        {error && <p className="text-red-600 text-sm font-bold">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Venta Neta', val: `$${formatMoney(mainStats.neto)}`, icon: <TrendingUp size={20} />, border: 'border-blue-500', target: metaActual.venta },
            { label: 'Costo Venta', val: `$${formatMoney(mainStats.costo)}`, icon: <DollarSign size={20} />, border: 'border-slate-300' },
            { label: 'Margen Bruto', val: `$${formatMoney(mainStats.margen)}`, icon: <BarChart3 size={20} className="text-[#E30613]" />, border: 'border-[#E30613]', target: metaActual.margen },
            { label: 'Rentabilidad', val: formatPct(mainStats.rent), icon: <ShieldCheck size={20} />, border: 'bg-slate-900 text-white' },
          ].map((kpi, i) => (
            <div
              key={i}
              onClick={() => setCurrentView('finance')}
              className={`p-8 rounded-[2rem] shadow-sm cursor-pointer hover:scale-[1.02] transition-all relative overflow-hidden flex flex-col justify-between ${
                kpi.label === 'Rentabilidad' ? 'bg-slate-900 border-none ring-4 ring-slate-800 shadow-xl' : `bg-white border ${kpi.border}`
              }`}
            >
              <div className="flex justify-between items-center mb-4">
                <p className={`text-[10px] font-black uppercase tracking-widest ${kpi.label === 'Rentabilidad' ? 'text-slate-500' : 'text-slate-400'}`}>
                  {kpi.label}
                </p>
                <div className={kpi.label === 'Rentabilidad' ? 'text-[#E30613]' : 'opacity-60 text-slate-400'}>
                  {kpi.icon}
                </div>
              </div>

              <div>
                <h3 className={`font-black tracking-tighter ${kpi.label === 'Rentabilidad' ? 'text-5xl text-white mb-6' : 'text-2xl text-slate-900'}`}>
                  {kpi.label === 'Rentabilidad' ? formatPct(mainStats.rent) : kpi.val}
                </h3>

                {kpi.label === 'Rentabilidad' && (
                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">REAL</span>
                      <span className="text-xs font-black text-white px-2 py-0.5 bg-slate-800 rounded">ACTUAL</span>
                    </div>
                    {metaActual.rentabilidad > 0 && (
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">OBJETIVO</span>
                        <span className="text-sm font-bold text-slate-400">{metaActual.rentabilidad.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {kpi.target > 0 && kpi.label !== 'Rentabilidad' && (
                <div className="mt-4 space-y-1">
                  <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                    <span>Avance Meta</span>
                    <span>{formatPct(((i === 0 ? mainStats.neto : mainStats.margen) / kpi.target) * 100)}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full ${i === 0 ? 'bg-blue-500' : 'bg-red-600'}`} style={{ width: `${Math.min(((i === 0 ? mainStats.neto : mainStats.margen) / kpi.target) * 100, 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setCurrentView('sellers')}>
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Briefcase size={16} /> Venta por Vendedor</h4>
              <ChevronRight size={16} className="text-slate-500" />
            </div>
            <div className="p-8 space-y-4">
              {groupData(dataFiltrada, 'vendedor').slice(0, 5).map((v, i) => (
                <div key={i} className="flex justify-between items-center border-b border-slate-50 pb-3">
                  <p className="text-xs font-black uppercase text-slate-700 truncate w-40">{v.name}</p>
                  <div className="text-right">
                    <p className="text-xs font-black font-mono">${formatMoney(v.neto)}</p>
                    <p className="text-[9px] font-bold text-[#E30613]">{formatPct(v.rent)} Rent.</p>
                  </div>
                </div>
              ))}
              <p className="text-center text-[9px] font-black uppercase text-slate-400 pt-2">Ver todos</p>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setCurrentView('clients')}>
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Users size={16} /> Venta por Cliente</h4>
              <ChevronRight size={16} className="text-slate-500" />
            </div>
            <div className="p-8 space-y-4">
              {groupData(dataFiltrada, 'cliente').slice(0, 5).map((c, i) => (
                <div key={i} className="flex justify-between items-center border-b border-slate-50 pb-3">
                  <p className="text-xs font-black uppercase text-slate-700 truncate w-48">{c.name}</p>
                  <div className="text-right">
                    <p className="text-xs font-black font-mono">${formatMoney(c.neto)}</p>
                    <p className="text-[9px] font-bold text-blue-600">{formatPct(c.rent)} Rent.</p>
                  </div>
                </div>
              ))}
              <p className="text-center text-[9px] font-black uppercase text-slate-400 pt-2">Ver todos</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setCurrentView('brands')}>
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-white">
            <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Tag size={16} /> Distribucion por Marca</h4>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1">DETALLE <ChevronRight size={10} /></span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {groupData(dataFiltrada, 'marca').map((m, i) => (
              <div key={i} className="p-8 hover:bg-slate-50 transition-colors">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-tighter">{m.name}</p>
                <h3 className="text-2xl font-black mb-1 font-mono">${formatMoney(m.neto)}</h3>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-[#E30613]">M: ${formatMoney(m.margen)}</span>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-md ${m.rent >= (METAS_MENSUALES[selectedMes]?.rentabilidad || 0) ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {formatPct(m.rent)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
