import { collection, query, where, getDocs, Timestamp, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invoice } from '@/types';

// Configurações de lembretes
export interface LembreteConfig {
  diasAntesVencimento: number[]; // Ex: [3, 1] = 3 dias antes e 1 dia antes
  diasAposVencimento: number[]; // Ex: [1, 7, 15] = 1, 7 e 15 dias após
  enviarEmail: boolean;
  enviarWhatsApp: boolean;
  templateEmail: string;
  templateWhatsApp: string;
}

// Configuração padrão
export const defaultLembreteConfig: LembreteConfig = {
  diasAntesVencimento: [3, 1],
  diasAposVencimento: [1, 7, 15],
  enviarEmail: true,
  enviarWhatsApp: true,
  templateEmail: `Olá {clienteNome},

Esperamos que esteja bem!

Gostaríamos de lembrar sobre a sua fatura pendente:

Número: {faturaNumero}
Valor: {faturaValor}
Vencimento: {dataVencimento}
{statusPagamento}

Acesse a fatura online: {faturaLink}

Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.

Obrigado pela preferência!
BBVIC HAIR CARE`,
  templateWhatsApp: `Olá {clienteNome}! 👋

Lembrete de pagamento:

📄 Fatura: {faturaNumero}
💰 Valor: {faturaValor}
📅 Vencimento: {dataVencimento}

Acesse: {faturaLink}

Obrigado! 🙏`
};

// Verificar faturas que precisam de lembrete
export async function verificarFaturasParaLembrete(vendedorId?: string): Promise<{
  faturas: Invoice[];
  tipo: 'antes' | 'apos';
  dias: number;
}[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Buscar configurações
  const configSnap = await getDocs(collection(db, 'configuracoes'));
  const config = configSnap.docs[0]?.data()?.lembretes as LembreteConfig || defaultLembreteConfig;

  // Buscar faturas pendentes
  let q = query(
    collection(db, 'invoices'),
    where('status', 'in', ['enviado', 'visualizado', 'parcial', 'atrasado'])
  );

  if (vendedorId) {
    q = query(q, where('vendedor_id', '==', vendedorId));
  }

  const snapshot = await getDocs(q);
  const faturas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Invoice[];

  const faturasParaLembrete: { faturas: Invoice[]; tipo: 'antes' | 'apos'; dias: number }[] = [];

  // Verificar lembretes ANTES do vencimento
  for (const dias of config.diasAntesVencimento) {
    const dataLimite = new Date(hoje);
    dataLimite.setDate(hoje.getDate() + dias);

    const faturasDia = faturas.filter(f => {
      const vencimento = new Date((f.data_vencimento as any)?.toDate?.() || f.data_vencimento);
      vencimento.setHours(0, 0, 0, 0);

      // Verifica se vence no dia específico
      const diffDias = Math.round((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      return diffDias === dias;
    });

    if (faturasDia.length > 0) {
      faturasParaLembrete.push({ faturas: faturasDia, tipo: 'antes', dias });
    }

  }

  // Verificar lembretes APÓS o vencimento
  for (const dias of config.diasAposVencimento) {
    const dataLimite = new Date(hoje);
    dataLimite.setDate(hoje.getDate() - dias);

    const faturasDia = faturas.filter(f => {
      const vencimento = new Date((f.data_vencimento as any)?.toDate?.() || f.data_vencimento);
      vencimento.setHours(0, 0, 0, 0);

      const diffDias = Math.round((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
      return diffDias === dias && f.status !== 'pago';
    });

    if (faturasDia.length > 0) {
      faturasParaLembrete.push({ faturas: faturasDia, tipo: 'apos', dias });
    }

  }

  return faturasParaLembrete;
}

// Enviar lembrete por email
export async function enviarLembreteEmail(
  invoice: Invoice,
  _tipo: 'antes' | 'apos',
  _dias: number,
  config: LembreteConfig
): Promise<boolean> {
  try {
    if (!invoice.cliente_email) return false;

    const template = config.templateEmail;
    const vencimento = new Date((invoice.data_vencimento as any)?.toDate?.() || invoice.data_vencimento);

    let statusText = '';
    if (invoice.status === 'parcial') {
      statusText = `\nValor já pago: $${(invoice.valor_pago || 0).toFixed(2)}\nSaldo restante: $${(invoice.valor_restante || 0).toFixed(2)}`;
    }

    const body = template
      .replace('{clienteNome}', invoice.cliente_nome)
      .replace('{faturaNumero}', invoice.numero)
      .replace('{faturaValor}', `$${invoice.total.toFixed(2)}`)
      .replace('{dataVencimento}', vencimento.toLocaleDateString('pt-BR'))
      .replace('{statusPagamento}', statusText)
      .replace('{faturaLink}', `${window.location.origin}/#/invoice/${invoice.public_token}`);

    const subject = _tipo === 'antes'
      ? `Lembrete: Sua fatura vence em ${_dias} dia(s)`
      : `Atenção: Sua fatura está atrasada há ${_dias} dia(s)`;

    // Abrir cliente de email
    window.open(`mailto:${invoice.cliente_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');

    // Registrar envio
    await addDoc(collection(db, 'lembretes_enviados'), {
      invoice_id: invoice.id,
      cliente_id: invoice.cliente_id,
      cliente_nome: invoice.cliente_nome,
      tipo: 'email',
      assunto: subject,
      enviado_em: Timestamp.now(),
      vendedor_id: invoice.vendedor_id,
    });

    return true;

  } catch (error) {
    console.error('Erro ao enviar lembrete por email:', error);
    return false;
  }
}

// Enviar lembrete por WhatsApp
export async function enviarLembreteWhatsApp(
  invoice: Invoice,
  _tipo: 'antes' | 'apos',
  _dias: number,
  config: LembreteConfig
): Promise<boolean> {
  try {
    if (!invoice.cliente_telefone) return false;

    const template = config.templateWhatsApp;
    const vencimento = new Date((invoice.data_vencimento as any)?.toDate?.() || invoice.data_vencimento);

    let statusText = '';
    if (invoice.status === 'parcial') {
      statusText = `\n✅ Já pago: $${(invoice.valor_pago || 0).toFixed(2)}\n⏳ Resta: $${(invoice.valor_restante || 0).toFixed(2)}`;
    }

    const message = template
      .replace('{clienteNome}', invoice.cliente_nome)
      .replace('{faturaNumero}', invoice.numero)
      .replace('{faturaValor}', `$${invoice.total.toFixed(2)}`)
      .replace('{dataVencimento}', vencimento.toLocaleDateString('pt-BR'))
      .replace('{statusPagamento}', statusText)
      .replace('{faturaLink}', `${window.location.origin}/#/invoice/${invoice.public_token}`);

    const phone = invoice.cliente_telefone.replace(/\D/g, '');
    window.open(`https://wa.me/1${phone}?text=${encodeURIComponent(message)}`, '_blank');

    // Registrar envio
    await addDoc(collection(db, 'lembretes_enviados'), {
      invoice_id: invoice.id,
      cliente_id: invoice.cliente_id,
      cliente_nome: invoice.cliente_nome,
      tipo: 'whatsapp',
      enviado_em: Timestamp.now(),
      vendedor_id: invoice.vendedor_id,
    });

    return true;

  } catch (error) {
    console.error('Erro ao enviar lembrete por WhatsApp:', error);
    return false;
  }
}

// Enviar todos os lembretes pendentes
export async function enviarTodosLembretes(vendedorId?: string): Promise<{
  total: number;
  enviados: number;
  erros: number;
}> {
  const faturasParaLembrete = await verificarFaturasParaLembrete(vendedorId);

  let total = 0;
  let enviados = 0;
  let erros = 0;

  // Buscar configurações
  const configSnap = await getDocs(collection(db, 'configuracoes'));
  const config = configSnap.docs[0]?.data()?.lembretes as LembreteConfig || defaultLembreteConfig;

  for (const grupo of faturasParaLembrete) {
    for (const invoice of grupo.faturas) {
      total++;

      try {
        let sucesso = false;

        if (config.enviarEmail && invoice.cliente_email) {
          sucesso = await enviarLembreteEmail(invoice, grupo.tipo, grupo.dias, config) || sucesso;
        }

        if (config.enviarWhatsApp && invoice.cliente_telefone) {
          sucesso = await enviarLembreteWhatsApp(invoice, grupo.tipo, grupo.dias, config) || sucesso;
        }

        if (sucesso) {
          enviados++;

          // Atualizar contador de lembretes na fatura
          await updateDoc(doc(db, 'invoices', invoice.id!), {
            lembretes_enviados: (invoice.lembretes_enviados || 0) + 1,
            ultimo_lembrete: Timestamp.now(),
          });
        } else {
          erros++;
        }
      } catch (error) {
        console.error('Erro ao processar lembrete:', error);
        erros++;
      }
    }

  }

  return { total, enviados, erros };
}
