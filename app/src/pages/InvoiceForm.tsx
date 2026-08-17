import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  collection, getDocs, addDoc, doc, getDoc,
  Timestamp, updateDoc, query, where
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Search, X, Send, Save, ArrowLeft, Plus, Minus, FileDown, UserPlus, Truck, PackageCheck } from 'lucide-react';
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
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const { user, isAdmin, getVendedores } = useAuth();
  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [vendedores, setVendedores] = useState<VendedorOpt[]>([]);
  const [searchCliente, setSearchCliente] = useState('');
  const [showNovoClienteModal, setShowNovoClienteModal] = useState(false);
  const [novoClienteForm, setNovoClienteForm] = useState({ nome: '', telefone: '', email: '' });
  const [savingNovoCliente, setSavingNovoCliente] = useState(false);

  const handleCriarClienteRapido = async () => {
    if (!novoClienteForm.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSavingNovoCliente(true);
    try {
      const ref = await addDoc(collection(db, 'clientes'), {
        nome: novoClienteForm.nome.trim(),
        telefone: novoClienteForm.telefone.trim(),
        email: novoClienteForm.email.trim(),
        vendedor_id: user?.uid,
        ativo: true,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      });
      const novoCliente = { id: ref.id, nome: novoClienteForm.nome.trim(), telefone: novoClienteForm.telefone.trim(), email: novoClienteForm.email.trim() } as any;
      setClientes(prev => [...prev, novoCliente]);
      setCliente(novoCliente);
      setShowNovoClienteModal(false);
      setNovoClienteForm({ nome: '', telefone: '', email: '' });
      toast.success('Cliente criado e selecionado!');
    } catch { toast.error('Erro ao criar cliente'); }
    finally { setSavingNovoCliente(false); }
  };
  const [searchProduto, setSearchProduto] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [showProdutoDropdown, setShowProdutoDropdown] = useState(false);
  const [produtoModal, setProdutoModal] = useState<Produto | null>(null);
  const [produtoModalQty, setProdutoModalQty] = useState(1);
  const [produtoModalObs, setProdutoModalObs] = useState('');
  const [produtoModalPreco, setProdutoModalPreco] = useState(0);

  const [numero, setNumero] = useState('');
  const [dataEmissao, setDataEmissao] = useState<any>(null);
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
  const [valorPago, setValorPago] = useState(0);
  const [descontoTipo, setDescontoTipo] = useState<'pct' | 'valor'>('pct');
  const [originalToken, setOriginalToken] = useState('');
  const [statusOriginal, setStatusOriginal] = useState('rascunho');
  const [dataPagamento, setDataPagamento] = useState<Date | null>(null);
  const [formaPgtoRecebido, setFormaPgtoRecebido] = useState('');

  const [showEnviadoModal, setShowEnviadoModal] = useState(false);
  const [showEntregueModal, setShowEntregueModal] = useState(false);
  const [tipoEntregaModal, setTipoEntregaModal] = useState<'pessoal' | 'ups' | ''>('');
  const [trackingUrlModal, setTrackingUrlModal] = useState('');
  const [statusEntregaAtual, setStatusEntregaAtual] = useState('');
  const [tipoEntregaAtual, setTipoEntregaAtual] = useState('');
  const [trackingAtual, setTrackingAtual] = useState('');
  const [salvandoEntrega, setSalvandoEntrega] = useState(false);

  useEffect(() => {
    fetchClientes();
    fetchProdutos();
    if (isAdmin) {
      getVendedores().then(vs => setVendedores(vs as VendedorOpt[]));
    }
    if (!isEditing) { generateInvoiceNumber(); applyPaymentTerms('Net 7 dias'); }
  }, []);

  useEffect(() => {
    if (!isAdmin && user?.uid) {
      setVendedorId(user.uid);
      setVendedorNome((user as any)?.nome || '');
    }
  }, [user, isAdmin]);

  useEffect(() => { if (isEditing && id) fetchInvoice(id); }, [id]);
  useEffect(() => { calcularTotais(); }, [items, descontoInput, taxaInput, taxaEnvioInput, descontoTipo]);

  const fetchClientes = async () => {
    try {
      const clientesRef = collection(db, 'clientes');
      const verTodos = isAdmin || user?.ver_todos_clientes === true
      const clientesQuery = !verTodos
        ? query(clientesRef, where('vendedor_id', '==', user?.uid))
        : clientesRef;
      const snap = await getDocs(clientesQuery);
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Cliente[];
      setClientes(lista);
      // Pre-selecionar cliente se veio da página de clientes
      if (!id) {
        const cliId = urlParams.get('cliente_id');
        const cliNome = urlParams.get('cliente_nome');
        if (cliId) {
          const found = lista.find(c => c.id === cliId);
          if (found) setCliente(found);
          else if (cliNome) setCliente({ id: cliId, nome: decodeURIComponent(cliNome) } as any);
        }
      }
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
        setDataEmissao((data as any).data_emissao || (data as any).created_at || null);
        setObservacoes(data.observacoes || '');
        const dTipo: 'pct' | 'valor' = (data as any).desconto_tipo || 'pct';
        setDescontoTipo(dTipo);
        setDescontoInput(dTipo === 'valor'
          ? String((data as any).desconto || 0)
          : String((data as any).desconto_pct !== undefined ? (data as any).desconto_pct : 0));
        setTaxaInput((data as any).taxa_pct !== undefined ? String((data as any).taxa_pct) : '6.25');
        const venc = (data.data_vencimento as any)?.toDate ? (data.data_vencimento as any).toDate() : new Date(data.data_vencimento as any);
        setDataVencimento(venc.toISOString().split('T')[0]);
        setPaymentTerms((data as any).payment_terms || 'Net 30 dias');
        setDepositValue(String((data as any).deposit || '0'));
        setSquareLink((data as any).square_link || '');
        setTaxaEnvioInput((data as any).taxa_envio !== undefined && (data as any).taxa_envio !== null ? String((data as any).taxa_envio) : '15.00');
        setValorPago((data as any).valor_pago || 0);
        setOriginalToken((data as any).public_token || '');
        setStatusOriginal(data.status || 'rascunho');
        setFormaPgtoRecebido((data as any).forma_pagamento_recebido || '');
        const dp = (data as any).data_pagamento;
        setDataPagamento(dp ? (dp?.toDate ? dp.toDate() : new Date(dp)) : null);
        setObservacaoInterna((data as any).observacao_interna || '');
        setStatusEntregaAtual((data as any).status_entrega || '');
        setTipoEntregaAtual((data as any).tipo_entrega || '');
        setTrackingAtual((data as any).tracking_url || '');
        setTrackingUrlModal((data as any).tracking_url || '');
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
          if (cliSnap.exists()) {
            const cliData = cliSnap.data() as any;
            setCliente({
              id: cliSnap.id,
              ...cliData,
              endereco: cliData.endereco || (data as any).cliente_endereco || '',
              cidade: cliData.cidade || (data as any).cliente_cidade || '',
              estado: cliData.estado || (data as any).cliente_estado || '',
              cep: cliData.cep || (data as any).cliente_cep || '',
              email: cliData.email || (data as any).cliente_email || '',
              telefone: cliData.telefone || (data as any).cliente_telefone || '',
            } as Cliente);
          } else {
            setCliente({
              id: data.cliente_id,
              nome: data.cliente_nome,
              email: (data as any).cliente_email || '',
              telefone: (data as any).cliente_telefone || '',
              endereco: (data as any).cliente_endereco || '',
              cidade: (data as any).cliente_cidade || '',
              estado: (data as any).cliente_estado || '',
              cep: (data as any).cliente_cep || '',
            } as Cliente);
          }
        }
        // Enriquecer itens com preco_original buscando preço atual do produto
        const prodSnap = await getDocs(collection(db, 'produtos'))
        const prodMap: Record<string, number> = {}
        prodSnap.docs.forEach(d => { prodMap[d.id] = (d.data() as any).preco_venda || 0 })
        setItems(data.items.map((item: any, i: number) => ({
          ...item,
          tempId: `e-${i}`,
          preco_original: item.preco_original ?? prodMap[item.produto_id] ?? item.preco_unitario,
        })));
      }
    } catch { toast.error('Erro ao carregar fatura'); }
    finally { setLoading(false); }
  };

  const calcularTotais = () => {
    const sub = items.reduce((a, i) => a + i.subtotal, 0);
    const desc = descontoTipo === 'valor'
      ? Math.min(parseFloat(descontoInput) || 0, sub)
      : (sub * (parseFloat(descontoInput) || 0)) / 100;
    const tx = ((sub - desc) * (parseFloat(taxaInput) || 0)) / 100;
    const envio = parseFloat(taxaEnvioInput) || 0;
    setSubtotal(sub); setDesconto(desc); setTaxa(tx); setTotal(sub - desc + tx + envio);
  };

  const addItem = (produto: Produto, qty = 1, obs = '', precoCustom?: number) => {
    const preco = precoCustom !== undefined ? precoCustom : produto.preco_venda;
    setItems(prev => [{ tempId: uuidv4(), produto_id: produto.id!, produto_nome: produto.nome, descricao: obs || produto.descricao || '', quantidade: qty, preco_unitario: preco, preco_original: produto.preco_venda, desconto: 0, subtotal: qty * preco }, ...prev]);
    setSearchProduto(''); setShowProdutoDropdown(false);
  };

  const openProdutoModal = (produto: Produto) => {
    setProdutoModal(produto);
    setProdutoModalQty(1);
    setProdutoModalObs('');
    setProdutoModalPreco(produto.preco_venda);
    setShowProdutoDropdown(false);
    setSearchProduto('');
  };

  const confirmProdutoModal = () => {
    if (!produtoModal) return;
    addItem(produtoModal, produtoModalQty, produtoModalObs, produtoModalPreco);
    setProdutoModal(null);
  };

  const removeItem = (tempId: string) => setItems(items.filter(i => i.tempId !== tempId));
  const updateQty = (tempId: string, qty: number) => { if (qty < 1) return; setItems(items.map(i => i.tempId === tempId ? { ...i, quantidade: qty, subtotal: qty * i.preco_unitario } : i)); };
  const updatePrice = (tempId: string, price: number) => { if (price < 0) return; setItems(items.map(i => i.tempId === tempId ? { ...i, preco_unitario: price, subtotal: i.quantidade * price } : i)); };

  const [markupAtual, setMarkupAtual] = useState(0); // % de markup já aplicado

  const applyMarkup = () => {
    const pct = parseFloat(markupInput);
    if (isNaN(pct) || pct < 0) { toast.error('Informe um percentual válido'); return; }
    // Sempre calcular sobre o preco_original (antes de qualquer markup)
    setItems(items.map(i => {
      const base = i.preco_original !== undefined ? i.preco_original : i.preco_unitario;
      const novoPreco = pct === 0 ? base : Math.round(base * (1 + pct / 100) * 100) / 100;
      return { ...i, preco_unitario: novoPreco, subtotal: Math.round(i.quantidade * novoPreco * 100) / 100 };
    }));
    setMarkupAtual(pct);
    toast.success(pct === 0 ? 'Markup removido' : `Markup de ${pct}% aplicado`);
    setMarkupInput('');
  };

  const gerarParcelas = (n: number, totalVal?: number) => {
    const base = dataVencimento ? new Date(dataVencimento + 'T12:00:00') : new Date();
    const valorTotal = totalVal !== undefined ? totalVal : total;
    const depositAmt2 = parseFloat(depositValue) || 0;
    // Descontar o que já foi pago anteriormente (pagamento parcial)
    const saldo = valorTotal - depositAmt2 - valorPago;
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

  const buildAlteracoes = () => items
    .filter(i => (i as any).preco_original !== undefined && i.preco_unitario !== (i as any).preco_original)
    .map(i => ({
      produto: i.produto_nome,
      preco_original: (i as any).preco_original,
      preco_cobrado: i.preco_unitario,
      diferenca: Math.round((i.preco_unitario - (i as any).preco_original) * 100) / 100,
    }));

  const buildInvoiceData = (status: 'rascunho' | 'enviado', token?: string) => {
    const alteracoes = buildAlteracoes();
    return {
    numero, cliente_id: cliente!.id!, cliente_nome: cliente!.nome,
    cliente_email: cliente!.email || '', cliente_telefone: cliente!.telefone || '',
    cliente_endereco: (cliente as any)?.endereco || '',
    cliente_cidade: (cliente as any)?.cidade || '',
    cliente_estado: (cliente as any)?.estado || '',
    cliente_cep: (cliente as any)?.cep || '',
    items: items.map(({ tempId, ...item }) => item),
    subtotal, desconto, taxa, total,
    desconto_tipo: descontoTipo,
    desconto_pct: descontoTipo === 'pct' ? (parseFloat(descontoInput) || 0) : 0,
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
    valores_alterados: alteracoes.length > 0,
    detalhes_alteracoes: alteracoes,
    created_at: Timestamp.now(),
    };
  };

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
      if (isEditing && id) {
        const alteracoes = buildAlteracoes();
        const updateData: any = {
          numero, cliente_id: cliente!.id!, cliente_nome: cliente!.nome,
          cliente_email: cliente!.email || '', cliente_telefone: cliente!.telefone || '',
          cliente_endereco: (cliente as any)?.endereco || '',
          cliente_cidade: (cliente as any)?.cidade || '',
          cliente_estado: (cliente as any)?.estado || '',
          cliente_cep: (cliente as any)?.cep || '',
          items: items.map(({ tempId, ...item }) => item),
          subtotal, desconto, taxa, total,
          desconto_tipo: descontoTipo,
          desconto_pct: descontoTipo === 'pct' ? (parseFloat(descontoInput) || 0) : 0,
          taxa_pct: parseFloat(taxaInput) || 0,
          deposit: parseFloat(depositValue) || 0,
          payment_terms: paymentTerms,
          square_link: squareLink,
          observacoes,
          observacao_interna: observacaoInterna,
          taxa_envio: parseFloat(taxaEnvioInput) || 0,
          data_vencimento: Timestamp.fromDate(new Date(dataVencimento)),
          vendedor_id: vendedorId || user?.uid || '',
          vendedor_nome: vendedorNome || (user as any)?.nome || '',
          parcelas_ativo: parcelasAtivo,
          parcelas: parcelasAtivo ? parcelas : [],
          valores_alterados: alteracoes.length > 0,
          detalhes_alteracoes: alteracoes,
          updated_at: Timestamp.now(),
        };
        await updateDoc(doc(db, 'invoices', id), updateData);
      } else {
        const data = buildInvoiceData('rascunho');
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
      const token = originalToken || uuidv4();
      let invoiceDocId = id || '';
      if (isEditing && id) {
        const alteracoes = buildAlteracoes();
        const updateData: any = {
          numero, cliente_id: cliente!.id!, cliente_nome: cliente!.nome,
          cliente_email: cliente!.email || '', cliente_telefone: cliente!.telefone || '',
          cliente_endereco: (cliente as any)?.endereco || '',
          cliente_cidade: (cliente as any)?.cidade || '',
          cliente_estado: (cliente as any)?.estado || '',
          cliente_cep: (cliente as any)?.cep || '',
          items: items.map(({ tempId, ...item }) => item),
          subtotal, desconto, taxa, total,
          desconto_tipo: descontoTipo,
          desconto_pct: descontoTipo === 'pct' ? (parseFloat(descontoInput) || 0) : 0,
          taxa_pct: parseFloat(taxaInput) || 0,
          deposit: parseFloat(depositValue) || 0,
          payment_terms: paymentTerms,
          square_link: squareLink,
          status: (['pago', 'parcial', 'pago_parcial'].includes(statusOriginal) ? statusOriginal : 'enviado'),
          observacoes,
          observacao_interna: observacaoInterna,
          taxa_envio: parseFloat(taxaEnvioInput) || 0,
          data_vencimento: Timestamp.fromDate(new Date(dataVencimento)),
          vendedor_id: vendedorId || user?.uid || '',
          vendedor_nome: vendedorNome || (user as any)?.nome || '',
          public_token: token,
          parcelas_ativo: parcelasAtivo,
          parcelas: parcelasAtivo ? parcelas : [],
          valores_alterados: alteracoes.length > 0,
          detalhes_alteracoes: alteracoes,
          updated_at: Timestamp.now(),
        };
        await updateDoc(doc(db, 'invoices', id), updateData);
        invoiceDocId = id;
      } else {
        const data = { ...buildInvoiceData('enviado'), public_token: token };
        const ref = await addDoc(collection(db, 'invoices'), data);
        invoiceDocId = ref.id;
        await criarContaReceber(data, ref.id, numero);
        await registrarMovimentosVenda(items);
      }
      const invoiceUrl = `${window.location.origin}/invoice/${invoiceDocId}`;
      const dataEnvio = new Date().toLocaleDateString('pt-BR');
      const dataVenc = dataVencimento ? new Date(dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '';
      const squareMsg = squareLink ? `\n\n💳 Pague agora: ${squareLink}` : '';
      const statusAtual = (['pago', 'parcial', 'pago_parcial'].includes(statusOriginal) ? statusOriginal : 'enviado');

      // Build the main financial details block based on status
      let totalMsgVar: string;
      if (statusAtual === 'pago') {
        const dpStr = dataPagamento ? dataPagamento.toLocaleDateString('pt-BR') : dataEnvio;
        const fpStr = formaPgtoRecebido ? ` via ${formaPgtoRecebido}` : '';
        totalMsgVar = `✅ *FATURA PAGA*\nTotal: ${formatCurrency(total)}\nPago em: ${dpStr}${fpStr}`;
      } else if (parcelasAtivo && parcelas.length > 0) {
        const parcelasPagas = parcelas.filter(p => p.status === 'pago')
        const parcelasPendentes = parcelas.filter(p => p.status !== 'pago')
        const totalPago = parcelasPagas.reduce((s, p) => s + (p.valor || 0), 0)
        const totalRestante = parcelasPendentes.reduce((s, p) => s + (p.valor || 0), 0)

        let linhas = ''
        if (parcelasPagas.length > 0) {
          linhas += `✅ *Parcelas pagas (${parcelasPagas.length}):*\n`
          linhas += parcelasPagas.map(p => {
            const dataParc = p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : ''
            const dataPgto = (p as any).data_pagamento ? new Date((p as any).data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR') : dataParc
            return `  ✅ ${p.numero}ª parcela: ${formatCurrency(p.valor)} — paga em ${dataPgto}`
          }).join('\n')
          linhas += `\n\n`
        }
        if (parcelasPendentes.length > 0) {
          linhas += `⏳ *Parcelas em aberto (${parcelasPendentes.length}):*\n`
          linhas += parcelasPendentes.map(p => {
            const dataParc = p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : ''
            return `  ⏳ ${p.numero}ª parcela: ${formatCurrency(p.valor)}${dataParc ? ` — vence ${dataParc}` : ''}`
          }).join('\n')
        }

        const resumo = totalPago > 0
          ? `Total: ${formatCurrency(total)}\n✅ Já pago: ${formatCurrency(totalPago)}\n💰 *Saldo restante: ${formatCurrency(totalRestante)}*`
          : `Total: ${formatCurrency(total)}`

        totalMsgVar = `${resumo}\n\n📋 *Detalhamento das parcelas:*\n${linhas}`
      } else if (valorPago > 0) {
        const dpStr = dataPagamento ? dataPagamento.toLocaleDateString('pt-BR') : '';
        const fpStr = formaPgtoRecebido ? ` via ${formaPgtoRecebido}` : '';
        const saldo = Math.max(0, total - valorPago);
        totalMsgVar = `Total: ${formatCurrency(total)}\n✅ Já pago: ${formatCurrency(valorPago)}${dpStr ? ` em ${dpStr}` : ''}${fpStr}\n💰 Saldo restante: ${formatCurrency(saldo)}${dataVenc ? `\n📅 Vencimento do saldo: ${dataVenc}` : ''}`;
      } else {
        totalMsgVar = `Total: ${formatCurrency(total)}${dataVenc ? `\n📅 Vencimento: ${dataVenc}` : ''}`;
      }

      let msgTemplate = `Olá {NOME}!\n\nSegue sua fatura da BBVIC Hair Care:\n{LINK}\n\n{TOTAL_MSG}\nEmitido em: {DATA_ENVIO}`;
      try {
        const snapMsg = await getDoc(doc(db, 'configuracoes', 'mensagens'));
        if (snapMsg.exists() && snapMsg.data().fatura) msgTemplate = snapMsg.data().fatura;
      } catch { /* usa padrão */ }

      const msg = msgTemplate
        .replace(/{NOME}/g, cliente.nome)
        .replace(/{NUMERO}/g, numero)
        .replace(/{TOTAL}/g, formatCurrency(total))
        .replace(/{TOTAL_MSG}/g, totalMsgVar)
        .replace(/{JA_PAGO}/g, valorPago > 0 ? formatCurrency(valorPago) : '')
        .replace(/{SALDO}/g, valorPago > 0 ? formatCurrency(Math.max(0, total - valorPago)) : formatCurrency(total))
        .replace(/{VENCIMENTO}/g, '')
        .replace(/{DATA_ENVIO}/g, dataEnvio)
        .replace(/{LINK}/g, invoiceUrl)
        .replace(/{CONSULTOR}/g, vendedorNome || '')
        + squareMsg;
      const phone = cliente.telefone.replace(/\D/g, '');
      openWhatsApp(`https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`);
      import('@/lib/auditLog').then(({ logActivity }) => logActivity('Fatura enviada por WhatsApp', `Fatura enviada para ${cliente?.nome || ''} via WhatsApp`, 'fatura')).catch(() => {});
      toast.success(`Fatura enviada para ${cliente.nome}!`); navigate('/invoices');
    } catch { toast.error('Erro ao enviar fatura'); }
    finally { setSaving(false); }
  };

  const handleConfirmarEnviado = async () => {
    if (!tipoEntregaModal) { toast.error('Selecione o tipo de entrega'); return; }
    if (!id) return;
    setSalvandoEntrega(true);
    try {
      await updateDoc(doc(db, 'invoices', id), {
        status_entrega: 'enviado',
        tipo_entrega: tipoEntregaModal,
        tracking_url: trackingUrlModal,
        data_envio_entrega: Timestamp.now(),
        updated_at: Timestamp.now(),
      });
      setStatusEntregaAtual('enviado');
      setTipoEntregaAtual(tipoEntregaModal);
      setTrackingAtual(trackingUrlModal);
      if (cliente?.telefone) {
        const phone = cliente.telefone.replace(/\D/g, '');
        let msg = '';
        if (tipoEntregaModal === 'ups') {
          msg = `Olá ${cliente.nome}! 📦 Seu pedido foi enviado via UPS.${trackingUrlModal ? `\n\n🔍 Rastreio: ${trackingUrlModal}` : ''}\n\nQualquer dúvida, estamos à disposição!`;
        } else {
          msg = `Olá ${cliente.nome}! 🚗 Seu pedido saiu para entrega pessoal e logo chegará até você!\n\nQualquer dúvida, estamos à disposição!`;
        }
        openWhatsApp(`https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`);
      }
      toast.success('Pedido marcado como enviado!');
      setShowEnviadoModal(false);
    } catch { toast.error('Erro ao salvar'); }
    finally { setSalvandoEntrega(false); }
  };

  const handleConfirmarEntregue = async () => {
    if (!tipoEntregaModal) { toast.error('Selecione o tipo de entrega'); return; }
    if (!id) return;
    setSalvandoEntrega(true);
    try {
      await updateDoc(doc(db, 'invoices', id), {
        status_entrega: 'entregue',
        tipo_entrega: tipoEntregaModal,
        data_entregue: Timestamp.now(),
        updated_at: Timestamp.now(),
      });
      setStatusEntregaAtual('entregue');
      setTipoEntregaAtual(tipoEntregaModal);
      if (cliente?.telefone) {
        const phone = cliente.telefone.replace(/\D/g, '');
        const tipoStr = tipoEntregaModal === 'ups' ? 'via UPS' : 'por entrega pessoal';
        const msg = `Olá ${cliente.nome}! ✅ Confirmamos que seu pedido foi entregue ${tipoStr}.\n\nObrigada pela preferência! 💛`;
        openWhatsApp(`https://wa.me/1${phone}?text=${encodeURIComponent(msg)}`);
      }
      toast.success('Pedido marcado como entregue!');
      setShowEntregueModal(false);
    } catch { toast.error('Erro ao salvar'); }
    finally { setSalvandoEntrega(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const filteredClientes = clientes.filter(c => c.nome.toLowerCase().includes(searchCliente.toLowerCase()) || (c.telefone && c.telefone.includes(searchCliente)));
  const filteredProdutos = produtos.filter(p => {
    const terms = searchProduto.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = `${p.nome} ${p.descricao || ''}`.toLowerCase();
    return terms.every(t => haystack.includes(t));
  });
  const depositAmt = parseFloat(depositValue) || 0;
  const balanceDue = total - depositAmt;

  const handleDownloadPDF = () => {
    gerarPDFFatura({
      numero,
      cliente_nome: cliente?.nome || 'Cliente',
      cliente_email: (cliente as any)?.email || '',
      cliente_telefone: (cliente as any)?.telefone || '',
      cliente_endereco: (cliente as any)?.endereco || '',
      cliente_cidade: (cliente as any)?.cidade || '',
      cliente_estado: (cliente as any)?.estado || '',
      cliente_cep: (cliente as any)?.cep || '',
      data_emissao: dataEmissao || new Date(),
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
      taxa_envio: (parseFloat(taxaEnvioInput) || 0) > 0 ? parseFloat(taxaEnvioInput) : undefined,
      total,
      observacoes: observacoes || undefined,
      deposit: depositAmt > 0 ? depositAmt : undefined,
      vendedor_nome: vendedorNome || undefined,
      parcelas_ativo: parcelasAtivo,
      parcelas: parcelasAtivo ? parcelas : undefined,
      valor_pago: valorPago > 0 ? valorPago : undefined,
    });
  };

  return (
    <>
    <div className="max-w-4xl mx-auto pb-24">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/invoices')} className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">{isEditing ? 'Editar Fatura' : 'Nova Fatura'}</h1>
          <p className="text-gray-500 text-xs font-mono">{numero}</p>
          {isEditing && statusEntregaAtual && (
            <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusEntregaAtual === 'entregue' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {statusEntregaAtual === 'entregue' ? <PackageCheck className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
              {statusEntregaAtual === 'entregue' ? 'Entregue' : 'Enviado'}
            </span>
          )}
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
            <div className="space-y-2">
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
              <button type="button" onClick={() => setShowNovoClienteModal(true)} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-[#C9A227] text-[#C9A227] text-sm font-medium hover:bg-[#C9A227]/5 transition-colors">
                <UserPlus className="w-4 h-4" /> Cadastrar novo cliente
              </button>
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
                  <button key={p.id} onClick={() => openProdutoModal(p)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0 flex justify-between items-center gap-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{p.nome}</p>
                      {p.descricao && <p className="text-xs text-gray-400">{p.descricao}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[#C9A227] font-semibold text-sm">{formatCurrency(p.preco_venda)}</p>
                      <p className="text-xs text-gray-400">Estoque: {(p as any).estoque ?? '—'}</p>
                    </div>
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
                  <div>
                    <input
                      type="text"
                      value={item.descricao || ''}
                      onChange={e => setItems(items.map(i => i.tempId === item.tempId ? { ...i, descricao: e.target.value } : i))}
                      placeholder="Observação deste item (visível na nota)..."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#C9A227] text-gray-700 placeholder-gray-300"
                    />
                  </div>
                </div>
              ))}

              {/* Markup */}
              <div className="pt-3 border-t border-dashed border-gray-200">
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">Markup Interno <span className="font-normal text-gray-400 normal-case">(não aparece para o cliente)</span>{markupAtual > 0 && <span className="ml-2 text-orange-500 font-bold">— {markupAtual}% aplicado</span>}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <input type="number" min="0" max="200" value={markupInput} onChange={e => setMarkupInput(e.target.value)} placeholder="Ex: 20" className="w-28 px-3 py-2 rounded-xl border border-orange-200 text-gray-900 text-sm focus:outline-none focus:border-orange-400" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                  </div>
                  <button onClick={applyMarkup} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">Aplicar Markup</button>
                  {markupAtual > 0 && (
                    <button
                      onClick={() => {
                        setItems(items.map(i => {
                          const base = i.preco_original !== undefined ? i.preco_original : i.preco_unitario;
                          return { ...i, preco_unitario: base, subtotal: Math.round(i.quantidade * base * 100) / 100 };
                        }));
                        setMarkupAtual(0);
                        toast.success('Markup removido, preços originais restaurados');
                      }}
                      className="px-3 py-2 rounded-xl border border-orange-300 text-orange-600 text-sm font-medium hover:bg-orange-50"
                    >Remover Markup</button>
                  )}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Desconto</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => { setDescontoTipo('pct'); setDescontoInput('0'); }}
                  className={`px-2 py-1 text-xs rounded-lg border font-medium transition ${descontoTipo === 'pct' ? 'bg-[#C9A227] text-white border-[#C9A227]' : 'bg-white text-gray-600 border-gray-200'}`}
                >%</button>
                <button
                  type="button"
                  onClick={() => { setDescontoTipo('valor'); setDescontoInput('0'); }}
                  className={`px-2 py-1 text-xs rounded-lg border font-medium transition ${descontoTipo === 'valor' ? 'bg-[#C9A227] text-white border-[#C9A227]' : 'bg-white text-gray-600 border-gray-200'}`}
                >$</button>
              </div>
              <input
                type="number"
                value={descontoInput}
                onChange={e => setDescontoInput(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]" />
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
                    {/* Resumo de pagamento das parcelas */}
                    {parcelas.some(p => p.status === 'pago') && (() => {
                      const pagas = parcelas.filter(p => p.status === 'pago')
                      const pendentes = parcelas.filter(p => p.status !== 'pago')
                      const totalPago = pagas.reduce((s, p) => s + (p.valor || 0), 0)
                      const totalPendente = pendentes.reduce((s, p) => s + (p.valor || 0), 0)
                      return (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-2">
                          <p className="text-xs font-bold text-green-700 mb-1">📊 Situação das parcelas</p>
                          <div className="flex gap-4 text-xs">
                            <span className="text-green-700">✅ {pagas.length} paga{pagas.length > 1 ? 's' : ''}: <strong>${totalPago.toFixed(2)}</strong></span>
                            {pendentes.length > 0 && <span className="text-orange-600">⏳ {pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}: <strong>${totalPendente.toFixed(2)}</strong></span>}
                          </div>
                        </div>
                      )
                    })()}
                    {parcelas.map((p, i) => {
                      const isPago = p.status === 'pago'
                      return (
                        <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${isPago ? 'bg-green-50 border border-green-200' : ''}`}>
                          {isPago
                            ? <span className="text-xs font-bold text-green-600 w-6 text-center">✅</span>
                            : <span className="text-xs font-bold text-gray-500 w-6 text-center">{p.numero}x</span>
                          }
                          <input
                            type="date"
                            value={p.data}
                            disabled={isPago}
                            onChange={e => !isPago && setParcelas(prev => prev.map((x, j) => j === i ? { ...x, data: e.target.value } : x))}
                            className={`flex-1 px-2 py-1.5 rounded-lg border text-sm focus:outline-none ${isPago ? 'border-green-200 bg-green-50 text-green-700 cursor-not-allowed' : 'border-gray-200 text-gray-900 focus:border-[#C9A227]'}`}
                          />
                          <div className="relative w-24">
                            <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${isPago ? 'text-green-500' : 'text-gray-400'}`}>$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={p.valor}
                              disabled={isPago}
                              onChange={e => !isPago && setParcelas(prev => prev.map((x, j) => j === i ? { ...x, valor: parseFloat(e.target.value) || 0 } : x))}
                              className={`w-full pl-5 pr-2 py-1.5 rounded-lg border text-sm text-right focus:outline-none ${isPago ? 'border-green-200 bg-green-50 text-green-700 font-semibold cursor-not-allowed' : 'border-gray-200 text-gray-900 focus:border-[#C9A227]'}`}
                            />
                          </div>
                          {isPago && <span className="text-xs font-bold text-green-600 whitespace-nowrap">PAGO</span>}
                        </div>
                      )
                    })}
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
              {desconto > 0 && <div className="flex justify-between text-gray-600"><span>Desconto ({descontoTipo === 'pct' ? `${descontoInput}%` : formatCurrency(parseFloat(descontoInput) || 0)})</span><span className="text-red-500">-{formatCurrency(desconto)}</span></div>}
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
              {valorPago > 0 && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-green-700 font-medium">✅ Já pago</span>
                    <span className="text-green-700 font-bold">{formatCurrency(valorPago)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600 font-medium">💰 Saldo restante</span>
                    <span className="text-red-600 font-bold">{formatCurrency(Math.max(0, total - valorPago))}</span>
                  </div>
                </div>
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

      {/* ── CARD STATUS DE ENTREGA ── */}
      {isEditing && (
        <div className={`rounded-xl border p-4 shadow-sm ${
          statusEntregaAtual === 'entregue'
            ? 'bg-green-50 border-green-200'
            : statusEntregaAtual === 'enviado'
              ? 'bg-blue-50 border-blue-200'
              : 'bg-gray-50 border-gray-200'
        }`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Status de Entrega</p>
          <div className="flex items-center gap-3">
            {/* Passo 1: Preparando */}
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                statusEntregaAtual ? 'bg-[#C9A227] text-white' : 'bg-gray-200 text-gray-500'
              }`}>✓</div>
              <span className="text-xs text-gray-500 text-center leading-tight">Fatura<br/>Criada</span>
            </div>
            <div className={`flex-1 h-1 rounded-full ${statusEntregaAtual === 'enviado' || statusEntregaAtual === 'entregue' ? 'bg-blue-400' : 'bg-gray-200'}`} />
            {/* Passo 2: Enviado */}
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                statusEntregaAtual === 'enviado' || statusEntregaAtual === 'entregue'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                <Truck className="w-4 h-4" />
              </div>
              <span className="text-xs text-center leading-tight font-medium" style={{ color: statusEntregaAtual === 'enviado' || statusEntregaAtual === 'entregue' ? '#3b82f6' : '#9ca3af' }}>Enviado</span>
            </div>
            <div className={`flex-1 h-1 rounded-full ${statusEntregaAtual === 'entregue' ? 'bg-green-400' : 'bg-gray-200'}`} />
            {/* Passo 3: Entregue */}
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                statusEntregaAtual === 'entregue'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                <PackageCheck className="w-4 h-4" />
              </div>
              <span className="text-xs text-center leading-tight font-medium" style={{ color: statusEntregaAtual === 'entregue' ? '#16a34a' : '#9ca3af' }}>Entregue</span>
            </div>
          </div>

          {/* Detalhes do status atual */}
          {statusEntregaAtual === 'enviado' && (
            <div className="mt-3 pt-3 border-t border-blue-200 space-y-1">
              <p className="text-sm text-blue-700 font-medium">
                📦 Pedido enviado via {tipoEntregaAtual === 'ups' ? 'UPS' : tipoEntregaAtual === 'pessoal' ? 'Entrega Pessoal' : '—'}
              </p>
              {trackingAtual && (
                <a href={trackingAtual} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline break-all">
                  🔍 Rastrear pedido: {trackingAtual}
                </a>
              )}
            </div>
          )}
          {statusEntregaAtual === 'entregue' && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="text-sm text-green-700 font-medium">
                ✅ Pedido entregue via {tipoEntregaAtual === 'ups' ? 'UPS' : tipoEntregaAtual === 'pessoal' ? 'Entrega Pessoal' : '—'}
              </p>
            </div>
          )}
          {!statusEntregaAtual && (
            <p className="mt-3 text-xs text-gray-400">Use os botões <strong>Enviado</strong> ou <strong>Entregue</strong> na barra abaixo para atualizar o status.</p>
          )}
        </div>
      )}

      {/* Modal de seleção de produto */}
      {produtoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setProdutoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">{produtoModal.nome}</h3>
                <p className="text-xs text-gray-400">Preço padrão: {formatCurrency(produtoModal.preco_venda)}</p>
              </div>
              <button onClick={() => setProdutoModal(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço unitário</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={produtoModalPreco}
                  onChange={e => setProdutoModalPreco(parseFloat(e.target.value) || 0)}
                  className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-lg font-semibold focus:outline-none focus:border-[#C9A227]"
                />
              </div>
              {produtoModalPreco !== produtoModal.preco_venda && (
                <button
                  type="button"
                  onClick={() => setProdutoModalPreco(produtoModal.preco_venda)}
                  className="text-xs text-[#C9A227] mt-1 hover:underline"
                >
                  Restaurar preço padrão ({formatCurrency(produtoModal.preco_venda)})
                </button>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setProdutoModalQty(q => Math.max(1, q - 1))} className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-100"><Minus className="w-4 h-4" /></button>
                <input type="number" min="1" value={produtoModalQty} onChange={e => setProdutoModalQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-20 text-center text-lg font-bold border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-[#C9A227]" />
                <button onClick={() => setProdutoModalQty(q => q + 1)} className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-100"><Plus className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Subtotal: <span className="font-semibold text-[#C9A227]">{formatCurrency(produtoModalPreco * produtoModalQty)}</span></p>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação do item <span className="text-gray-400 font-normal">(aparece na nota)</span></label>
              <input type="text" value={produtoModalObs} onChange={e => setProdutoModalObs(e.target.value)} placeholder="Ex: Tamanho G, cor preta..." className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#C9A227]" autoFocus />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setProdutoModal(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={confirmProdutoModal} className="flex-[2] py-3 rounded-xl bg-[#C9A227] text-white font-bold hover:bg-[#b8911f]">Adicionar à Nota</button>
            </div>
          </div>
        </div>
      )}

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
          {isEditing && statusEntregaAtual !== 'entregue' && (
            <button
              onClick={() => { setTipoEntregaModal(''); setShowEnviadoModal(true); }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-blue-400 text-blue-600 text-sm font-medium hover:bg-blue-50 bg-white"
            >
              <Truck className="w-4 h-4" />
              <span className="hidden sm:inline">{statusEntregaAtual === 'enviado' ? 'Re-Enviado' : 'Enviado'}</span>
            </button>
          )}
          {isEditing && statusEntregaAtual !== 'entregue' && (
            <button
              onClick={() => { setTipoEntregaModal(''); setShowEntregueModal(true); }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-green-500 text-green-600 text-sm font-medium hover:bg-green-50 bg-white"
            >
              <PackageCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Entregue</span>
            </button>
          )}
          <button onClick={handleSend} disabled={saving} className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-[#C9A227] text-white text-sm font-bold hover:bg-[#b8911f] disabled:opacity-60 shadow">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar WhatsApp
          </button>
        </div>
      </div>
    </div>

      {/* Modal Novo Cliente Rápido */}
    {showNovoClienteModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Novo Cliente Rápido</h3>
            <button onClick={() => setShowNovoClienteModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input type="text" value={novoClienteForm.nome} onChange={e => setNovoClienteForm(p => ({...p, nome: e.target.value}))} placeholder="Nome completo" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input type="text" value={novoClienteForm.telefone} onChange={e => setNovoClienteForm(p => ({...p, telefone: e.target.value}))} placeholder="+1 (555) 000-0000" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={novoClienteForm.email} onChange={e => setNovoClienteForm(p => ({...p, email: e.target.value}))} placeholder="email@exemplo.com" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A227]"/>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowNovoClienteModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancelar</button>
            <button onClick={handleCriarClienteRapido} disabled={savingNovoCliente} className="flex-[2] py-2.5 rounded-xl bg-[#C9A227] text-white text-sm font-bold hover:bg-[#9A7B1A] disabled:opacity-50 flex items-center justify-center gap-2">
              {savingNovoCliente ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <UserPlus className="w-4 h-4"/>}
              Criar e Selecionar
            </button>
          </div>
        </div>
      </div>
    )}
    {/* Modal Enviado */}
    {showEnviadoModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Truck className="w-5 h-5 text-blue-500" /> Marcar como Enviado</h3>
            <button onClick={() => setShowEnviadoModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-gray-500">Como o pedido foi enviado?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setTipoEntregaModal('pessoal')}
              className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 font-medium text-sm transition-colors ${tipoEntregaModal === 'pessoal' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
            >
              🚗 <span>Entrega Pessoal</span>
            </button>
            <button
              onClick={() => setTipoEntregaModal('ups')}
              className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 font-medium text-sm transition-colors ${tipoEntregaModal === 'ups' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
            >
              📦 <span>Via UPS</span>
            </button>
          </div>
          {tipoEntregaModal === 'ups' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link de rastreio UPS (opcional)</label>
              <input
                type="url"
                value={trackingUrlModal}
                onChange={e => setTrackingUrlModal(e.target.value)}
                placeholder="https://www.ups.com/track?tracknum=..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
          )}
          {!cliente?.telefone && <p className="text-xs text-orange-500">⚠️ Cliente sem telefone — o WhatsApp não será aberto.</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowEnviadoModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancelar</button>
            <button onClick={handleConfirmarEnviado} disabled={salvandoEntrega || !tipoEntregaModal} className="flex-[2] py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {salvandoEntrega ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Truck className="w-4 h-4" />}
              Confirmar e Notificar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal Entregue */}
    {showEntregueModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><PackageCheck className="w-5 h-5 text-green-500" /> Marcar como Entregue</h3>
            <button onClick={() => setShowEntregueModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-gray-500">Como o pedido foi entregue?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setTipoEntregaModal('pessoal')}
              className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 font-medium text-sm transition-colors ${tipoEntregaModal === 'pessoal' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-green-300'}`}
            >
              🚗 <span>Entrega Pessoal</span>
            </button>
            <button
              onClick={() => setTipoEntregaModal('ups')}
              className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 font-medium text-sm transition-colors ${tipoEntregaModal === 'ups' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-green-300'}`}
            >
              📦 <span>Via UPS</span>
            </button>
          </div>
          {!cliente?.telefone && <p className="text-xs text-orange-500">⚠️ Cliente sem telefone — o WhatsApp não será aberto.</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowEntregueModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancelar</button>
            <button onClick={handleConfirmarEntregue} disabled={salvandoEntrega || !tipoEntregaModal} className="flex-[2] py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {salvandoEntrega ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <PackageCheck className="w-4 h-4" />}
              Confirmar e Notificar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
