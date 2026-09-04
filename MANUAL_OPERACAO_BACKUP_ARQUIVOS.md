# Manual de operação e manutenção do backup de arquivos

## 1. Finalidade

Este manual descreve a operação do armazenamento principal do Sistema Inovar
na Droplet da DigitalOcean e seu backup diário no servidor físico.

Arquitetura em produção:

```text
Usuário
   ↓
Django na Droplet
   ├── arquivos oficiais: /srv/sistema-inovar/arquivos
   └── PostgreSQL local
              ↓ diariamente às 00:00 (America/Sao_Paulo)
         ZeroTier + autofs/CIFS
              ↓
Servidor físico: /mnt/servidor-inovar/SISTEMA INOVAR
```

A Droplet é a fonte oficial. O servidor físico é destino de backup e não deve
receber alterações manuais que se espere retornar automaticamente à nuvem.

## 2. O que o backup faz

Em cada execução, a rotina:

1. impede duas execuções simultâneas com `flock`;
2. valida a origem local;
3. confirma que o destino pertence a uma montagem CIFS/SMB, inclusive quando
   existe uma camada `autofs`;
4. testa escrita no servidor físico;
5. gera um dump do PostgreSQL em formato customizado;
6. sincroniza arquivos existentes diretamente na raiz;
7. sincroniza uma empresa por vez, em ordem alfabética, reduzindo o uso de RAM;
8. copia o dump para o servidor físico;
9. mantém versões anteriores de arquivos substituídos;
10. remove apenas dumps locais com mais de 35 dias;
11. registra toda a execução no journal e em arquivo de log.

A rotina não usa `--delete`. Portanto, apagar um documento da nuvem não o apaga
automaticamente do backup físico.

## 3. Localização dos componentes

### Na Droplet

| Item | Caminho |
|---|---|
| Arquivos oficiais | `/srv/sistema-inovar/arquivos` |
| Dumps temporários do banco | `/srv/sistema-inovar/backup-database` |
| Logs próprios | `/srv/sistema-inovar/logs-backup` |
| Script instalado | `/usr/local/sbin/sistema-inovar-backup` |
| Script no repositório | `/opt/apps/web_sistema_inovar/deploy/scripts/backup_arquivos.sh` |
| Serviço systemd | `/etc/systemd/system/sistema-inovar-backup.service` |
| Timer systemd | `/etc/systemd/system/sistema-inovar-backup.timer` |
| Variáveis de ambiente | `/opt/apps/web_sistema_inovar/sistema_inovar/sistema_inovar/.env` |
| Lock de execução | `/run/lock/sistema-inovar-backup.lock` |

### No servidor físico

| Item | Caminho visto pela Droplet |
|---|---|
| Cópia atual dos documentos | `/mnt/servidor-inovar/SISTEMA INOVAR` |
| Versões substituídas | `/mnt/servidor-inovar/SISTEMA INOVAR/_VERSOES` |
| Dumps do PostgreSQL | `/mnt/servidor-inovar/SISTEMA INOVAR/_BACKUP_BANCO` |

Cada execução que substitui um arquivo pode criar uma pasta como:

```text
_VERSOES/20260905_000001/NOME DA EMPRESA/...
```

## 4. Configuração esperada

O arquivo `.env` deve conter, sem barras invertidas antes de `_` ou espaços:

```env
MEDIA_ROOT="/srv/sistema-inovar/arquivos"
CLOUD_MEDIA_ROOT="/srv/sistema-inovar/arquivos"
PHYSICAL_BACKUP_ROOT="/mnt/servidor-inovar/SISTEMA INOVAR"
BACKUP_STATE_ROOT="/srv/sistema-inovar/backup-database"
BACKUP_LOG_ROOT="/srv/sistema-inovar/logs-backup"
BACKUP_RETENTION_DAYS=35

POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=sistema_inovar_web
POSTGRES_USER=USUARIO_CONFIGURADO
POSTGRES_PASSWORD=SENHA_CONFIGURADA
```

Visualizar somente variáveis não secretas:

```bash
sudo grep -E \
  '^(MEDIA_ROOT|CLOUD_MEDIA_ROOT|PHYSICAL_BACKUP_ROOT|BACKUP_STATE_ROOT|BACKUP_LOG_ROOT|BACKUP_RETENTION_DAYS|POSTGRES_HOST|POSTGRES_PORT|POSTGRES_DB|POSTGRES_USER)=' \
  /opt/apps/web_sistema_inovar/sistema_inovar/sistema_inovar/.env
```

Nunca imprimir `POSTGRES_PASSWORD` em chamado, conversa ou log.

## 5. Agendamento

O timer executa diariamente à meia-noite de São Paulo:

```ini
OnCalendar=*-*-* 00:00:00 America/Sao_Paulo
Persistent=true
```

Em servidores configurados em UTC, a próxima execução pode aparecer como
`03:00 UTC`. Isso corresponde a `00:00 America/Sao_Paulo`.

Se a Droplet estiver desligada à meia-noite, `Persistent=true` solicita a
execução após o servidor voltar.

Conferir agenda:

```bash
systemctl list-timers sistema-inovar-backup.timer --all
```

```bash
systemd-analyze calendar '*-*-* 00:00:00 America/Sao_Paulo'
```

## 6. Acompanhamento diário

### Confirmar que o timer está habilitado

```bash
systemctl is-enabled sistema-inovar-backup.timer
systemctl is-active sistema-inovar-backup.timer
```

Resultados esperados:

```text
enabled
active
```

### Ver o último resultado

```bash
sudo systemctl show sistema-inovar-backup.service \
  -p Result -p ExecMainStatus -p ExecMainCode
```

Sucesso esperado:

```text
Result=success
ExecMainStatus=0
```

Como o serviço é `Type=oneshot`, ficar `inactive (dead)` após terminar é normal.

### Ver logs recentes

```bash
sudo journalctl -u sistema-inovar-backup.service -n 200 --no-pager
```

```bash
sudo journalctl -u sistema-inovar-backup.service \
  --since "2 days ago" --no-pager
```

Logs persistentes da própria rotina:

```bash
sudo ls -lht /srv/sistema-inovar/logs-backup | head
```

```bash
sudo less /srv/sistema-inovar/logs-backup/backup_AAAAMMDD_HHMMSS.log
```

### Acompanhar uma execução em andamento

```bash
sudo journalctl -u sistema-inovar-backup.service -f
```

Pressionar `Ctrl+C` aqui fecha somente a visualização. Isso **não interrompe o
backup**.

## 7. Execução manual

Iniciar sem manter o terminal bloqueado:

```bash
sudo systemctl start --no-block sistema-inovar-backup.service
```

Acompanhar:

```bash
sudo journalctl -u sistema-inovar-backup.service -f
```

Não iniciar diretamente `/usr/local/sbin/sistema-inovar-backup`, pois o serviço
systemd é responsável por carregar as variáveis do `.env` e executar como
`www-data`.

## 8. Interromper com segurança

Verificar primeiro se está executando:

```bash
sudo systemctl status sistema-inovar-backup.service --no-pager
```

Interromper:

```bash
sudo systemctl stop sistema-inovar-backup.service
```

O `rsync --partial` pode deixar conteúdo parcial. Na próxima execução, o rsync
confere e completa ou refaz o arquivo. Não remover arquivos parciais manualmente
durante uma execução.

## 9. Habilitar, desabilitar e reagendar

Habilitar e iniciar o timer:

```bash
sudo systemctl enable --now sistema-inovar-backup.timer
```

Desabilitar novos backups sem interromper o sistema web:

```bash
sudo systemctl disable --now sistema-inovar-backup.timer
```

Isso não apaga arquivos e não desativa o Django.

Para mudar o horário:

```bash
sudo nano /etc/systemd/system/sistema-inovar-backup.timer
```

Depois de editar:

```bash
sudo systemd-analyze verify \
  /etc/systemd/system/sistema-inovar-backup.timer
sudo systemctl daemon-reload
sudo systemctl restart sistema-inovar-backup.timer
systemctl list-timers sistema-inovar-backup.timer --all
```

## 10. Verificações de infraestrutura

### Espaço na Droplet

```bash
df -h /
sudo du -sh /srv/sistema-inovar/arquivos
sudo du -sh /srv/sistema-inovar/backup-database
sudo du -sh /srv/sistema-inovar/logs-backup
```

Referência operacional:

- atenção a partir de 70% de uso;
- crítico a partir de 80%;
- não permitir que o disco alcance 100%;
- manter pelo menos 8 GB livres.

### ZeroTier

```bash
sudo systemctl status zerotier-one --no-pager
sudo zerotier-cli listnetworks
```

### Montagem física

Ativar o caminho quando ele usa `autofs`:

```bash
sudo -u www-data ls "/mnt/servidor-inovar/SISTEMA INOVAR" > /dev/null
```

Ver as camadas da montagem:

```bash
findmnt -T "/mnt/servidor-inovar/SISTEMA INOVAR" \
  -n -o TARGET,FSTYPE,SOURCE
```

É normal aparecerem `autofs` e `cifs`. Deve existir pelo menos uma linha `cifs`
ou `smb3`.

Testar leitura e escrita:

```bash
sudo -u www-data test -r "/mnt/servidor-inovar/SISTEMA INOVAR"
echo $?
```

```bash
sudo -u www-data test -w "/mnt/servidor-inovar/SISTEMA INOVAR"
echo $?
```

O resultado esperado é `0` nos dois testes.

### PostgreSQL

```bash
sudo systemctl status postgresql --no-pager
```

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar
source .venv/bin/activate
python manage.py shell -c \
  "from django.db import connection; connection.cursor().execute('select 1'); print('DB_OK')"
```

## 11. Atualização do script

Após atualizar o repositório, reinstalar o script operacional:

```bash
cd /opt/apps/web_sistema_inovar
git pull
sudo sed -i 's/\r$//' deploy/scripts/backup_arquivos.sh
sudo install -o root -g root -m 0755 \
  deploy/scripts/backup_arquivos.sh \
  /usr/local/sbin/sistema-inovar-backup
```

Se os arquivos `.service` ou `.timer` também mudaram:

```bash
sudo cp deploy/systemd/sistema-inovar-backup.service /etc/systemd/system/
sudo cp deploy/systemd/sistema-inovar-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify \
  /etc/systemd/system/sistema-inovar-backup.service \
  /etc/systemd/system/sistema-inovar-backup.timer
```

Não é necessário reiniciar Django para atualizar somente o script de backup.

## 12. Códigos e mensagens de falha

| Código/mensagem | Significado | Ação inicial |
|---|---|---|
| `203/EXEC` | systemd não conseguiu executar o script | Conferir `ExecStart`, arquivo e permissão `0755` |
| saída `2` | origem/destino inseguro ou iguais | Revisar variáveis de caminho |
| saída `3` | destino sem CIFS/SMB válido | Ativar autofs, conferir ZeroTier e montagem |
| saída `4` | usuário `www-data` sem escrita no físico | Corrigir credencial/permissão CIFS |
| saída `5` | variáveis do PostgreSQL ausentes | Revisar `.env` e `EnvironmentFile` |
| saída `75` | outra execução já mantém o lock | Aguardar ou verificar processo preso |
| `pg_dump` falhou | banco, senha ou versão do cliente | Conferir PostgreSQL e credenciais |
| `rsync` falhou | rede, espaço, permissão ou SMB | Ler as linhas imediatamente anteriores no log |

Após corrigir uma falha:

```bash
sudo systemctl reset-failed sistema-inovar-backup.service
sudo systemctl start --no-block sistema-inovar-backup.service
```

## 13. Diagnóstico detalhado

Configuração efetivamente carregada:

```bash
sudo systemctl cat sistema-inovar-backup.service
sudo systemctl cat sistema-inovar-backup.timer
sudo systemctl show sistema-inovar-backup.service -p ExecStart -p User
```

Processos ativos:

```bash
pgrep -af 'sistema-inovar-backup|rsync|pg_dump'
```

Consumo durante execução:

```bash
free -h
swapon --show
```

Eventos de falta de memória:

```bash
sudo journalctl -k --since "24 hours ago" \
  | grep -i -E 'out of memory|oom|killed process'
```

## 14. Conferência dos resultados

Últimos dumps físicos:

```bash
sudo ls -lht "/mnt/servidor-inovar/SISTEMA INOVAR/_BACKUP_BANCO" | head
```

Últimas versões preservadas:

```bash
sudo ls -lht "/mnt/servidor-inovar/SISTEMA INOVAR/_VERSOES" | head
```

Comparação completa em modo de simulação:

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar
source .venv/bin/activate
python manage.py migrar_arquivos_para_nuvem \
  --source=/srv/sistema-inovar/arquivos \
  --destination="/mnt/servidor-inovar/SISTEMA INOVAR" \
  --start-from=A \
  --checksum
```

Atenção: o comando de migração foi criado originalmente para físico → nuvem.
Com os caminhos acima ele apenas simula nuvem → físico, uma empresa por vez
para controlar o uso de RAM. Não adicionar `--execute` durante uma conferência.

## 15. Restauração de um arquivo

1. localizar o arquivo atual ou uma versão em `_VERSOES`;
2. conferir nome, tamanho e conteúdo;
3. identificar o caminho correspondente na nuvem;
4. garantir que não existe backup em execução;
5. copiar primeiro para um nome temporário;
6. substituir o arquivo somente depois da validação;
7. testar o documento pela interface.

Exemplo de localização, sem alterar arquivos:

```bash
sudo find "/mnt/servidor-inovar/SISTEMA INOVAR" \
  -type f -name 'NOME_DO_ARQUIVO.pdf' -print
```

Não restaurar todo o acervo por cima da nuvem sem antes identificar a causa da
perda e fazer uma simulação do rsync.

## 16. Validação e restauração do banco

Validar a estrutura de um dump sem restaurá-lo:

```bash
pg_restore --list \
  "/mnt/servidor-inovar/SISTEMA INOVAR/_BACKUP_BANCO/ARQUIVO.dump" \
  > /var/tmp/conteudo_dump.txt
```

```bash
less /var/tmp/conteudo_dump.txt
```

Uma restauração real do PostgreSQL pode substituir dados de produção e exige
janela de manutenção, backup atual e confirmação do responsável. Não executar
`pg_restore --clean` diretamente no banco de produção como teste.

## 17. Retenção e limpeza

Estado atual:

- dumps locais da Droplet: removidos após `BACKUP_RETENTION_DAYS`, padrão 35;
- documentos físicos atuais: nunca removidos automaticamente;
- versões em `_VERSOES`: nunca removidas automaticamente;
- dumps físicos em `_BACKUP_BANCO`: nunca removidos automaticamente;
- logs em `/srv/sistema-inovar/logs-backup`: não possuem remoção automática no
  script atual.

Antes de criar qualquer limpeza automática, medir o espaço e aprovar uma
política de retenção. Nunca usar remoção recursiva diretamente em `SISTEMA
INOVAR`, `_VERSOES` ou `_BACKUP_BANCO`.

## 18. Checklist semanal

- [ ] timer está `enabled` e `active`;
- [ ] último `Result=success`;
- [ ] existe dump recente em `_BACKUP_BANCO`;
- [ ] não há erro recente de CIFS, rsync ou pg_dump;
- [ ] Droplet mantém pelo menos 8 GB livres;
- [ ] servidor físico possui espaço disponível;
- [ ] ZeroTier está online;
- [ ] logs não estão crescendo excessivamente;
- [ ] não existe processo de backup preso;
- [ ] uma amostra de arquivo do backup pode ser aberta.

## 19. Checklist mensal

- [ ] comparar uma amostra por checksum;
- [ ] validar um dump com `pg_restore --list`;
- [ ] testar restauração de um documento em local temporário;
- [ ] revisar crescimento de `/srv/sistema-inovar/arquivos`;
- [ ] revisar crescimento de `_VERSOES` e `_BACKUP_BANCO`;
- [ ] verificar atualizações do script no repositório;
- [ ] registrar data, resultado e responsável pelo teste.

## 20. Regra de segurança principal

A nuvem é a origem e o servidor físico é backup. Toda operação inversa deve ser
tratada como restauração, precedida de simulação e conferência. Em caso de
dúvida, interromper o timer, preservar os dois lados e analisar os logs antes de
copiar ou remover qualquer coisa.
