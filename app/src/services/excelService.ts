// ============================================
// BBVIC GESTÃO - SERVIÇO DE IMPORTAÇÃO/EXPORTAÇÃO EXCEL
// ============================================

import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import type { Cliente, Produto } from '@/types';

// ============================================
// CLIENTES - EXPORTAÇÃO
// ============================================

export function exportClientesToExcel(clientes: Cliente[]) {
  try {
    // Preparar dados para exportação
    const data = clientes.map(cliente => ({
      'Nome': cliente.nome,
      'Email': cliente.email || '',
      'Telefone': cliente.telefone || '',
      'Empresa': cliente.empresa || '',
      'Endereço': cliente.endereco || '',
      'Cidade': cliente.cidade || '',
      'Estado': cliente.estado || '',
      'CEP': cliente.cep || '',
      'Notas': cliente.notas || '',
      'Status': cliente.status === 'ativo' ? 'Ativo' : 'Inativo',
      'Data Cadastro': cliente.created_at ? new Date((cliente.created_at as any).toDate?.() || cliente.created_at).toLocaleDateString('pt-BR') : '',
    }));

    // Criar workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Ajustar largura das colunas
    const colWidths = [
      { wch: 30 }, // Nome
      { wch: 30 }, // Email
      { wch: 15 }, // Telefone
      { wch: 25 }, // Empresa
      { wch: 35 }, // Endereço
      { wch: 20 }, // Cidade
      { wch: 5 },  // Estado
      { wch: 10 }, // CEP
      { wch: 40 }, // Notas
      { wch: 10 }, // Status
      { wch: 15 }, // Data Cadastro
    ];
    ws['!cols'] = colWidths;

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');

    // Gerar arquivo
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `BBVIC_Clientes_${date}.xlsx`);

    toast.success(`${clientes.length} clientes exportados com sucesso!`);
  } catch (error) {
    console.error('Erro ao exportar clientes:', error);
    toast.error('Erro ao exportar clientes');
  }
}

// ============================================
// CLIENTES - IMPORTAÇÃO
// ============================================

export interface ImportClienteResult {
  success: number;
  errors: number;
  errorDetails: string[];
  data: Partial<Cliente>[];
}

export function parseClientesFromExcel(file: File): Promise<ImportClienteResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (jsonData.length < 2) {
          reject(new Error('O arquivo está vazio ou não contém dados'));
          return;
        }
        
        // Mapear cabeçalhos (primeira linha)
        const headers = jsonData[0].map((h: any) => String(h).toLowerCase().trim());
        
        // Encontrar índices das colunas
        const getIndex = (names: string[]) => {
          for (const name of names) {
            const idx = headers.findIndex(h => h.includes(name.toLowerCase()));
            if (idx !== -1) return idx;
          }
          return -1;
        };
        
        const nomeIdx = getIndex(['nome', 'name', 'cliente']);
        const emailIdx = getIndex(['email', 'e-mail', 'mail']);
        const telefoneIdx = getIndex(['telefone', 'tel', 'phone', 'celular', 'whatsapp']);
        const empresaIdx = getIndex(['empresa', 'company']);
        const enderecoIdx = getIndex(['endereco', 'endereço', 'address', 'rua']);
        const cidadeIdx = getIndex(['cidade', 'city']);
        const estadoIdx = getIndex(['estado', 'state', 'uf']);
        const cepIdx = getIndex(['cep', 'zip', 'zipcode']);
        const notasIdx = getIndex(['notas', 'observacoes', 'observações', 'obs', 'notes']);
        
        if (nomeIdx === -1) {
          reject(new Error('Coluna "Nome" não encontrada no arquivo'));
          return;
        }
        
        const result: ImportClienteResult = {
          success: 0,
          errors: 0,
          errorDetails: [],
          data: []
        };
        
        // Processar dados (a partir da segunda linha)
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          
          // Pular linhas vazias
          if (!row[nomeIdx] || String(row[nomeIdx]).trim() === '') continue;
          
          const nome = String(row[nomeIdx]).trim();
          
          if (!nome) {
            result.errors++;
            result.errorDetails.push(`Linha ${i + 1}: Nome é obrigatório`);
            continue;
          }
          
          const cliente: Partial<Cliente> = {
            nome,
            email: emailIdx !== -1 && row[emailIdx] ? String(row[emailIdx]).trim() : '',
            telefone: telefoneIdx !== -1 && row[telefoneIdx] ? String(row[telefoneIdx]).trim() : '',
            empresa: empresaIdx !== -1 && row[empresaIdx] ? String(row[empresaIdx]).trim() : '',
            endereco: enderecoIdx !== -1 && row[enderecoIdx] ? String(row[enderecoIdx]).trim() : '',
            cidade: cidadeIdx !== -1 && row[cidadeIdx] ? String(row[cidadeIdx]).trim() : '',
            estado: estadoIdx !== -1 && row[estadoIdx] ? String(row[estadoIdx]).trim() : '',
            cep: cepIdx !== -1 && row[cepIdx] ? String(row[cepIdx]).trim() : '',
            notas: notasIdx !== -1 && row[notasIdx] ? String(row[notasIdx]).trim() : '',
            status: 'ativo' as const,
          };
          
          result.data.push(cliente);
          result.success++;
        }
        
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo'));
    };

    reader.readAsBinaryString(file);
  });
}

// ============================================
// PRODUTOS - EXPORTAÇÃO
// ============================================

export function exportProdutosToExcel(produtos: Produto[]) {
  try {
    // Preparar dados para exportação
    const data = produtos.map(produto => ({
      'Nome': produto.nome,
      'Descrição': produto.descricao || '',
      'Marca': produto.marca || '',
      'Preço Venda': produto.preco_venda,
      'Preço Custo': produto.preco_custo,
      'Quantidade': produto.quantidade,
      'Quantidade Mínima': produto.quantidade_minima,
      'Categoria': produto.categoria === 'produto' ? 'Produto' : produto.categoria === 'servico' ? 'Serviço' : 'Pacote',
      'Unidade': produto.unidade,
      'Ativo': produto.ativo ? 'Sim' : 'Não',
      'Data Cadastro': produto.created_at ? new Date((produto.created_at as any).toDate?.() || produto.created_at).toLocaleDateString('pt-BR') : '',
    }));

    // Criar workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Ajustar largura das colunas
    const colWidths = [
      { wch: 30 }, // Nome
      { wch: 40 }, // Descrição
      { wch: 20 }, // Marca
      { wch: 12 }, // Preço Venda
      { wch: 12 }, // Preço Custo
      { wch: 10 }, // Quantidade
      { wch: 15 }, // Quantidade Mínima
      { wch: 15 }, // Categoria
      { wch: 10 }, // Unidade
      { wch: 8 },  // Ativo
      { wch: 15 }, // Data Cadastro
    ];
    ws['!cols'] = colWidths;

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');

    // Gerar arquivo
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `BBVIC_Produtos_${date}.xlsx`);

    toast.success(`${produtos.length} produtos exportados com sucesso!`);
  } catch (error) {
    console.error('Erro ao exportar produtos:', error);
    toast.error('Erro ao exportar produtos');
  }
}

// ============================================
// PRODUTOS - IMPORTAÇÃO
// ============================================

export interface ImportProdutoResult {
  success: number;
  errors: number;
  errorDetails: string[];
  data: Partial<Produto>[];
}

export function parseProdutosFromExcel(file: File): Promise<ImportProdutoResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (jsonData.length < 2) {
          reject(new Error('O arquivo está vazio ou não contém dados'));
          return;
        }
        
        // Mapear cabeçalhos (primeira linha)
        const headers = jsonData[0].map((h: any) => String(h).toLowerCase().trim());
        
        // Encontrar índices das colunas
        const getIndex = (names: string[]) => {
          for (const name of names) {
            const idx = headers.findIndex(h => h.includes(name.toLowerCase()));
            if (idx !== -1) return idx;
          }
          return -1;
        };
        
        const nomeIdx = getIndex(['nome', 'name', 'produto']);
        const descricaoIdx = getIndex(['descricao', 'descrição', 'description']);
        const marcaIdx = getIndex(['marca', 'brand']);
        const precoVendaIdx = getIndex(['preco venda', 'preço venda', 'preco_venda', 'price', 'valor', 'preço']);
        const precoCustoIdx = getIndex(['preco custo', 'preço custo', 'preco_custo', 'custo', 'cost']);
        const quantidadeIdx = getIndex(['quantidade', 'qty', 'estoque', 'stock']);
        const quantidadeMinimaIdx = getIndex(['quantidade minima', 'quantidade_minima', 'minimo', 'min']);
        const categoriaIdx = getIndex(['categoria', 'category', 'tipo']);
        const unidadeIdx = getIndex(['unidade', 'unit', 'und']);
        
        if (nomeIdx === -1) {
          reject(new Error('Coluna "Nome" não encontrada no arquivo'));
          return;
        }
        
        if (precoVendaIdx === -1) {
          reject(new Error('Coluna "Preço Venda" não encontrada no arquivo'));
          return;
        }
        
        const result: ImportProdutoResult = {
          success: 0,
          errors: 0,
          errorDetails: [],
          data: []
        };
        
        // Processar dados (a partir da segunda linha)
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          
          // Pular linhas vazias
          if (!row[nomeIdx] || String(row[nomeIdx]).trim() === '') continue;
          
          const nome = String(row[nomeIdx]).trim();
          const precoVendaRaw = row[precoVendaIdx];
          
          if (!nome) {
            result.errors++;
            result.errorDetails.push(`Linha ${i + 1}: Nome é obrigatório`);
            continue;
          }
          
          // Converter preço venda
          let preco_venda = 0;
          if (precoVendaRaw !== undefined && precoVendaRaw !== null && precoVendaRaw !== '') {
            const precoStr = String(precoVendaRaw).replace(/[^\d.,]/g, '').replace(',', '.');
            preco_venda = parseFloat(precoStr);
            if (isNaN(preco_venda) || preco_venda < 0) {
              result.errors++;
              result.errorDetails.push(`Linha ${i + 1}: Preço de venda inválido "${precoVendaRaw}"`);
              continue;
            }
          } else {
            result.errors++;
            result.errorDetails.push(`Linha ${i + 1}: Preço de venda é obrigatório`);
            continue;
          }
          
          // Converter preço custo
          let preco_custo = 0;
          if (precoCustoIdx !== -1 && row[precoCustoIdx] !== undefined && row[precoCustoIdx] !== null && row[precoCustoIdx] !== '') {
            const custoStr = String(row[precoCustoIdx]).replace(/[^\d.,]/g, '').replace(',', '.');
            preco_custo = parseFloat(custoStr);
            if (isNaN(preco_custo) || preco_custo < 0) preco_custo = 0;
          }
          
          // Converter quantidade
          let quantidade = 0;
          if (quantidadeIdx !== -1 && row[quantidadeIdx] !== undefined && row[quantidadeIdx] !== null && row[quantidadeIdx] !== '') {
            quantidade = parseInt(String(row[quantidadeIdx]));
            if (isNaN(quantidade) || quantidade < 0) quantidade = 0;
          }
          
          // Converter quantidade mínima
          let quantidade_minima = 0;
          if (quantidadeMinimaIdx !== -1 && row[quantidadeMinimaIdx] !== undefined && row[quantidadeMinimaIdx] !== null && row[quantidadeMinimaIdx] !== '') {
            quantidade_minima = parseInt(String(row[quantidadeMinimaIdx]));
            if (isNaN(quantidade_minima) || quantidade_minima < 0) quantidade_minima = 0;
          }
          
          // Determinar categoria
          let categoria: 'produto' | 'servico' | 'pacote' = 'produto';
          if (categoriaIdx !== -1 && row[categoriaIdx]) {
            const catStr = String(row[categoriaIdx]).toLowerCase().trim();
            if (catStr.includes('serviço') || catStr.includes('servico') || catStr.includes('service')) {
              categoria = 'servico';
            } else if (catStr.includes('pacote') || catStr.includes('package')) {
              categoria = 'pacote';
            }
          }
          
          // Determinar unidade
          let unidade: 'un' | 'kg' | 'g' | 'ml' | 'l' | 'hr' | 'session' | 'pacote' = 'un';
          if (unidadeIdx !== -1 && row[unidadeIdx]) {
            const unidStr = String(row[unidadeIdx]).toLowerCase().trim();
            if (unidStr === 'kg') unidade = 'kg';
            else if (unidStr === 'g' || unidStr === 'gr' || unidStr === 'grama') unidade = 'g';
            else if (unidStr === 'ml') unidade = 'ml';
            else if (unidStr === 'l' || unidStr === 'litro' || unidStr === 'litros') unidade = 'l';
            else if (unidStr === 'hr' || unidStr === 'hora' || unidStr === 'horas') unidade = 'hr';
            else if (unidStr === 'session' || unidStr === 'sessão' || unidStr === 'sessao') unidade = 'session';
            else if (unidStr === 'pacote' || unidStr === 'package') unidade = 'pacote';
          }
          
          const produto: Partial<Produto> = {
            nome,
            descricao: descricaoIdx !== -1 && row[descricaoIdx] ? String(row[descricaoIdx]).trim() : '',
            marca: marcaIdx !== -1 && row[marcaIdx] ? String(row[marcaIdx]).trim() : '',
            preco_venda,
            preco_custo,
            quantidade,
            quantidade_minima,
            categoria,
            unidade,
            ativo: true,
          };
          
          result.data.push(produto);
          result.success++;
        }
        
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo'));
    };

    reader.readAsBinaryString(file);
  });
}

// ============================================
// MODELOS DE EXCEL (DOWNLOAD)
// ============================================

export function downloadModeloClientes() {
  const headers = [
    'Nome', 'Email', 'Telefone', 'Empresa', 'Endereço', 'Cidade', 'Estado', 'CEP', 'Notas'
  ];

  const exemplo = [
    'João Silva', 'joao@email.com', '(11) 98765-4321', 'Empresa ABC', 'Rua das Flores, 123', 'São Paulo', 'SP', '01000-000', 'Cliente VIP'
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, exemplo]);
  const wb = XLSX.utils.book_new();

  // Ajustar largura das colunas
  ws['!cols'] = [
    { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 35 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 40 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, 'Modelo_Importacao_Clientes.xlsx');
}

export function downloadModeloProdutos() {
  const headers = [
    'Nome', 'Descrição', 'Marca', 'Preço Venda', 'Preço Custo', 'Quantidade', 'Quantidade Mínima', 'Categoria', 'Unidade'
  ];

  const exemplo = [
    'Shampoo BBVIC', 'Shampoo hidratante 300ml', 'BBVIC', 45.90, 25.00, 50, 10, 'Produto', 'un'
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, exemplo]);
  const wb = XLSX.utils.book_new();

  // Ajustar largura das colunas
  ws['!cols'] = [
    { wch: 30 }, { wch: 40 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 10 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
  XLSX.writeFile(wb, 'Modelo_Importacao_Produtos.xlsx');
}
