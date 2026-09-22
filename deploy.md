# Deploy na homologação e na produção

Este manual cobre **atualizações de uma instalação já pronta** na mesma Droplet.
Não é um roteiro para criar a infraestrutura. Os comandos são para executar via
SSH na Droplet Ubuntu, exceto quando indicado.

## 1. Topologia e limite de segurança

| Item | Homologação | Produção |
| --- | --- | --- |
| Endereço | `http://homologacao.sistema.inovar` (ZeroTier) | domínio/`sistema.inovar` em uso |
| Repositório | `/opt/apps/web_sistema_inovar_homologacao` | `/opt/apps/web_sistema_inovar` |
| Branch prevista | `homologacao` | `deploy-do` |
| Serviço | `sistema-inovar-homologacao` | `sistema-inovar` |
| Gunicorn | `127.0.0.1:8001` | `127.0.0.1:8000` |
| Frontend | `sistema_inovar/frontend/build` em cada repositório | `sistema_inovar/frontend/build` em cada repositório |

**A configuração atual usa o mesmo PostgreSQL, `MEDIA_ROOT` e credenciais externas
nos dois ambientes.** Cada instalação deve ter seu próprio arquivo `.env`, mesmo
que vários valores sejam iguais. Os processos e os builds são separados, mas
**os dados não são**. Uma operação de gravação na homologação altera a produção. Não use a
homologação para ensaiar migrações, exclusões, uploads, boletos, DAS, e-mail ou
WhatsApp com dados reais. Login e algumas páginas também podem gravar estado.

Antes do primeiro deploy, confira os caminhos e branches reais na Droplet com
`git branch --show-current` e `systemctl cat`; se forem diferentes desta tabela,
adapte o manual antes de executar comandos. Não copie o `.env` de um ambiente
sobre o outro durante um deploy: preserve as configurações já instaladas.

## 2. Preparação antes de qualquer publicação

1. Envie e revise o código no Git remoto. Registre o commit que será publicado.
2. Identifique se houve alteração de modelos/migrations, operações de arquivo,
   envio externo, configuração ou dependências.
3. Programe uma janela de menor movimento para mudanças que possam afetar o banco
   ou consumir muita CPU/disco. O build React na mesma Droplet concorre por
   recursos com a produção.
4. Verifique se a produção e o backup estão saudáveis:

```bash
df -h
free -h
sudo systemctl is-active sistema-inovar sistema-inovar-homologacao nginx postgresql
sudo systemctl is-active sistema-inovar-backup.timer
```

O projeto recomenda manter pelo menos 8 GB livres na Droplet. Se houver pouca
memória ou espaço, resolva isso antes de executar `npm ci`/`npm run build`.

**Migrações:** antes de publicar código que depende de uma migração, revise a
compatibilidade com as duas versões do código, pois ambas acessam o mesmo banco.
Não rode `migrate` automaticamente na homologação. Se a mudança de schema não
for compatível com a produção atual, pare e prepare uma janela/estratégia de
migração separada. O backup do banco precisa ser verificado antes de uma
migração aprovada; consulte `MANUAL_OPERACAO_BACKUP_ARQUIVOS.md`.

## 3. Deploy na homologação

### 3.1 Atualizar somente o repositório da homologação

```bash
cd /opt/apps/web_sistema_inovar_homologacao
git status --short
git branch --show-current
git fetch origin
git log -1 --format='%h %s'
git log -1 --format='%h %s' origin/homologacao
```

Continue apenas se o diretório estiver limpo e a branch atual for
`homologacao`. Se houver alterações locais, **não** descarte nem sobrescreva:
investigue antes. Confirme que o commit remoto é o desejado, então:

```bash
git pull --ff-only origin homologacao
git rev-parse --short HEAD
```

### 3.2 Atualizar o backend

```bash
cd /opt/apps/web_sistema_inovar_homologacao/sistema_inovar
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py check
python manage.py shell -c "from django.conf import settings; d=settings.DATABASES['default']; print('DB_HOST:', d['HOST']); print('DB_NAME:', d['NAME']); print('MEDIA_ROOT:', settings.MEDIA_ROOT); print('STATIC_ROOT:', settings.STATIC_ROOT)"
python manage.py showmigrations --plan
```

O comando de inspeção mostra apenas host/nome do banco e caminhos dos arquivos;
não imprime senhas. Ele deve confirmar a configuração esperada antes de seguir.
`showmigrations` é somente leitura. Se houver migrações pendentes, **não rode
`migrate` aqui**: avalie o procedimento da seção 5. Se alguma dependência usada
pelo projeto ainda não estiver no `requirements.txt`, corrija-o no repositório;
não dependa permanentemente de instalação manual no servidor.

Compare `STATIC_ROOT` com o da produção. Só execute o comando abaixo se ele
apontar para um diretório **exclusivo da homologação** (por exemplo,
`/opt/apps/web_sistema_inovar_homologacao/sistema_inovar/staticfiles`):

```bash
python manage.py collectstatic --noinput
```

Se `STATIC_ROOT` apontar para a produção, configure um caminho próprio no
`.env` da homologação antes. Não colete arquivos estáticos num caminho
compartilhado. Confirme que os `alias` de `/static/admin/` e
`/static/rest_framework/` no site Nginx da homologação apontam para esse mesmo
diretório exclusivo. `MEDIA_ROOT`, ao contrário, permanece compartilhado por
decisão operacional, com os riscos descritos na seção 1.

### 3.3 Gerar o frontend da homologação

```bash
cd /opt/apps/web_sistema_inovar_homologacao/sistema_inovar/frontend
npm ci
REACT_APP_API_URL= npm run build
test -f build/index.html && echo BUILD_OK
sudo -u www-data test -r build/index.html && echo FRONTEND_LEGIVEL
```

O valor vazio de `REACT_APP_API_URL` faz o navegador chamar `/api/` no próprio
host da homologação. Ele deve ser definido **durante cada build**, inclusive se
existir `.env.local`. Não coloque `http://localhost:8000` no build do servidor:
para o navegador do usuário, `localhost` seria o computador dele. O frontend é
estático; não execute `npm start` na Droplet.

### 3.4 Reiniciar e conferir apenas a homologação

```bash
sudo systemctl restart sistema-inovar-homologacao
sudo systemctl status sistema-inovar-homologacao --no-pager
sudo journalctl -u sistema-inovar-homologacao -n 80 --no-pager
curl -I http://127.0.0.1:8001/admin/
curl -I -H 'Host: homologacao.sistema.inovar' http://192.168.196.189/
curl -I -H 'Host: homologacao.sistema.inovar' http://192.168.196.189/api/token/
```

O `GET /api/token/` pode retornar `405 Method Not Allowed`; isso confirma que
a rota chegou ao Django, pois o login usa POST. O `GET /` deve entregar o
frontend, não `500`. Abra `http://homologacao.sistema.inovar` em um computador
autorizado no ZeroTier e valide o fluxo afetado pela mudança. **Não reinicie
`sistema-inovar` nesta etapa.**

O Nginx já atende o diretório `build`; um deploy normal do frontend não exige
recarregá-lo. Se a configuração do Nginx tiver sido alterada, faça separadamente:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Se houver `500` na página inicial, confira `build/index.html`, a permissão de
leitura do `www-data` e `/var/log/nginx/error.log`. Se o login funcionar mas a
API falhar, examine o serviço da homologação e o proxy da porta `8001`.

## 4. Promoção e deploy na produção

Só prossiga depois de validar o commit na homologação e aprovar a publicação.
Promova **o mesmo código** para `deploy-do` pelo fluxo normal do repositório
(revisão/merge), evitando mudanças adicionais não testadas. Antes de publicar,
compare o commit de produção com o conteúdo aprovado; branchs podem divergir.

### 4.1 Confirmar o estado da produção e o backup

```bash
sudo systemctl status sistema-inovar --no-pager
sudo systemctl status sistema-inovar-backup.timer --no-pager
df -h
cd /opt/apps/web_sistema_inovar
git status --short
git branch --show-current
git fetch origin
git log -1 --format='%h %s'
git log -1 --format='%h %s' origin/deploy-do
```

Continue somente se a branch atual for `deploy-do`, o diretório estiver limpo e
o commit remoto for o aprovado. Registre o SHA anterior para uma eventual
reversão de código. Para alteração de banco, verifique um backup recente e
válido antes de seguir (manual de backup, seção de validação/restauração).

### 4.2 Atualizar código e backend da produção

```bash
cd /opt/apps/web_sistema_inovar
git pull --ff-only origin deploy-do
git rev-parse --short HEAD

cd /opt/apps/web_sistema_inovar/sistema_inovar
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py check
python manage.py shell -c "from django.conf import settings; d=settings.DATABASES['default']; print('DB_HOST:', d['HOST']); print('DB_NAME:', d['NAME']); print('MEDIA_ROOT:', settings.MEDIA_ROOT); print('STATIC_ROOT:', settings.STATIC_ROOT)"
python manage.py showmigrations --plan
python manage.py collectstatic --noinput
```

Se aparecerem migrações pendentes, use a seção 5 antes de prosseguir; não as
inclua de modo automático no deploy rotineiro. Como o banco é compartilhado,
uma migração executada pela produção também muda o que a homologação enxerga.

### 4.3 Gerar o frontend da produção

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar/frontend
npm ci
REACT_APP_API_URL= npm run build
test -f build/index.html && echo BUILD_OK
sudo -u www-data test -r build/index.html && echo FRONTEND_LEGIVEL
```

Esse build deve usar a API no próprio domínio de produção; não reutilize o
diretório `build` da homologação. O Nginx serve arquivos estáticos diretamente
do diretório de produção.

### 4.4 Reiniciar e validar produção

```bash
sudo systemctl restart sistema-inovar
sudo systemctl status sistema-inovar --no-pager
sudo journalctl -u sistema-inovar -n 80 --no-pager
curl -I http://127.0.0.1:8000/admin/
curl -I http://127.0.0.1/login
```

Abra o endereço de produção e teste login, página inicial e o fluxo alterado,
com o menor número possível de operações reais. Confira também se a
homologação continua respondendo; os dois ambientes compartilham schema e
arquivos. O deploy normal não requer reiniciar PostgreSQL, ZeroTier, dnsmasq ou
Nginx.

## 5. Quando houver migração de banco

Este não é um passo opcional a ser feito "para garantir". Execute somente
quando o código aprovado realmente precisar de migração e após revisar o SQL,
o impacto, o tempo de execução e a compatibilidade com as versões de código
que ficarão no ar. Há migrações pendentes identificadas anteriormente no banco
acessado localmente; confirme o estado **na Droplet** antes de decidir.

Fluxo seguro de decisão:

1. Confirme o nome do banco e compare `showmigrations --plan` nos dois
   diretórios. Se não for o banco esperado, pare.
2. Verifique backup recente e possibilidade de restauração; combine janela de
   manutenção se a mudança puder bloquear tabelas ou quebrar código antigo.
3. Prefira migrações compatíveis com ambas as versões: primeiro expandir schema,
   depois publicar código, e só em deploy posterior remover colunas antigas.
4. Para migração aprovada, use **um único** diretório/venv e rode `migrate` uma
   única vez; não rode uma vez em cada ambiente.
5. Valide a produção e a homologação após a migração.

Exemplo, **somente após aprovação e backup verificado**:

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar
source .venv/bin/activate
python manage.py shell -c "from django.conf import settings; print(settings.DATABASES['default']['HOST'], settings.DATABASES['default']['NAME'])"
python manage.py migrate --plan
python manage.py migrate
python manage.py showmigrations --plan
```

Não rode `python manage.py test` conectado com credenciais do banco de produção;
configure um banco de testes isolado antes. Também não use `flush`, comandos de
migração de arquivos ou comandos com `--execute` como parte do deploy normal.

## 6. Falha e reversão

- **Frontend 500:** veja `/var/log/nginx/error.log`; confira `build/index.html`
  e permissões de leitura no diretório do ambiente afetado.
- **Backend 502/504:** veja `journalctl -u` do serviço afetado, a porta `8000`
  ou `8001`, e o banco. Não reinicie o outro ambiente por reflexo.
- **Versão incorreta:** confirme `git rev-parse --short HEAD` nos dois
  diretórios e a branch que cada um acompanha.
- **Falha após mudança de schema:** não faça simples reversão de código sem
  avaliar compatibilidade. Uma migração já aplicada afeta ambos os ambientes;
  restauração do banco é operação de produção e requer plano próprio.

Para rollback **somente de código, sem migrações incompatíveis**, publique um
commit de reversão pelo fluxo Git e repita as etapas de backend, frontend e
reinício do ambiente afetado. Não use `git reset --hard`, não substitua o
`.env` e não restaure banco/arquivos como tentativa de corrigir um build.

## Referências

- `DEPLOY_DIGITALOCEAN.md`: arquitetura atual, serviços, Nginx e Gunicorn.
- `MANUAL_DNS_PRIVADO_ZEROTIER.md`: acesso privado a `sistema.inovar`.
- `MANUAL_OPERACAO_BACKUP_ARQUIVOS.md`: verificação de backups antes de mudanças
  no banco e procedimento de restauração.