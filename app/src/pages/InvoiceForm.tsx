import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  collection, getDocs, addDoc, doc, getDoc,
  Timestamp, updateDoc, query, where
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Search, X, Send, Save, ArrowLeft, Plus, Minus, FileDown } from 'lucide-react';
import { gerarPDFFatura } from '@/lib/pdfUtils';
import type { Cliente, Produto, DocumentItem, Invoice } from '@/types';

interface VendedorOpt { uid: string; nome: string; comissao_percentual?: number }

const PAYMENT_TERMS = [
  { label: 'Vencimento Imediato', days: 0 },
  { label: 'Net 7 dias', days: 7 },
  { label: 'Net 15 dias', days: 15 },
  { label: 'Net 30 dias', days: 30 },
  { label: 'Net 45 dias', days: 45 },
  { label: 'Net 60 dias', days: 60 },
  { label: 'Personalizado', days: -1 },
];

function openWhatsApp(url: string) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

async function registrarMovimentosVenda(items: any[]) {
  try {
    const { collection: col, addDoc: add, doc: d, updateDoc: up, Timestamp: T, getDoc: gdc } = await import('firebase/firestore');
    const { db: database } = await import('@/lib/firebase');
    for (const item of items) {
      if (!item.produto_id) continue;
      try {
        const prodSnap = await gdc(d(database, 'produtos', item.produto_id));
        if (!prodSnap.exists()) continue;
        const prod = prodSnap.data();
        const qtd = item.quantidade || 1;
        const estoque_antes = prod.estoque || 0;
        const estoque_depois = Math.max(0, estoque_antes - qtd);
        await up(d(database, 'produtos', item.produto_id), { estoque: estoque_depois });
        await add(col(database, 'movimentos_estoque'), {
          produto_id: item.produto_id,
          produto_nome: item.produto_nome || prod.nome,
          tipo: 'venda',
          quantidade: qtd,
          estoque_antes,
          estoque_depois,
          observacao: `Venda via fatura`,
          created_at: T.now(),
        });
      } catch(e) { console.error('Erro movimento venda:', e); }
    }
  } catch(e) { console.error('Erro registrar movimentos:', e); }
}

export function InvoiceForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, isAdmin, getVendedores } = useAuth();
  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [vendedores, setVendedores] = useState<VendedorOpt[]>([]);
  const [searchCliente, setSearchCliente] = useState('');
  const [searchProduto, setSearchProduto] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false);

  const [numero, setNumero] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [items, setItems] = useState<(DocumentItem & { tempId: string })[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [descontoInput, setDescontoInput] = useState('0');
  const [taxaInput, setTaxaInput] = useState('6.25');
  const [paymentTerms, setPaymentTerms] = useState('Net 7 dias');
  const [depositValue, setDepositValue] = useState('0');
  const [squareLink, setSquareLink] = useState('');
  const [markupInput, setMarkupInput] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [vendedorNome, setVendedorNome] = useState('');
  const [taxaEnvioInput, setTaxaEnvioInput] = useState('15.00');
  const [observacaoInterna, setObservacaoInterna] = useState('');

  const [subtotal, setSubtotal] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [taxa, setTaxa] = useState(0);
  const [total, setTotal] = useState(0);

  const [parcelasAtivo, setParcelasAtivo] = useState(false);
  const [numParcelas, setNumParcelas] = useState(2);
  const [parcelas, setParcelas] = useState<{numero: number; valor: number; data: string; status: 'pendente'|'pago'}[]>([]);

  useEffect(() => {
    fetchClientes();
    fetchProdutos();
    if (isAdmin) {
      getVendedores().then(vs => setVendedores(vs as VendedorOpt[]));
    } else {
      setVendedorId(user?.uid || '');
      setVendedorNome((user as any)?.nome || '');
    }
    if (!isEditing) { generateInvoiceNumber(); applyPaymentTerms('Net 7 dias'); }
  }, []);

  useEffect(() => { if (isEditing && id) fetchInvoice(id); }, [id]);
  useEffect(() => { calcularTotais(); }, [items, descontoInput, taxaInput, taxaEnvioInput]);

  const fetchClientes = async () => {
    try {
      const clientesRef = collection(db, 'clientes');
      const clientesQuery = !isAdmin
        ? query(clientesRef, where('vendedor_id', '==', user?.uid))
        : clientesRef;
      const snap = await getDocs(clientesQuery);
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Cliente[]);
    } catch { console.error('Erro clientes') }
  };

  const fetchProdutos = async () => {
    try {
      const snap = await getDocs(collection(db, 'produtos'));
      setProdutos(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Produto[]);
    } catch { console.error('Erro produtos') }
  };

  const generateInvoiceNumber = async () => {
    const now = new Date();
    const snap = await getDocs(collection(db, 'invoices'));
    const next = (snap.size + 1).toString().padStart(4, '0');
    setNumero(`INV-${now.getFullYear()}-${next}`);
  };

  const applyPaymentTerms = (term: string) => {
    setPaymentTerms(term);
    const found = PAYMENT_TERMS.find(t => t.label === term);
    if (found && found.days >= 0) {
      const d = new Date();
      d.setDate(d.getDate() + found.days);
      setDataVencimento(d.toISOString().split('T')[0]);
    }
  };

  const fetchInvoice = async (invoiceId: string) => {
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, 'invoices', invoiceId));
      if (snap.exists()) {
        const data = snap.data() as Invoice;
        setNumero(data.numero);
        setObservacoes(data.observacoes || '');
        setDescontoInput((data as any).desconto_pct !== undefined ? String((data as any).desconto_pct) : '0');
        setTaxaInput((data as any).taxa_pct !== undefined ? String((data as any).taxa_pct) : '6.25');
        const venc = (data.data_vencimento as any)?.toDate ? (data.data_vencimento as any).toDate() : new Date(data.data_vencimento as any);
        setDataVencimento(venc.toISOString().split('T')[0]);
        setPaymentTerms((data as any).payment_terms || 'Net 30 dias');
        setDepositValue(String((data as any).deposit || '0'));
        setSquareLink((data as any).square_link || '');
        setTaxaEnvioInput(String((data as any).taxa_envio || '15.00'));
        setObservacaoInterna((data as any).observacao_interna || '');
        if ((data as any).parcelas_ativo) {
          setParcelasAtivo(true);
          setNumParcelas((data as any).parcelas?.length || 2);
          setParcelas((data as any).parcelas || []);
        }
        if ((data as any).vendedor_id) {
          setVendedorId((data as any).vendedor_id);
          setVendedorNome((data as any).vendedor_nome || '');
        }
        if (data.cliente_id) {
          const cliSnap = await getDoc(doc(db, 'clientes', data.cliente_id));
          if (cliSnap.exists()) setCliente({ id: cliSnap.id, ...cliSnap.data() } as Cliente);
        }
        setItems(data.items.map((item, i) => ({ ...item, tempId: `e-${i}` })));
      }
    } catch { toast.error('Erro ao carregar fatura'); }
    finally { setLoading(false); }
  };

  const calcularTotais = () => {
    const sub = items.reduce((a, i) => a + i.subtotal, 0);
    const desc = (sub * (parseFloat(descontoInput) || 0)) / 100;
    const tx = ((sub - desc) * (parseFloat(taxaInput) || 0)) / 100;
    const envio = parseFloat(taxaEnvioInput) || 0;
    setSubtotal(sub); setDesconto(desc); setTaxa(tx); setTotal(sub - desc + tx + envio);
  };

  const addItem = (produto: Produto) => {
    setItems([...items, { tempId: uuidv4(), produto_id: produto.id!, produto_nome: produto.nome, descricao: produto.descricao || '', quantidade: 1, preco_unitario: produto.preco_venda, desconto: 0, subtotal: produto.preco_venda }]);
    setSearchProduto(''); setShowProdutoDropdown(false);
  };

  const removeItem = (tempId: string) => setItems(items.filter(i => i.tempId !== tempId));
  const updateQty = (tempId: string, qty: number) => { if (qty < 1) return; setItems(items.map(i => i.tempId === tempId ? { ...i, quantidade: qty, subtotal: qty * i.preco_unitario } : i)); };
  const updatePrice = (tempId: string, price: number) => { if (price < 0) return; setItems(items.map(i => i.tempId === tempId ? { ...i, preco_unitario: price, subtotal: i.quantidade * price } : i)); };

  const applyMarkup = () => {
    const pct = parseFloat(markupInput);
    if (!pct || pct <= 0) { toast.error('Informe um percentual válido'); return; }
    const fator = 1 + pct / 100;
    setItems(items.map(i => ({
      ...i,
      preco_unitario: Math.round(i.preco_unitario * fator * 100) / 100,
      subtotal: Math.round(i.quantidade * i.preco_unitario * fator * 100) / 100,
    })));
    toast.success(`Markup de ${pct}% aplicado`);
    setMarkupInput('');
  };

  const gerarParcelas = (n: number, totalVal?: number) => {
    const base = dataVencimento ? new Date(dataVencimento + 'T12:00:00') : new Date();
    const valorTotal = totalVal !== undefined ? totalVal : total;
    const depositAmt2 = parseFloat(depositValue) || 0;
    const saldo = valorTotal - depositAmt2;
    const valorParcela = Math.round((saldo / n) * 100) / 100;
    const novas = Array.from({ length: n }, (_, i) => {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i);
      const valor = i === n - 1
        ? Math.round((saldo - valorParcela * (n - 1)) * 100) / 100
        : valorParcela;
      return { numero: i + 1, valor, data: d.toISOString().split('T')[0], status: 'pendente' as const };
    });
    setParcelas(novas);
  };

  const buildInvoiceData = (status: 'rascunho' | 'enviado', token?: string) => ({
    numero, cliente_id: cliente!.id!, cliente_nome: cliente!.nome,
    cliente_email: cliente!.email || '', cliente_telefone: cliente!.telefone || '',
    cliente_endereco: (cliente as any)?.endereco || '',
    items: items.map(({ tempId, ...item }) => item),
    subtotal, desconto, taxa, total,
    desconto_pct: parseFloat(descontoInput) || 0,
    taxa_pct: parseFloat(taxaInput) || 0,
    deposit: parseFloat(depositValue) || 0,
    payment_terms: paymentTerms,
    square_link: squareLink,
    status, observacoes,
    observacao_interna: observacaoInterna,
    taxa_envio: parseFloat(taxaEnvioInput) || 0,
    data_emissao: Timestamp.now(),
    data_vencimento: Timestamp.fromDate(new Date(dataVencimento)),
    vendedor_id: vendedorId || user?.uid || '',
    vendedor_nome: vendedorNome || (user as any)?.nome || '',
    public_token: token || uuidv4(),
    visualizado: false, visualizado_count: 0,
    parcelas_ativo: parcelasAtivo,
    parcelas: parcelasAtivo ? parcelas : [],
    created_at: Timestamp.now(),
  });

  const criarContaReceber = async (invoiceData: any, invoiceId: string, invoiceNumero: string) => {
    try {
      const depositAmt = parseFloat(depositValue) || 0;
      const valorReceber = invoiceData.total - depositAmt;
      if (valorReceber <= 0) return;
      await addDoc(collection(db, 'contas_receber'), {
        descricao: `Fatura ${invoiceNumero}`,
        cliente_id: cliente!.id || '',
        cliente_nome: cliente!.nome,
        invoice_id: invoiceId,
        invoice_numero: invoiceNumero,
        valor: valorReceber,
        data_emissao: Timestamp.now(),
        data_vencimento: invoiceData.data_vencimento,
        status: 'pendente',
        origem: 'venda',
        created_at: Timestamp.now(),
      });
    } catch (e) { console.error('Erro conta a receber:', e); }
  };

  const handleSave = async () => {
    if (!cliente) { toast.error('Selecione um cliente'); return; }
    if (items.length === 0) { toast.error('Adicione pelo menos um item'); return; }
    setSaving(true);
    try {
      const data = buildInvoiceData('rascunho');
      if (isEditing && id) {
        await updateDoc(doc(db, 'invoices', id), { ...data, updated_at: Timestamp.now() });
      } else {
        const ref = await addDoc(collection(db, 'invoices'), data);
        await criarContaReceber(data, ref.id, numero);
        await registrarMovimentosVenda(items);
      }
      import('@/lib/auditLog').then(({ logActivity }) => logActivity(isEditing ? 'Fatura editada' : 'Fatura criada', `Fatura para cliente: ${cliente?.nome || ''}`, 'fatura')).catch(() => {});
      toast.success('Fatura salva!'); navigate('/invoices');
    } catch { toast.error('Erro ao salvar fatura'); }
    finally { setSaving(false); }
  };

  const handleSend = async () => {
    if (!cliente) { toast.error('Selecione um cliente'); return; }
    if (items.length === 0) { toast.error('Adicione pelo menos um item'); return; }
    if (!cliente.telefone) { toast.error('Cliente não tem número de telefone cadastrado'); return; }
    setSaving(true);
    try {
      const token = uuidv4();
      const data = { ...buildInvoiceData('enviado'), public_token: token };
      if (isEditing && id) {
        await updateDoc(doc(db, 'invoices', id), data);
      } else {
        const ref = await addDoc(collection(db, 'invoices'), data);
        await criarContaReceber(data, ref.id, numero);
        await registrarMovimentosVenda(items);
      }
      const invoiceUrl = `${window.location.origin}/invoice/${token}`;
      const depositMsg = (parseFloat(depositValue) || 0) > 0 ? `\nAdiantamento: ${formatCurrency(parseFloat(depositValue))}` : '';
      const squareMsg = squareLink ? `\n\n💳 Pague agora: ${squareLink}` : '';
      const msg = `Olá ${cliente.nome}!\n\nSegue sua fatura da BBVIC Hair Care:\n${invoiceUrl}\n\nTotal: ${formatCurrency(total)}${depositMsg}\nVencimento: ${new Date(dataVencimento).toLocaleDateString('pt-BR')} (${paymentTerms})${squareMsg}`;
      const phone = cliente.telefone.replace(/\D/g, '');
      openWhatsApp(`https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`);
      import('@/lib/auditLog').then(({ logActivity }) => logActivity('Fatura enviada por WhatsApp', `Fatura enviada para ${cliente?.nome || ''} via WhatsApp`, 'fatura')).catch(() => {});
      toast.success(`Fatura enviada para ${cliente.nome}!`); navigate('/invoices');
    } catch { toast.error('Erro ao enviar fatura'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const filteredClientes = clientes.filter(c => c.nome.toLowerCase().includes(searchCliente.toLowerCase()) || (c.telefone && c.telefone.includes(searchCliente)));
  const filteredProdutos = produtos.filter(p => p.nome.toLowerCase().includes(searchProduto.toLowerCase()));
  const depositAmt = parseFloat(depositValue) || 0;
  const balanceDue = total - depositAmt;

  const handleDownloadPDF = () => {
    gerarPDFFatura({
      numero,
      cliente_nome: cliente?.nome || 'Cliente',
      cliente_email: cliente?.email,
      cliente_telefone: cliente?.telefone,
      cliente_endereco: cliente?.endereco,
      data_emissao: new Date(),
      data_vencimento: dataVencimento ? new Date(dataVencimento + 'T12:00:00') : undefined,
      items: items.map(i => ({
        produto_nome: i.produto_nome,
        descricao: i.descricao,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        subtotal: i.subtotal,
      })),
      subtotal,
      desconto: desconto > 0 ? desconto : undefined,
      taxa: taxa > 0 ? taxa : undefined,
      total,
      observacoes: observacoes || undefined,
      deposit: depositAmt > 0 ? depositAmt : undefined,
      vendedor_nome: vendedorNome || undefined,
    });
  };

  return (
    <div className="max-w-4xl mx-auto pb-24">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/invoices')} className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">{isEditing ? 'Editar Fatura' : 'Nova Fatura'}</h1>
          <p className="text-gray-500 text-xs font-mono">{numero}</p>
        </div>
      </div>

      <div className="space-y-5">

        {/* Cliente + Vendedor */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Cliente</h2>
          {cliente ? (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div>
                <p className="font-medium text-gray-900">{cliente.nome}</p>
                <p className="text-sm text-gray-500">{cliente.telefone}</p>
                {!cliente.telefone && <p className="text-xs text-orange-500">⚠️ Sem telefone — não poderá enviar por WhatsApp</p>}
              </div>
              <button onClick={() => setCliente(null)} className="p-1.5 text-gray-400 hover:text-gray-600 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={searchCliente} onChange={e => { setSearchCliente(e.target.value); setShowClienteDropdown(true); }} placeholder="Buscar cliente..." className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#C9A227]" />
              {showClienteDropdown && searchCliente && (
                <div className="absolute z-20 w-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg max-h-52 overflow-auto">
                  {filteredClientes.length === 0 ? <p className="text-gray-400 text-sm p-4">Nenhum cliente encontrado</p> : filteredClientes.map(c => (
                    <button key={c.id} onClick={() => { setCliente(c); setSearchCliente(''); setShowClienteDropdown(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0">
                      <p className="font-medium text-gray-900 text-sm">{c.nome}</p>
                      <p className="text-gray-500 text-xs">{c.telefone}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Vendedor (admin) */}
          {isAdmin && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Vendedor responsável</label>
              <select
                value={vendedorId}
                onChange={e => {
                  const v = vendedores.find(x => x.uid === e.target.value);
                  setVendedorId(e.target.value);
                  setVendedorNome(v?.nome || '');
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227] text-sm"
              >
                <option value="">— Sem vendedor —</option>
                {vendedores.map(v => (
                  <option key={v.uid} value={v.uid}>{v.nome} {v.comissao_percentual ? `(${v.comissao_percentual}% comissão)` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {!isAdmin && vendedorNome && (
            <p className="mt-2 text-xs text-gray-400">Vendedor: <span className="font-medium text-gray-600">{vendedorNome}</span></p>
          )}
        </div>

        {/* Itens */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Itens</h2>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchProduto} onChange={e => { setSearchProduto(e.target.value); setShowProdutoDropdown(true); }} placeholder="Buscar produto / serviço..." className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#C9A227]" />
            {showProdutoDropdown && searchProduto && (
              <div className="absolute z-20 w-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg max-h-52 overflow-auto">
                {filteredProdutos.map(p => (
                  <button key={p.id} onClick={() => addItem(p)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0 flex justify-between items-center gap-2">
                    <div><p className="font-medium text-gray-900 text-sm">{p.nome}</p></div>
                    <p className="text-[#C9A227] font-semibold text-sm flex-shrink-0">{formatCurrency(p.preco_venda)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Nenhum item. Busque um produto acima.</p>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <div key={item.tempId} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <p className="font-medium text-gray-900 text-sm flex-1 pr-2">{item.produto_nome}</p>
                    <button onClick={() => removeItem(item.tempId)} className="p-1 text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Preço:</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                        <input type="number" step="0.01" min="0" value={item.preco_unitario} onChange={e => updatePrice(item.tempId, parseFloat(e.target.value) || 0)} className="w-24 pl-5 pr-1 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A227] text-right" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Qtd:</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(item.tempId, item.quantidade - 1)} className="w-7 h-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100"><Minus className="w-3 h-3" /></button>
                        <span className="w-8 text-center text-sm font-medium">{item.quantidade}</span>
                        <button onClick={() => updateQty(item.tempId, item.quantidade + 1)} className="w-7 h-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100"><Plus className="w-3 h-3" /></button>
                      </div>
                    </div>
                    <div className="ml-auto">
                      <span className="font-semibold text-[#C9A227] text-sm">{formatCurrency(item.subtotal)}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Markup */}
              <div className="pt-3 border-t border-dashed border-gray-200">
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">Markup Interno <span className="font-normal text-gray-400 normal-case">(não aparece para o cliente)</span></p>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <input type="number" min="0" max="200" value={markupInput} onChange={e => setMarkupInput(e.target.value)} placeholder="Ex: 20" className="w-28 px-3 py-2 rounded-xl border border-orange-200 text-gray-900 text-sm focus:outline-none focus:border-orange-400" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                  </div>
                  <button onClick={applyMarkup} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">Aplicar Markup</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Configurações + Resumo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Configurações</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condições de Pagamento</label>
              <select value={paymentTerms} onChange={e => applyPaymentTerms(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]">
                {PAYMENT_TERMS.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Vencimento</label>
              <input type="date" value={dataVencimento} onChange={e => { setDataVencimento(e.target.value); setPaymentTerms('Personalizado'); }} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Desconto (%)</label>
                <input type="number" min="0" max="100" value={descontoInput} onChange={e => setDescontoInput(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax (%)</label>
                <input type="number" min="0" max="30" step="0.01" value={taxaInput} onChange={e => setTaxaInput(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]" />
                <p className="text-xs text-gray-400 mt-1">Padrão: 6.25%</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taxa de Envio ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" min="0" value={taxaEnvioInput} onChange={e => setTaxaEnvioInput(e.target.value)} placeholder="15.00" className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]" />
              </div>
              <p className="text-xs text-gray-400 mt-1">Padrão: $15.00 — edite conforme necessário</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adiantamento / Depósito ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" min="0" value={depositValue} onChange={e => setDepositValue(e.target.value)} placeholder="0.00" className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3} placeholder="Informações adicionais..." className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#C9A227] resize-none text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-orange-600 mb-1 flex items-center gap-1">🔒 Observação Interna <span className="text-xs font-normal text-gray-400">(cliente não vê)</span></label>
              <textarea value={observacaoInterna} onChange={e => setObservacaoInterna(e.target.value)} rows={2} placeholder="Anotações internas, instruções para equipe..." className="w-full px-3 py-2.5 rounded-xl border border-orange-200 bg-orange-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400 resize-none text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link de Pagamento Square</label>
              <input type="url" value={squareLink} onChange={e => setSquareLink(e.target.value)} placeholder="https://square.link/..." className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227] text-sm" />
              <p className="text-xs text-gray-400 mt-1">Cole o link do Square — o cliente poderá pagar e confirmar automaticamente</p>
            </div>

            {/* Parcelamento */}
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Parcelamento</label>
                  <p className="text-xs text-gray-400">Dividir o pagamento em parcelas</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !parcelasAtivo;
                    setParcelasAtivo(next);
                    if (next && total > 0) gerarParcelas(numParcelas);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${parcelasAtivo ? 'bg-[#C9A227]' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${parcelasAtivo ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {parcelasAtivo && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={numParcelas}
                      onChange={e => { const n = parseInt(e.target.value); setNumParcelas(n); gerarParcelas(n); }}
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#C9A227]"
                    >
                      {[2,3,4,5,6,7,8,9,10,11,12].map(n => (
                        <option key={n} value={n}>{n}x parcelas</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => gerarParcelas(numParcelas)}
                      className="px-3 py-2 text-xs rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      Recalcular
                    </button>
                  </div>

                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {parcelas.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 w-6 text-center">{p.numero}x</span>
                        <input
                          type="date"
                          value={p.data}
                          onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, data: e.target.value } : x))}
                          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#C9A227]"
                        />
                        <div className="relative w-24">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={p.valor}
                            onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, valor: parseFloat(e.target.value) || 0 } : x))}
                            className="w-full pl-5 pr-2 py-1.5 rounded-lg border border-gray-200 text-sm text-right text-gray-900 focus:outline-none focus:border-[#C9A227]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
                    <span>Total parcelado:</span>
                    <span className="font-semibold text-gray-900">${parcelas.reduce((a, p) => a + p.valor, 0).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Resumo</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              {desconto > 0 && <div className="flex justify-between text-gray-600"><span>Desconto ({descontoInput}%)</span><span className="text-red-500">-{formatCurrency(desconto)}</span></div>}
              <div className="flex justify-between text-gray-600"><span>Tax ({taxaInput}%)</span><span>+{formatCurrency(taxa)}</span></div>
              {(parseFloat(taxaEnvioInput) || 0) > 0 && <div className="flex justify-between text-gray-600"><span>Envio</span><span>+{formatCurrency(parseFloat(taxaEnvioInput) || 0)}</span></div>}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex justify-between text-gray-900 font-bold text-lg"><span>Total</span><span className="text-[#C9A227]">{formatCurrency(total)}</span></div>
              </div>
              {depositAmt > 0 && (
                <>
                  <div className="flex justify-between text-gray-600 text-sm"><span>Adiantamento Recebido</span><span className="text-green-600">-{formatCurrency(depositAmt)}</span></div>
                  <div className="border-t border-gray-200 pt-2">
                    <div className="flex justify-between text-gray-900 font-bold text-base"><span>Saldo Restante</span><span className="text-[#C9A227]">{formatCurrency(balanceDue)}</span></div>
                  </div>
                </>
              )}
              {vendedorNome && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400">Vendedor: <span className="font-medium text-gray-600">{vendedorNome}</span></p>
                </div>
              )}
              <div className="pt-1">
                <p className="text-xs text-gray-400">Condições: <span className="font-medium text-gray-600">{paymentTerms}</span></p>
                {dataVencimento && <p className="text-xs text-gray-400 mt-0.5">Vencimento: <span className="font-medium text-gray-600">{new Date(dataVencimento).toLocaleDateString('pt-BR')}</span></p>}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Barra de ações fixa */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-30">
        <div className="max-w-4xl mx-auto flex gap-2">
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 bg-white">
            {saving ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">Salvar</span>
          </button>
          <button onClick={handleDownloadPDF} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[#C9A227] text-[#C9A227] text-sm font-medium hover:bg-[#C9A227]/10 bg-white">
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">Baixar PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
          <button onClick={handleSend} disabled={saving} className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-[#C9A227] text-white text-sm font-bold hover:bg-[#b8911f] disabled:opacity-60 shadow">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar WhatsApp
          </button>
        </div>
      </div>

    </div>
  );
}
