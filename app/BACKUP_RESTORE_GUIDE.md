# BBVIC Gestão - Guia de Backup e Restauração

## Backup Automático Configurado

O sistema está configurado para fazer backup automático diário do Firestore.

### Configuração do Backup

- **Frequência:** Diária (todos os dias às 2:00 AM)
- **Local:** Google Cloud Storage
- **Bucket:** `{PROJECT_ID}-firestore-backups`
- **Retenção:** 30 dias (backups antigos são automaticamente excluídos)
- **Formato:** `backups/YYYY-MM-DD/`

---

## Pré-requisitos para Restauração

### 1. Instalar Google Cloud SDK

```bash
# macOS
brew install google-cloud-sdk

# Windows
# Baixar em: https://cloud.google.com/sdk/docs/install

# Linux
curl https://sdk.cloud.google.com | bash
```

### 2. Autenticar no Google Cloud

```bash
gcloud auth login
gcloud config set project SEU_PROJECT_ID
```

### 3. Verificar Permissões

Você precisa ter permissão de **Owner** ou **Cloud Datastore Owner** no projeto.

---

## Como Restaurar um Backup

### Opção 1: Restauração Completa (Todas as Coleções)

```bash
# 1. Listar backups disponíveis
gsutil ls gs://SEU_PROJECT_ID-firestore-backups/backups/

# 2. Escolher a data do backup (formato: YYYY-MM-DD)
# Exemplo: restaurar backup de 2024-01-15

# 3. Executar a restauração
gcloud firestore import gs://SEU_PROJECT_ID-firestore-backups/backups/2024-01-15

# 4. Aguardar conclusão (pode levar vários minutos)
```

### Opção 2: Restauração via Console Web

1. Acesse: https://console.cloud.google.com/firestore/import-export
2. Clique em **"Importar"**
3. Selecione o bucket: `SEU_PROJECT_ID-firestore-backups`
4. Navegue até: `backups/YYYY-MM-DD/`
5. Selecione o arquivo `overall_export.metadata`
6. Clique em **"Importar"**

### Opção 3: Restauração de Coleções Específicas

```bash
# Restaurar apenas coleções específicas
gcloud firestore import gs://SEU_PROJECT_ID-firestore-backups/backups/2024-01-15 \
  --collection-ids="invoices,clientes,produtos"
```

---

## Verificar Backups Disponíveis

### Via Console Firebase

1. Acesse: https://console.firebase.google.com/project/SEU_PROJECT_ID/storage
2. Navegue até o bucket `SEU_PROJECT_ID-firestore-backups`
3. Pasta: `backups/`

### Via Linha de Comando

```bash
# Listar todos os backups
gsutil ls -r gs://SEU_PROJECT_ID-firestore-backups/backups/ | grep "overall_export.metadata"

# Ver detalhes de um backup específico
gsutil ls -l gs://SEU_PROJECT_ID-firestore-backups/backups/2024-01-15/
```

### Via Cloud Function (Admin)

```javascript
// Chamar a função listarBackups pelo frontend
const listarBackups = firebase.functions().httpsCallable('listarBackups');
const resultado = await listarBackups();
console.log(resultado.data.backups);
```

---

## Criar Bucket de Backup (Se Não Existir)

Se o bucket ainda não foi criado, execute:

```bash
# Criar bucket
gsutil mb -l us-central1 gs://SEU_PROJECT_ID-firestore-backups

# Configurar ciclo de vida (excluir arquivos após 30 dias)
gsutil lifecycle set lifecycle.json gs://SEU_PROJECT_ID-firestore-backups
```

Arquivo `lifecycle.json`:
```json
{
  "lifecycle": {
    "rule": [{
      "action": {"type": "Delete"},
      "condition": {"age": 30}
    }]
  }
}
```

---

## Backup Manual (Emergência)

Se precisar fazer um backup manual imediato:

```bash
# Exportar Firestore manualmente
gcloud firestore export gs://SEU_PROJECT_ID-firestore-backups/backups/manual-$(date +%Y-%m-%d-%H%M%S)
```

---

## Logs de Backup

Os logs de backup são armazenados na coleção `backup_logs` do Firestore.

### Consultar Logs (Admin)

```javascript
// No console do Firebase ou via função
const logs = await db.collection('backup_logs')
  .orderBy('created_at', 'desc')
  .limit(10)
  .get();
```

---

## Troubleshooting

### Erro: "Bucket não encontrado"

```bash
# Criar bucket manualmente
gsutil mb gs://SEU_PROJECT_ID-firestore-backups
```

### Erro: "Permissão negada"

```bash
# Verificar permissões do service account
gcloud projects get-iam-policy SEU_PROJECT_ID

# Adicionar permissão necessária
gcloud projects add-iam-policy-binding SEU_PROJECT_ID \
  --member="serviceAccount:SEU_PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"
```

### Erro: "Backup não aparece na lista"

Verifique se:
1. A Cloud Function `backupFirestoreDiario` foi deployada
2. O bucket existe e está acessível
3. O service account tem permissões de escrita no bucket

---

## Checklist de Segurança do Backup

- [ ] Bucket configurado com acesso restrito
- [ ] Ciclo de vida configurado (30 dias)
- [ ] Permissões do service account verificadas
- [ ] Teste de restauração realizado
- [ ] Logs de backup sendo gerados

---

## Contato para Suporte

Em caso de problemas com backup/restauração:
1. Verificar logs no Firebase Console > Functions
2. Verificar logs no Google Cloud Console > Logging
3. Documentação oficial: https://cloud.google.com/firestore/docs/manage-data/export-import
