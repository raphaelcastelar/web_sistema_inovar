# Plano de migração dos arquivos para a nuvem

## 1. Objetivo

Transferir a fonte principal dos arquivos do servidor físico para o disco da
Droplet da DigitalOcean. Depois da migração:

- a aplicação deve gravar, listar, abrir e excluir arquivos diretamente na
  Droplet;
- o servidor físico não deve participar das requisições dos usuários;
- a estrutura lógica atual de empresa, área, tipo, ano e mês deve ser mantida;
- o DAS gerado deve ser salvo automaticamente na competência correta;
- todos os dias, à meia-noite, uma rotina deve copiar as novidades da nuvem
  para o servidor físico;
- falhas no servidor físico não podem interromper o sistema web;
- toda execução do backup deve produzir log, resumo e estado verificável.

## 2. Decisões de arquitetura

### 2.1. Não particionar o disco atual

Não será criada uma nova partição no disco de 50 GB da Droplet.

Uma partição no mesmo disco não protege contra falha do disco ou da Droplet e
torna mais difícil redistribuir o espaço futuramente. O isolamento será feito
com diretório dedicado, usuário/grupo, permissões e monitoramento de capacidade.

Diretório proposto:

```text
/srv/sistema-inovar/
├── arquivos/           # MEDIA_ROOT da aplicação
├── exportacoes/        # arquivos temporários gerados pelo sistema
├── backup-database/    # dumps locais aguardando sincronização
└── logs-backup/        # logs das rotinas de backup
```

Se o volume crescer além da capacidade da Droplet, `/srv/sistema-inovar` poderá
ser migrado posteriormente para um Volume Block Storage sem mudar a estrutura
lógica do sistema.

### 2.2. Limite operacional de espaço

O disco possui atualmente aproximadamente 42 GB livres. Esses 42 GB não devem
ser considerados integralmente disponíveis para documentos, porque o mesmo
disco contém sistema operacional, PostgreSQL, aplicação, logs e temporários.

Política inicial:

- alerta preventivo quando o disco atingir 70% de uso;
- alerta crítico quando atingir 80%;
- bloquear novos uploads, preservando as demais funções, ao atingir 90%;
- manter no mínimo 8 GB livres para banco, logs, atualizações e operações do
  sistema;
- aplicar rotação aos logs do Gunicorn, Nginx, Django e backup;
- revisar crescimento e capacidade mensalmente.

Não será aplicada uma cota rígida de 30 GB na primeira fase. O monitoramento é
preferível porque evita reservar espaço inutilizado e permite observar o padrão
real de crescimento antes de contratar armazenamento adicional.

### 2.3. Fonte oficial e direção da sincronização

Depois da virada, a **nuvem será a única fonte oficial dos arquivos**.

O backup diário será exclusivamente:

```text
Droplet (origem oficial)  ──────►  servidor físico (backup)
```

Não haverá sincronização bidirecional. Arquivos inseridos manualmente no backup
físico não devem retornar automaticamente à nuvem, pois isso cria conflitos,
duplicações e risco de restaurar documentos apagados intencionalmente.

A rotina diária será incremental e percorrerá recursivamente todas as empresas
e subpastas. Ela copiará arquivos novos e arquivos que tenham sido alterados.
Arquivos removidos da nuvem **não serão removidos automaticamente do backup**.

## 3. Estrutura dos documentos

A estrutura atual será mantida inicialmente para reduzir o risco da migração:

```text
/srv/sistema-inovar/arquivos/
└── NOME DA EMPRESA/
    ├── CONSTITUTIVOS/
    ├── PESSOAL/
    │   └── GUIAS/2026/08/
    ├── FISCAL/
    │   ├── GUIAS/2026/08/
    │   ├── XML/2026/08/
    │   ├── EXTRATOS/2026/08/
    │   └── DECLARACOES/2026/
    ├── CONTABIL/
    ├── FINANCEIRO/
    └── OUTROS/
```

Em uma evolução posterior, o identificador da empresa poderá fazer parte do
caminho para evitar colisões em renomeações. Isso não será misturado com esta
migração.

## 4. Salvamento automático do DAS

Quando o SERPRO retornar o PDF com sucesso, a API deverá:

1. localizar a empresa pelo CNPJ normalizado;
2. validar a competência no formato `AAAAMM`;
3. separar `ano = AAAA` e `mes = MM`;
4. criar ou atualizar um `DocumentoEmpresa` com
   `folder_key="fiscal_guias"`;
5. salvar o PDF em `FISCAL/GUIAS/AAAA/MM`;
6. somente depois retornar o PDF ao usuário;
7. registrar em log a empresa, competência, nome, tamanho e resultado.

O arquivo deve ser escrito primeiro com nome temporário e movido atomicamente
para o nome definitivo. Uma falha durante a escrita não pode deixar um PDF
parcial com aparência de documento válido.

Chave de idempotência lógica:

```text
empresa + fiscal_guias + competência + nome do arquivo
```

Se o mesmo DAS for solicitado novamente, a regra de substituição ou criação de
versão deve ser explícita. A recomendação inicial é substituir somente quando o
novo PDF tiver conteúdo diferente e preservar o anterior no backup histórico.

## 5. Backup diário para o servidor físico

### 5.1. Tecnologia

Será utilizado `rsync` sobre o compartilhamento físico já montado via
ZeroTier/CIFS. O `rsync` fará comparação incremental, de forma que após a cópia
inicial somente arquivos novos ou alterados trafeguem pela rede.

O agendamento será feito por um **systemd timer**, em vez de cron, porque o
servidor já utiliza systemd e essa opção oferece:

- logs integrados ao `journalctl`;
- prevenção de execuções simultâneas;
- execução posterior caso a Droplet esteja indisponível exatamente à meia-noite;
- estado de sucesso/falha consultável pelo systemd;
- limites de tempo e recursos configuráveis.

### 5.2. Horário

```text
Todos os dias às 00:00 no fuso America/Sao_Paulo
```

O servidor atualmente usa Django em UTC. O timer deverá declarar explicitamente
o fuso ou o servidor deverá ter seu fuso operacional confirmado antes da
ativação. Não se deve assumir que `00:00` do sistema operacional corresponde à
meia-noite de Brasília.

### 5.3. Origem e destino

```text
Origem:  /srv/sistema-inovar/arquivos/
Destino: /mnt/servidor-inovar/SISTEMA INOVAR/
```

O conteúdo da origem deve ficar dentro do destino, sem criar um nível extra
`arquivos/`. A presença ou ausência da barra final deverá ser validada no teste
de homologação do `rsync`.

### 5.4. Comportamento obrigatório da rotina

Antes de copiar:

1. adquirir um lock exclusivo com `flock`;
2. confirmar que a origem existe e está no disco local da Droplet;
3. confirmar que o destino CIFS está realmente montado;
4. rejeitar destino vazio, `/`, `/mnt` ou qualquer caminho diferente do
   configurado;
5. realizar um teste de escrita controlado no destino;
6. conferir espaço livre no destino;
7. interromper com erro sem alterar nada se qualquer validação falhar.

Durante a cópia:

- preservar datas e estrutura de diretórios;
- copiar arquivos parciais de forma recuperável;
- usar arquivo temporário no destino e renomeação ao concluir;
- não usar `--delete`;
- não seguir links simbólicos para fora da origem;
- limitar o tempo de conexão e evitar processo preso indefinidamente;
- registrar cada arquivo copiado ou atualizado;
- devolver código diferente de zero em falhas.

Depois da cópia:

1. registrar início, fim, duração, quantidade e volume transferido;
2. registrar o último backup bem-sucedido no PostgreSQL ou arquivo de estado;
3. emitir alerta se o backup falhar;
4. emitir alerta se não houver backup bem-sucedido nas últimas 26 horas;
5. manter logs rotacionados, sem crescimento ilimitado.

### 5.5. Comparação e integridade

A rotina diária deve usar tamanho e data de modificação, que são rápidos para
sincronização incremental. Uma verificação completa por checksum lê todos os
arquivos nos dois lados e pode ficar lenta conforme o acervo crescer.

Política recomendada:

- diariamente: sincronização incremental por tamanho/data;
- semanalmente: verificação por checksum em horário de menor movimento;
- mensalmente: teste de restauração de uma amostra de documentos;
- trimestralmente: simulação documentada de recuperação completa.

## 6. Backup do banco de dados

Os PDFs sem o PostgreSQL não formam um backup completo do sistema. O banco
contém empresa, competência, tipo de pasta, permissões e associação de cada
documento.

Antes da sincronização dos arquivos, deverá ser produzido um dump:

```text
/srv/sistema-inovar/backup-database/sistema_inovar_YYYYMMDD_HHMM.dump
```

Esse dump também será enviado ao servidor físico. Política inicial de retenção:

- 7 backups diários;
- 4 backups semanais;
- 12 backups mensais.

Senhas não devem aparecer no script nem no log. O comando deverá usar as
credenciais protegidas já existentes no servidor.

## 7. Segurança do backup físico

Manter o destino permanentemente montado permite que um erro administrativo ou
ataque na Droplet alcance o backup. Para reduzir esse risco:

- usar uma conta SMB exclusiva para backup;
- restringir a conta somente à pasta de backup;
- impedir acesso público ao compartilhamento;
- permitir tráfego somente pela rede privada ZeroTier;
- manter snapshots ou histórico no servidor físico, se suportado;
- não conceder ao processo web acesso direto ao backup;
- idealmente montar o compartilhamento somente durante a rotina e desmontá-lo
  ao final.

O servidor físico será uma cópia de recuperação, não uma réplica totalmente
isolada. No futuro, recomenda-se adicionar uma terceira cópia independente ou
imutável para seguir uma estratégia 3-2-1.

## 8. Fases de implementação

### Fase 0 — inventário e medição

- medir tamanho e quantidade de arquivos atuais;
- identificar documentos registrados no banco sem arquivo físico;
- identificar arquivos físicos sem registro no banco;
- medir velocidade da cópia entre servidor físico e Droplet;
- confirmar espaço livre nos dois destinos;
- congelar mudanças de estrutura durante a migração.

Critério de saída: relatório de inventário aprovado e espaço suficiente.

### Fase 1 — preparar armazenamento na Droplet

- criar `/srv/sistema-inovar/arquivos`;
- configurar proprietário e grupo usados pelo Gunicorn;
- permitir escrita apenas à aplicação e administradores autorizados;
- configurar `MEDIA_ROOT` para o novo caminho em homologação;
- adicionar monitoramento de espaço e rotação de logs;
- testar upload, visualização, download, e-mail, WhatsApp e exclusão.

Critério de saída: todas as operações funcionam sem o compartilhamento físico.

### Fase 2 — adaptar geração do DAS

- salvar automaticamente o PDF retornado pelo SERPRO;
- usar a competência para formar ano e mês;
- impedir duplicação;
- manter o download atual;
- adicionar testes de caminho, conteúdo e reprocessamento.

Critério de saída: DAS individual e em lote aparecem na pasta correta.

### Fase 3 — cópia inicial físico → nuvem

Esta é a única etapa em que a direção será servidor físico → Droplet.

- colocar operações de arquivo em janela controlada;
- copiar todo o acervo preservando estrutura e datas;
- comparar quantidade e tamanho;
- executar verificação por checksum;
- reconciliar banco e filesystem;
- gerar relatório de divergências;
- não apagar a origem física.

Critério de saída: 100% dos arquivos válidos copiados ou divergências
explicitamente justificadas.

### Fase 4 — virada

- alterar `MEDIA_ROOT` de produção;
- reiniciar Gunicorn;
- executar testes rápidos de upload, leitura e download;
- monitorar erros e espaço;
- manter possibilidade de retorno temporário ao caminho anterior.

Critério de saída: aplicação operando integralmente pelo disco da Droplet.

### Fase 5 — ativar backup nuvem → físico

- instalar script de backup protegido;
- instalar service e timer do systemd;
- executar primeiro em modo de simulação;
- executar manualmente uma sincronização real;
- validar arquivos novos e alterados;
- validar indisponibilidade do SMB;
- validar prevenção de concorrência;
- ativar execução à meia-noite;
- configurar alerta de falha.

Critério de saída: duas execuções automáticas consecutivas bem-sucedidas e um
teste de restauração aprovado.

## 9. Plano de reversão

Durante a janela inicial de estabilização:

- nenhum arquivo do servidor físico será apagado;
- a configuração anterior de `MEDIA_ROOT` será preservada de forma documentada;
- em falha crítica, bloquear temporariamente uploads, restaurar o `MEDIA_ROOT`
  anterior e reiniciar a aplicação;
- arquivos criados somente na nuvem durante a janela deverão ser copiados para o
  físico antes da reversão;
- toda reversão deverá ser registrada para posterior reconciliação.

## 10. Testes de aceite

- upload manual em cada tipo de pasta;
- DAS salvo em `FISCAL/GUIAS/AAAA/MM`;
- download e visualização com conteúdo correto;
- envio por e-mail e WhatsApp;
- nomes com espaços, acentos e caracteres inválidos;
- duas empresas com nomes parecidos;
- repetição da mesma geração do DAS;
- arquivo parcialmente escrito;
- disco com pouco espaço;
- servidor físico desligado à meia-noite;
- compartilhamento montado no caminho errado;
- interrupção da rede durante a cópia;
- segunda execução após uma falha parcial;
- arquivo alterado após já ter sido copiado;
- restauração de documento e banco de dados.

## 11. Operação diária

O painel administrativo deverá mostrar:

- espaço total, usado e livre na Droplet;
- horário e resultado do último backup;
- quantidade e tamanho transferidos;
- última verificação de integridade;
- falhas pendentes;
- estado do compartilhamento físico;
- botão administrativo para executar backup manual;
- histórico das execuções.

Comandos operacionais deverão ser documentados para consultar o timer, executar
uma cópia manual, visualizar logs e testar uma restauração. A rotina não deverá
depender de uma sessão SSH aberta nem de intervenção diária.

## 12. Itens que exigem confirmação antes da implementação

- sistema operacional e versão do servidor físico;
- caminho final do compartilhamento destinado ao backup;
- capacidade livre no servidor físico;
- suporte do destino a snapshots ou versões anteriores;
- fuso horário configurado na Droplet;
- política desejada para versões antigas do mesmo documento;
- canal de alerta: e-mail, WhatsApp ou painel;
- tempo de retenção dos documentos excluídos;
- tamanho atual e crescimento mensal estimado do acervo.

## 13. Resultado esperado

Após a conclusão, o usuário acessará somente a Droplet durante o uso normal. A
indisponibilidade do servidor físico ou ZeroTier não afetará uploads, downloads,
geração de DAS ou navegação. À meia-noite, a Droplet atualizará o backup físico
de forma incremental, verificável e sem apagar silenciosamente arquivos antigos.

## 14. Componentes implementados

- `inventariar_arquivos`: inventário e reconciliação somente leitura;
- `migrar_arquivos_para_nuvem`: cópia físico → Droplet, com simulação padrão,
  confirmação explícita e sem exclusões;
- armazenamento do DAS: escrita atômica, nome determinístico, competência
  correta e registro idempotente em `DocumentoEmpresa`;
- `backup_arquivos.sh`: dump do PostgreSQL, sincronização incremental,
  preservação de arquivos substituídos, lock e validações de montagem;
- `sistema-inovar-backup.service`: unidade de execução isolada;
- `sistema-inovar-backup.timer`: execução persistente à meia-noite no fuso de
  São Paulo;
- configurações `CLOUD_MEDIA_ROOT` e `PHYSICAL_BACKUP_ROOT`.

O procedimento operacional de instalação, migração, virada e ativação está no
documento `DEPLOY_DIGITALOCEAN.md`. A transferência real só ocorre quando o
comando recebe simultaneamente `--execute` e a confirmação exigida.
