import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface RegistroPonto {
  id?: string;
  vendedor_id: string;
  vendedor_nome: string;
  tipo: 'entrada' | 'saida' | 'intervalo_inicio' | 'intervalo_fim';
  timestamp: Date;
  localizacao?: {
    latitude: number;
    longitude: number;
    endereco?: string;
  };
  notas?: string;
  foto_url?: string;
  aprovado: boolean;
  aprovado_por?: string;
  aprovado_em?: Date;
}

export interface JornadaTrabalho {
  id?: string;
  vendedor_id: string;
  vendedor_nome: string;
  data: Date;
  entrada?: Date;
  saida?: Date;
  intervalos: { inicio: Date; fim?: Date }[];
  horas_trabalhadas: number;
  horas_intervalo: number;
  horas_totais: number;
  status: 'incompleto' | 'completo' | 'em_andamento';
  observacoes?: string;
}

// Registrar ponto
export async function registrarPonto(
  vendedorId: string,
  vendedorNome: string,
  tipo: RegistroPonto['tipo'],
  options?: {
    localizacao?: RegistroPonto['localizacao'];
    notas?: string;
    foto_url?: string;
  }
): Promise<string | null> {
  try {
    const docRef = await addDoc(collection(db, 'registros_ponto'), {
      vendedor_id: vendedorId,
      vendedor_nome: vendedorNome,
      tipo,
      timestamp: Timestamp.now(),
      localizacao: options?.localizacao || null,
      notas: options?.notas || null,
      foto_url: options?.foto_url || null,
      aprovado: false,
      created_at: Timestamp.now(),
    });

    // Atualizar ou criar jornada do dia
    await atualizarJornadaDia(vendedorId, vendedorNome);

    return docRef.id;

  } catch (error) {
    console.error('Erro ao registrar ponto:', error);
    return null;
  }
}

// Atualizar jornada do dia
async function atualizarJornadaDia(vendedorId: string, vendedorNome: string): Promise<void> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  // Buscar registros de hoje
  const q = query(
    collection(db, 'registros_ponto'),
    where('vendedor_id', '==', vendedorId),
    where('timestamp', '>=', Timestamp.fromDate(hoje)),
    where('timestamp', '<', Timestamp.fromDate(amanha))
  );

  const snapshot = await getDocs(q);
  const registros = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    timestamp: (doc.data().timestamp as any).toDate(),
  })) as RegistroPonto[];

  // Ordenar por timestamp
  registros.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Calcular jornada
  const entrada = registros.find(r => r.tipo === 'entrada')?.timestamp;
  const saida = registros.find(r => r.tipo === 'saida')?.timestamp;

  const intervalos: { inicio: Date; fim?: Date }[] = [];
  let intervaloAtual: { inicio: Date; fim?: Date } | null = null;

  for (const reg of registros) {
    if (reg.tipo === 'intervalo_inicio') {
      intervaloAtual = { inicio: reg.timestamp };
    } else if (reg.tipo === 'intervalo_fim' && intervaloAtual) {
      intervaloAtual.fim = reg.timestamp;
      intervalos.push(intervaloAtual);
      intervaloAtual = null;
    }
  }

  // Calcular horas
  let horasTrabalhadas = 0;
  let horasIntervalo = 0;

  if (entrada) {
    const fim = saida || new Date();
    const diffMs = fim.getTime() - entrada.getTime();
    horasTrabalhadas = diffMs / (1000 * 60 * 60);

    // Subtrair intervalos
    for (const int of intervalos) {
      if (int.fim) {
        const intMs = int.fim.getTime() - int.inicio.getTime();
        horasIntervalo += intMs / (1000 * 60 * 60);
      }
    }

  }

  const horasTotais = horasTrabalhadas - horasIntervalo;

  // Determinar status
  let status: JornadaTrabalho['status'] = 'incompleto';
  if (entrada && saida) {
    status = 'completo';
  } else if (entrada) {
    status = 'em_andamento';
  }

  // Buscar jornada existente
  const jornadaQuery = query(
    collection(db, 'jornadas_trabalho'),
    where('vendedor_id', '==', vendedorId),
    where('data', '>=', Timestamp.fromDate(hoje)),
    where('data', '<', Timestamp.fromDate(amanha))
  );

  const jornadaSnap = await getDocs(jornadaQuery);

  const jornadaData = {
    vendedor_id: vendedorId,
    vendedor_nome: vendedorNome,
    data: Timestamp.fromDate(hoje),
    entrada: entrada ? Timestamp.fromDate(entrada) : null,
    saida: saida ? Timestamp.fromDate(saida) : null,
    intervalos: intervalos.map(i => ({
      inicio: Timestamp.fromDate(i.inicio),
      fim: i.fim ? Timestamp.fromDate(i.fim) : null,
    })),
    horas_trabalhadas: Math.round(horasTrabalhadas * 100) / 100,
    horas_intervalo: Math.round(horasIntervalo * 100) / 100,
    horas_totais: Math.round(horasTotais * 100) / 100,
    status,
    updated_at: Timestamp.now(),
  };

  if (jornadaSnap.empty) {
    await addDoc(collection(db, 'jornadas_trabalho'), {
      ...jornadaData,
      created_at: Timestamp.now(),
    });
  } else {
    await updateDoc(doc(db, 'jornadas_trabalho', jornadaSnap.docs[0].id), jornadaData);
  }
}

// Buscar jornadas do vendedor
export async function buscarJornadas(
  vendedorId?: string,
  dataInicio?: Date,
  dataFim?: Date
): Promise<JornadaTrabalho[]> {
  try {
    let q = query(collection(db, 'jornadas_trabalho'), where('vendedor_id', '==', vendedorId));

    if (dataInicio) {
      q = query(q, where('data', '>=', Timestamp.fromDate(dataInicio)));
    }
    if (dataFim) {
      q = query(q, where('data', '<=', Timestamp.fromDate(dataFim)));
    }

    q = query(q, orderBy('data', 'desc'));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      data: (doc.data().data as any).toDate(),
      entrada: doc.data().entrada ? (doc.data().entrada as any).toDate() : undefined,
      saida: doc.data().saida ? (doc.data().saida as any).toDate() : undefined,
      intervalos: doc.data().intervalos?.map((i: any) => ({
        inicio: i.inicio.toDate(),
        fim: i.fim ? i.fim.toDate() : undefined,
      })) || [],
    })) as JornadaTrabalho[];

  } catch (error) {
    console.error('Erro ao buscar jornadas:', error);
    return [];
  }
}

// Buscar todos os registros de ponto (para admin)
export async function buscarTodosRegistros(
  dataInicio?: Date,
  dataFim?: Date
): Promise<RegistroPonto[]> {
  try {
    let q = query(collection(db, 'registros_ponto'));

    if (dataInicio) {
      q = query(q, where('timestamp', '>=', Timestamp.fromDate(dataInicio)));
    }
    if (dataFim) {
      q = query(q, where('timestamp', '<=', Timestamp.fromDate(dataFim)));
    }

    q = query(q, orderBy('timestamp', 'desc'));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: (doc.data().timestamp as any).toDate(),
    })) as RegistroPonto[];

  } catch (error) {
    console.error('Erro ao buscar registros:', error);
    return [];
  }
}

// Aprovar registro de ponto
export async function aprovarRegistro(
  registroId: string,
  adminId: string
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'registros_ponto', registroId), {
      aprovado: true,
      aprovado_por: adminId,
      aprovado_em: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Erro ao aprovar registro:', error);
    return false;
  }
}

// Verificar se vendedor está trabalhando
export async function verificarStatusTrabalho(vendedorId: string): Promise<{
  trabalhando: boolean;
  emIntervalo: boolean;
  ultimoRegistro?: RegistroPonto;
}> {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    const q = query(
      collection(db, 'registros_ponto'),
      where('vendedor_id', '==', vendedorId),
      where('timestamp', '>=', Timestamp.fromDate(hoje)),
      where('timestamp', '<', Timestamp.fromDate(amanha)),
      orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return { trabalhando: false, emIntervalo: false };
    }

    const registros = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: (doc.data().timestamp as any).toDate(),
    })) as RegistroPonto[];

    const ultimoRegistro = registros[0];
    const trabalhando = ultimoRegistro.tipo === 'entrada' || ultimoRegistro.tipo === 'intervalo_fim';
    const emIntervalo = ultimoRegistro.tipo === 'intervalo_inicio';

    return { trabalhando, emIntervalo, ultimoRegistro };

  } catch (error) {
    console.error('Erro ao verificar status:', error);
    return { trabalhando: false, emIntervalo: false };
  }
}

// Calcular horas extras
export function calcularHorasExtras(
  horasTrabalhadas: number,
  horasNormais: number = 8
): { extras: number; valorExtras: number; valorNormal: number } {
  const extras = Math.max(0, horasTrabalhadas - horasNormais);
  const valorHora = 15; // Valor base por hora (ajustável)
  const valorExtras = extras * valorHora * 1.5; // 50% a mais
  const valorNormal = Math.min(horasTrabalhadas, horasNormais) * valorHora;

  return { extras, valorExtras, valorNormal };
}

// Gerar relatório de ponto para pagamento
export async function gerarRelatorioPagamento(
  vendedorId: string,
  dataInicio: Date,
  dataFim: Date
): Promise<{
  totalHoras: number;
  horasExtras: number;
  valorTotal: number;
  diasTrabalhados: number;
  jornadas: JornadaTrabalho[];
}> {
  const jornadas = await buscarJornadas(vendedorId, dataInicio, dataFim);

  let totalHoras = 0;
  let horasExtras = 0;
  let valorTotal = 0;
  const diasTrabalhados = jornadas.filter(j => j.status === 'completo').length;

  for (const jornada of jornadas) {
    totalHoras += jornada.horas_totais;
    const { extras, valorExtras, valorNormal } = calcularHorasExtras(jornada.horas_totais);
    horasExtras += extras;
    valorTotal += valorNormal + valorExtras;
  }

  return {
    totalHoras: Math.round(totalHoras * 100) / 100,
    horasExtras: Math.round(horasExtras * 100) / 100,
    valorTotal: Math.round(valorTotal * 100) / 100,
    diasTrabalhados,
    jornadas,
  };
}
