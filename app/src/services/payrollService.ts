import { collection, query, where, getDocs, addDoc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Configurações de Payroll
export const TAXAS_PAYROLL = {
  social_security: 0.062, // 6.2% - Empregador
  medicare: 0.0145, // 1.45% - Empregador
  futa: 0.006, // 0.6% - Federal Unemployment (apenas nos primeiros $7,000)
  sui: 0.027, // 2.7% - State Unemployment (varia por estado)
};

export interface Funcionario {
  id?: string;
  nome: string;
  email: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;

  // Dados fiscais
  ssn?: string; // Social Security Number (mascarado)
  ein?: string; // Employer Identification Number
  tipo_contratacao: 'w2' | '1099';

  // Dados de pagamento
  salario_hora: number;
  horas_semanais: number;
  data_contratacao: Date;
  status: 'ativo' | 'inativo';

  // Metadados
  created_at: Date;
  updated_at: Date;
}

export interface Pagamento {
  id?: string;
  funcionario_id: string;
  funcionario_nome: string;
  tipo_contratacao: 'w2' | '1099';

  // Período
  periodo_inicio: Date;
  periodo_fim: Date;
  data_pagamento: Date;

  // Horas e valores
  horas_trabalhadas: number;
  horas_extras: number;
  salario_bruto: number;

  // Descontos (W-2)
  desconto_ss?: number; // Social Security (6.2%)
  desconto_medicare?: number; // Medicare (1.45%)
  desconto_federal?: number; // Federal Income Tax
  desconto_state?: number; // State Income Tax
  desconto_outros?: number; // Outros descontos

  // Contribuições do empregador
  contribuicao_ss?: number;
  contribuicao_medicare?: number;
  contribuicao_futa?: number;
  contribuicao_sui?: number;

  // Totais
  total_descontos: number;
  salario_liquido: number;
  custo_total_empregador: number;

  // Metadados
  processado: boolean;
  created_at: Date;
}

// Criar funcionário
export async function criarFuncionario(
  data: Omit<Funcionario, 'id' | 'created_at' | 'updated_at'>
): Promise<string | null> {
  try {
    const docRef = await addDoc(collection(db, 'funcionarios'), {
      ...data,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Erro ao criar funcionário:', error);
    return null;
  }
}

// Buscar funcionários
export async function buscarFuncionarios(
  ativos: boolean = true
): Promise<Funcionario[]> {
  try {
    const q = query(
      collection(db, 'funcionarios'),
      where('status', '==', ativos ? 'ativo' : 'inativo'),
      orderBy('nome')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      data_contratacao: (doc.data().data_contratacao as any)?.toDate?.() || doc.data().data_contratacao,
      created_at: (doc.data().created_at as any)?.toDate?.() || doc.data().created_at,
      updated_at: (doc.data().updated_at as any)?.toDate?.() || doc.data().updated_at,
    })) as Funcionario[];

  } catch (error) {
    console.error('Erro ao buscar funcionários:', error);
    return [];
  }
}

// Calcular pagamento
export function calcularPagamento(
  funcionario: Funcionario,
  horasTrabalhadas: number,
  horasExtras: number = 0
): Omit<Pagamento, 'id' | 'funcionario_id' | 'funcionario_nome' | 'created_at'> {
  const salarioHora = funcionario.salario_hora;
  const salarioBase = horasTrabalhadas * salarioHora;
  const salarioExtras = horasExtras * salarioHora * 1.5; // 50% a mais
  const salarioBruto = salarioBase + salarioExtras;

  let descontoSS = 0;
  let descontoMedicare = 0;
  let descontoFederal = 0;
  let descontoState = 0;

  let contribuicaoSS = 0;
  let contribuicaoMedicare = 0;
  let contribuicaoFUTA = 0;
  let contribuicaoSUI = 0;

  if (funcionario.tipo_contratacao === 'w2') {
    // Descontos do funcionário
    descontoSS = salarioBruto * 0.062; // 6.2%
    descontoMedicare = salarioBruto * 0.0145; // 1.45%
    descontoFederal = salarioBruto * 0.12; // Estimado 12% (varia conforme bracket)
    descontoState = salarioBruto * 0.05; // Estimado 5% (varia por estado)

    // Contribuições do empregador
    contribuicaoSS = salarioBruto * TAXAS_PAYROLL.social_security;
    contribuicaoMedicare = salarioBruto * TAXAS_PAYROLL.medicare;
    contribuicaoFUTA = Math.min(salarioBruto, 7000) * TAXAS_PAYROLL.futa;
    contribuicaoSUI = salarioBruto * TAXAS_PAYROLL.sui;

  }

  // Para 1099, não há descontos (o contratado paga os impostos)
  const totalDescontos = descontoSS + descontoMedicare + descontoFederal + descontoState;
  const salarioLiquido = salarioBruto - totalDescontos;

  const custoTotalEmpregador = salarioBruto + contribuicaoSS + contribuicaoMedicare + contribuicaoFUTA + contribuicaoSUI;

  return {
    tipo_contratacao: funcionario.tipo_contratacao,
    periodo_inicio: new Date(),
    periodo_fim: new Date(),
    data_pagamento: new Date(),
    horas_trabalhadas: horasTrabalhadas,
    horas_extras: horasExtras,
    salario_bruto: Math.round(salarioBruto * 100) / 100,
    desconto_ss: Math.round(descontoSS * 100) / 100,
    desconto_medicare: Math.round(descontoMedicare * 100) / 100,
    desconto_federal: Math.round(descontoFederal * 100) / 100,
    desconto_state: Math.round(descontoState * 100) / 100,
    contribuicao_ss: Math.round(contribuicaoSS * 100) / 100,
    contribuicao_medicare: Math.round(contribuicaoMedicare * 100) / 100,
    contribuicao_futa: Math.round(contribuicaoFUTA * 100) / 100,
    contribuicao_sui: Math.round(contribuicaoSUI * 100) / 100,
    total_descontos: Math.round(totalDescontos * 100) / 100,
    salario_liquido: Math.round(salarioLiquido * 100) / 100,
    custo_total_empregador: Math.round(custoTotalEmpregador * 100) / 100,
    processado: false,
  };
}

// Processar pagamento
export async function processarPagamento(
  funcionario: Funcionario,
  horasTrabalhadas: number,
  horasExtras: number = 0,
  periodoInicio: Date,
  periodoFim: Date
): Promise<string | null> {
  try {
    const calculo = calcularPagamento(funcionario, horasTrabalhadas, horasExtras);

    const docRef = await addDoc(collection(db, 'pagamentos'), {
      funcionario_id: funcionario.id,
      funcionario_nome: funcionario.nome,
      ...calculo,
      periodo_inicio: Timestamp.fromDate(periodoInicio),
      periodo_fim: Timestamp.fromDate(periodoFim),
      data_pagamento: Timestamp.now(),
      created_at: Timestamp.now(),
    });

    return docRef.id;

  } catch (error) {
    console.error('Erro ao processar pagamento:', error);
    return null;
  }
}

// Buscar pagamentos
export async function buscarPagamentos(
  funcionarioId?: string,
  dataInicio?: Date,
  dataFim?: Date
): Promise<Pagamento[]> {
  try {
    let q = query(collection(db, 'pagamentos'), orderBy('data_pagamento', 'desc'));

    if (funcionarioId) {
      q = query(q, where('funcionario_id', '==', funcionarioId));
    }
    if (dataInicio) {
      q = query(q, where('data_pagamento', '>=', Timestamp.fromDate(dataInicio)));
    }
    if (dataFim) {
      q = query(q, where('data_pagamento', '<=', Timestamp.fromDate(dataFim)));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      periodo_inicio: (doc.data().periodo_inicio as any)?.toDate?.() || doc.data().periodo_inicio,
      periodo_fim: (doc.data().periodo_fim as any)?.toDate?.() || doc.data().periodo_fim,
      data_pagamento: (doc.data().data_pagamento as any)?.toDate?.() || doc.data().data_pagamento,
      created_at: (doc.data().created_at as any)?.toDate?.() || doc.data().created_at,
    })) as Pagamento[];

  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    return [];
  }
}

// Gerar dados para formulário 1099-NEC
export async function gerarDados1099(
  ano: number
): Promise<{
  contratados: {
    funcionario_id: string;
    nome: string;
    ssn: string;
    total_pago: number;
  }[];
  totalGeral: number;
}> {
  try {
    const dataInicio = new Date(ano, 0, 1);
    const dataFim = new Date(ano, 11, 31, 23, 59, 59);

    const funcionarios = await buscarFuncionarios(true);
    const contratados1099 = funcionarios.filter(f => f.tipo_contratacao === '1099');

    const resultado = [];
    let totalGeral = 0;

    for (const func of contratados1099) {
      const pagamentos = await buscarPagamentos(func.id, dataInicio, dataFim);
      const totalPago = pagamentos.reduce((acc, p) => acc + p.salario_bruto, 0);

      if (totalPago > 0) {
        resultado.push({
          funcionario_id: func.id!,
          nome: func.nome,
          ssn: func.ssn || '***-**-****',
          total_pago: totalPago,
        });
        totalGeral += totalPago;
      }
    }

    return { contratados: resultado, totalGeral };

  } catch (error) {
    console.error('Erro ao gerar dados 1099:', error);
    return { contratados: [], totalGeral: 0 };
  }
}

// Gerar relatório de payroll
export async function gerarRelatorioPayroll(
  dataInicio: Date,
  dataFim: Date
): Promise<{
  totalSalariosBrutos: number;
  totalDescontos: number;
  totalSalariosLiquidos: number;
  totalContribuicoesEmpregador: number;
  custoTotal: number;
  pagamentos: Pagamento[];
}> {
  const pagamentos = await buscarPagamentos(undefined, dataInicio, dataFim);

  const totalSalariosBrutos = pagamentos.reduce((acc, p) => acc + p.salario_bruto, 0);
  const totalDescontos = pagamentos.reduce((acc, p) => acc + p.total_descontos, 0);
  const totalSalariosLiquidos = pagamentos.reduce((acc, p) => acc + p.salario_liquido, 0);
  const totalContribuicoesEmpregador = pagamentos.reduce((acc, p) => acc +
    (p.contribuicao_ss || 0) + (p.contribuicao_medicare || 0) +
    (p.contribuicao_futa || 0) + (p.contribuicao_sui || 0), 0);

  return {
    totalSalariosBrutos: Math.round(totalSalariosBrutos * 100) / 100,
    totalDescontos: Math.round(totalDescontos * 100) / 100,
    totalSalariosLiquidos: Math.round(totalSalariosLiquidos * 100) / 100,
    totalContribuicoesEmpregador: Math.round(totalContribuicoesEmpregador * 100) / 100,
    custoTotal: Math.round((totalSalariosBrutos + totalContribuicoesEmpregador) * 100) / 100,
    pagamentos,
  };
}
