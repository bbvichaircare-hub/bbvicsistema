import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator, Download, Percent, DollarSign, BarChart3, Receipt } from 'lucide-react';
import type { Invoice } from '@/types';

interface DadosImpostos { mes: string; totalVendas: number; totalTaxas: number; taxaMedia: number; quantidadeFaturas: number; }

export function RelatorioImpostos() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [dadosMensais, setDadosMensais] = useState<DadosImpostos[]>([]);
  const [totais, setTotais] = useState({ totalVendas:0, totalTaxas:0, taxaMedia:0, totalFaturas:0 });

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  useEffect(() => { fetchDados(); }, [ano]);

  const fetchDados = async () => {
    try {
      setLoading(true);
      const inicioAno = new Date(ano, 0, 1);
      const fimAno = new Date(ano, 11, 31, 23, 59, 59);
      const q = isAdmin
        ? query(collection(db,'invoices'), where('data_emissao','>=',Timestamp.fromDate(inicioAno)), where('data_emissao','<=',Timestamp.fromDate(fimAno)))
        : query(collection(db,'invoices'), where('vendedor_id','==',user?.uid));
      const snap = await getDocs(q);
      let invoices = snap.docs.map(d => ({ id:d.id,...d.data() })) as Invoice[];
      if (!isAdmin) invoices = invoices.filter(i => { const d = i.data_emissao?.toDate ? i.data_emissao.toDate() : new Date(i.data_emissao); return d>=inicioAno && d<=fimAno; });
      const dados: DadosImpostos[] = []; let tv=0,tt=0,tf=0;
      for (let m=0; m<12; m++) {
        const mes = invoices.filter(f => { const d = f.data_emissao?.toDate ? f.data_emissao.toDate() : new Date(f.data_emissao); return d.getMonth()===m; });
        const totalVendas = mes.reduce((a,f) => a+f.total, 0);
        const totalTaxas = mes.reduce((a,f) => a+(f.taxa||0), 0);
        dados.push({ mes:meses[m], totalVendas, totalTaxas, taxaMedia:totalVendas>0?(totalTaxas/totalVendas)*100:0, quantidadeFaturas:mes.length });
        tv+=totalVendas; tt+=totalTaxas; tf+=mes.length;
      }
      setDadosMensais(dados);
      setTotais({ totalVendas:tv, totalTaxas:tt, taxaMedia:tv>0?(tt/tv)*100:0, totalFaturas:tf });
    } catch { toast.error('Erro ao carregar relatório de impostos'); }
    finally { setLoading(false); }
  };

  const handleExportCSV = () => {
    const csv = [['Mês','Total Vendas','Total Taxas','Taxa Média %','Qtd Faturas'], ...dadosMensais.map(d=>[d.mes,d.totalVendas.toFixed(2),d.totalTaxas.toFixed(2),d.taxaMedia.toFixed(2),d.quantidadeFaturas.toString()]), ['TOTAL',totais.totalVendas.toFixed(2),totais.totalTaxas.toFixed(2),totais.taxaMedia.toFixed(2),totais.totalFaturas.toString()]]
      .map(r=>r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = `impostos-${ano}.csv`; a.click();
    toast.success('Exportado!');
  };

  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-[#6F2738] border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/relatorios')} className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><ArrowLeft className="w-5 h-5"/></button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Relatório de Impostos</h1>
            <p className="text-gray-500 text-sm">Análise de taxas e impostos coletados</p>
          </div>
        </div>
        <div className="flex gap-3">
          <select value={ano} onChange={e => setAno(parseInt(e.target.value))} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-[#6F2738]">
            {[2023,2024,2025,2026].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700">
            <Download className="w-4 h-4"/> Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total Vendas', val:formatCurrency(totais.totalVendas), icon:DollarSign, cls:'bg-green-100 text-green-600' },
          { label:'Total Taxas', val:formatCurrency(totais.totalTaxas), icon:Calculator, cls:'bg-purple-100 text-purple-600' },
          { label:'Taxa Média', val:`${totais.taxaMedia.toFixed(2)}%`, icon:Percent, cls:'bg-blue-100 text-blue-600' },
          { label:'Total Faturas', val:String(totais.totalFaturas), icon:Receipt, cls:'bg-[#6F2738]/15 text-[#6F2738]' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.cls}`}><c.icon className="w-4 h-4"/></div></div>
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{c.val}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-[#6F2738]"/><h2 className="font-semibold text-gray-900">Resumo Mensal</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Mês</th>
                <th className="px-5 py-3 font-medium text-right">Faturas</th>
                <th className="px-5 py-3 font-medium text-right">Total Vendas</th>
                <th className="px-5 py-3 font-medium text-right">Total Taxas</th>
                <th className="px-5 py-3 font-medium text-right">Taxa Média</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dadosMensais.map((d,i) => (
                <tr key={i} className={`hover:bg-gray-50 ${d.totalVendas===0?'opacity-50':''}`}>
                  <td className="px-5 py-3 font-medium text-gray-900">{d.mes}</td>
                  <td className="px-5 py-3 text-right text-gray-500">{d.quantidadeFaturas}</td>
                  <td className="px-5 py-3 text-right font-medium text-green-600">{formatCurrency(d.totalVendas)}</td>
                  <td className="px-5 py-3 text-right text-purple-600">{formatCurrency(d.totalTaxas)}</td>
                  <td className="px-5 py-3 text-right text-blue-600">{d.taxaMedia.toFixed(2)}%</td>
                </tr>
              ))}
              <tr className="bg-[#6F2738]/5 font-semibold border-t-2 border-[#6F2738]/20">
                <td className="px-5 py-3 text-gray-900">TOTAL</td>
                <td className="px-5 py-3 text-right text-gray-700">{totais.totalFaturas}</td>
                <td className="px-5 py-3 text-right text-green-600">{formatCurrency(totais.totalVendas)}</td>
                <td className="px-5 py-3 text-right text-purple-600">{formatCurrency(totais.totalTaxas)}</td>
                <td className="px-5 py-3 text-right text-blue-600">{totais.taxaMedia.toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2"><Calculator className="w-4 h-4 text-amber-700"/><h3 className="font-semibold text-amber-800">Taxa padrão configurada: 6.25%</h3></div>
        <p className="text-amber-700 text-sm">A taxa é calculada automaticamente sobre o subtotal de cada fatura. Você pode alterar nas Configurações.</p>
      </div>
    </div>
  );
}
