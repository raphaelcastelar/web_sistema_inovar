# Deploy DigitalOcean - Sistema Inovar

Este documento descreve como instalar, operar e atualizar o Sistema Inovar na
droplet da DigitalOcean.

Arquitetura atual:

```txt
Usuario / Webhook BB
  -> Cloudflare DNS
  -> Droplet DigitalOcean
  -> Nginx
  -> React build estatico
  -> Gunicorn + Django
  -> PostgreSQL local na droplet
  -> Arquivos em servidor externo via ZeroTier + SMB/CIFS
```

Hoje o projeto nao usa Docker. Os "containers" operacionais, na pratica, sao
servicos systemd: `sistema-inovar`, `nginx`, `postgresql` e `zerotier-one`.

## Caminhos Padrao

```bash
APP_ROOT=/opt/apps/web_sistema_inovar
DJANGO_ROOT=/opt/apps/web_sistema_inovar/sistema_inovar
FRONTEND_ROOT=/opt/apps/web_sistema_inovar/sistema_inovar/frontend
ENV_FILE=/opt/apps/web_sistema_inovar/sistema_inovar/sistema_inovar/.env
MEDIA_ROOT="/mnt/servidor-inovar/SISTEMA INOVAR"
```

## Servicos

Ver status:

```bash
sudo systemctl status sistema-inovar
sudo systemctl status nginx
sudo systemctl status postgresql
sudo systemctl status zerotier-one
```

Ver logs:

```bash
sudo journalctl -u sistema-inovar -n 120 --no-pager
sudo journalctl -u sistema-inovar -f
sudo tail -n 120 /var/log/nginx/error.log
sudo tail -n 120 /var/log/nginx/access.log
```

Reiniciar backend:

```bash
sudo systemctl restart sistema-inovar
```

Recarregar frontend/Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Reiniciar tudo que normalmente importa no deploy:

```bash
sudo systemctl restart sistema-inovar
sudo nginx -t
sudo systemctl reload nginx
```

## Ver "Containers"

Nao ha Docker/containers neste deploy. Para verificar:

```bash
docker ps
```

Se retornar que Docker nao existe, esta normal neste ambiente.

Use systemd:

```bash
systemctl list-units --type=service --state=running
systemctl status sistema-inovar nginx postgresql zerotier-one
```

Se no futuro o projeto for dockerizado, os comandos seriam:

```bash
docker compose ps
docker compose logs -f
docker compose restart
```

Mas eles nao se aplicam ao deploy atual.

## Variaveis De Ambiente

O Django le:

```bash
/opt/apps/web_sistema_inovar/sistema_inovar/sistema_inovar/.env
```

Campos importantes:

```env
DEBUG=False
ALLOWED_HOSTS=167.71.24.230,inovarcontabilidadeibatiba.com.br,bbhook.inovarcontabilidadeibatiba.com.br,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://inovarcontabilidadeibatiba.com.br,https://bbhook.inovarcontabilidadeibatiba.com.br,http://167.71.24.230
CORS_ALLOWED_ORIGINS=https://inovarcontabilidadeibatiba.com.br,https://bbhook.inovarcontabilidadeibatiba.com.br,http://167.71.24.230

POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=sistema_inovar_web
POSTGRES_USER=...
POSTGRES_PASSWORD=...

MEDIA_ROOT=/mnt/servidor-inovar/SISTEMA INOVAR
WKHTMLTOPDF_PATH=/usr/bin/wkhtmltopdf

BB_WEBHOOK_TOKEN=
```

Nunca commitar `.env`.

## Atualizar Codigo Na Droplet

Use este fluxo para atualizar backend e frontend:

```bash
cd /opt/apps/web_sistema_inovar
git fetch origin
git status
git pull
```

Se estiver usando uma branch especifica:

```bash
git switch deploy-do
git pull origin deploy-do
```

Atualizar dependencias Python e banco:

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar
source .venv/bin/activate
pip install -r requirements.txt
python manage.py check
python manage.py migrate
python manage.py collectstatic --noinput
```

Atualizar frontend:

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar/frontend
npm install
npm run build
```

Reiniciar servicos:

```bash
sudo systemctl restart sistema-inovar
sudo nginx -t
sudo systemctl reload nginx
```

Validar:

```bash
curl -I http://127.0.0.1:8000/admin/
curl -I http://127.0.0.1/login
curl -I http://167.71.24.230/login
```

## Quando Mudar So O Backend

```bash
cd /opt/apps/web_sistema_inovar
git pull

cd /opt/apps/web_sistema_inovar/sistema_inovar
source .venv/bin/activate
pip install -r requirements.txt
python manage.py check
python manage.py migrate

sudo systemctl restart sistema-inovar
sudo journalctl -u sistema-inovar -n 80 --no-pager
```

## Quando Mudar So O Frontend

```bash
cd /opt/apps/web_sistema_inovar
git pull

cd /opt/apps/web_sistema_inovar/sistema_inovar/frontend
npm install
npm run build

sudo nginx -t
sudo systemctl reload nginx
```

## Nginx

Arquivo esperado:

```bash
/etc/nginx/sites-available/sistema-inovar
```

Pontos importantes:

```nginx
server {
    listen 80 default_server;
    server_name 167.71.24.230 inovarcontabilidadeibatiba.com.br bbhook.inovarcontabilidadeibatiba.com.br;

    root /opt/apps/web_sistema_inovar/sistema_inovar/frontend/build;
    index index.html;

    client_max_body_size 100M;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
        send_timeout 300;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/admin/ {
        alias /opt/apps/web_sistema_inovar/sistema_inovar/staticfiles/admin/;
    }

    location /static/rest_framework/ {
        alias /opt/apps/web_sistema_inovar/sistema_inovar/staticfiles/rest_framework/;
    }

    location /static/ {
        root /opt/apps/web_sistema_inovar/sistema_inovar/frontend/build;
        try_files $uri =404;
    }

    location /media/ {
        alias "/mnt/servidor-inovar/SISTEMA INOVAR/";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Testar Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Backend Systemd

Arquivo esperado:

```bash
/etc/systemd/system/sistema-inovar.service
```

Exemplo:

```ini
[Unit]
Description=Sistema Inovar Django
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/apps/web_sistema_inovar/sistema_inovar
EnvironmentFile=/opt/apps/web_sistema_inovar/sistema_inovar/sistema_inovar/.env
Environment=HOME=/tmp
ExecStart=/opt/apps/web_sistema_inovar/sistema_inovar/.venv/bin/gunicorn sistema_inovar.wsgi:application --workers 3 --timeout 180 --graceful-timeout 30 --bind 127.0.0.1:8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Aplicar mudancas no service:

```bash
sudo systemctl daemon-reload
sudo systemctl restart sistema-inovar
sudo systemctl status sistema-inovar
```

## PostgreSQL

Entrar no banco:

```bash
sudo -u postgres psql
```

Testar conexao pelo Django:

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar
source .venv/bin/activate
python manage.py shell -c "from django.db import connection; c=connection.cursor(); c.execute('select 1'); print('DB_OK')"
```

Backup:

```bash
sudo -u postgres pg_dump -Fc sistema_inovar_web > /tmp/sistema_inovar_web_$(date +%Y%m%d_%H%M).dump
```

Restaurar backup:

```bash
sudo -u postgres pg_restore --clean --if-exists -d sistema_inovar_web /tmp/arquivo.dump
```

## ZeroTier E Arquivos

Ver status:

```bash
sudo systemctl status zerotier-one
zerotier-cli listnetworks
ip -4 addr
```

Ver se o compartilhamento esta montado:

```bash
mount | grep servidor-inovar
df -h | grep servidor-inovar
ls -lah "/mnt/servidor-inovar/SISTEMA INOVAR"
sudo -u www-data ls -lah "/mnt/servidor-inovar/SISTEMA INOVAR"
```

Montar novamente:

```bash
sudo mount -a
```

Testar escrita como Django:

```bash
sudo -u www-data touch "/mnt/servidor-inovar/SISTEMA INOVAR/teste_www_data.txt"
sudo -u www-data rm "/mnt/servidor-inovar/SISTEMA INOVAR/teste_www_data.txt"
```

Se falhar, verificar `/etc/fstab` e credenciais SMB.

## Webhook Banco Do Brasil

URL usada:

```txt
https://bbhook.inovarcontabilidadeibatiba.com.br/api/webhook/bb-cobranca/
```

Com DNS direto, o registro Cloudflare deve ser:

```txt
Type: A
Name: bbhook
Content: 167.71.24.230
Proxy status: Proxied
```

Testar webhook:

```bash
curl -i -X POST https://bbhook.inovarcontabilidadeibatiba.com.br/api/webhook/bb-cobranca/ \
  -H "Content-Type: application/json" \
  -d '{"tipoEvento":"BAIXA OPERACIONAL","numeroTituloCliente":"TESTE","valorPago":"1.00","dataPagamento":"2026-06-28"}'
```

Ver log:

```bash
tail -n 50 /opt/apps/web_sistema_inovar/sistema_inovar/logs/webhook_bb.log
sudo journalctl -u sistema-inovar -n 80 --no-pager
```

Se aparecer permissao negada no log:

```bash
sudo mkdir -p /opt/apps/web_sistema_inovar/sistema_inovar/logs
sudo chown -R www-data:www-data /opt/apps/web_sistema_inovar/sistema_inovar/logs
sudo chmod -R 775 /opt/apps/web_sistema_inovar/sistema_inovar/logs
sudo systemctl restart sistema-inovar
```

## SSL

Se for usar Certbot direto na droplet:

```bash
sudo certbot --nginx -d inovarcontabilidadeibatiba.com.br -d bbhook.inovarcontabilidadeibatiba.com.br
sudo certbot renew --dry-run
```

Se Cloudflare estiver como proxy laranja, usar modo:

```txt
SSL/TLS -> Full (strict)
```

## Checklist Depois Do Deploy

```bash
sudo systemctl status sistema-inovar
sudo systemctl status nginx
sudo systemctl status postgresql
sudo systemctl status zerotier-one

curl -I http://127.0.0.1:8000/admin/
curl -I http://127.0.0.1/login
curl -I http://167.71.24.230/login
curl -I http://167.71.24.230/api/token/
```

`/api/token/` via GET pode retornar `405 Method Not Allowed`. Isso e normal; o
endpoint de login usa POST.

## Migrar Estrutura De Pastas (Agosto/2026)

O comando abaixo e destrutivo. Ele preserva somente os arquivos de
`DOCUMENTOS CONSTITUTIVOS` e de `DEPARTAMENTO PESSOAL/2026/082026`, atualiza
os caminhos no banco e cria a nova arvore de pastas.

Primeiro, simule sem alterar nada:

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar
source .venv/bin/activate
python manage.py migrar_estrutura_pastas_2026
```

Para validar apenas uma empresa:

```bash
python manage.py migrar_estrutura_pastas_2026 --empresa="ACOUGUE PONTES"
```

Depois de revisar a contagem exibida, execute uma unica vez:

```bash
python manage.py migrar_estrutura_pastas_2026 \
  --execute \
  --confirm=APAGAR_ARQUIVOS_E_MIGRAR
```

O comando ignora empresas que ja nao tenham a estrutura legada, evitando que
uma segunda execucao apague os arquivos preservados na primeira.

## Migrar Arquivos Para o Disco da Droplet

O procedimento preserva o servidor físico e não usa `--delete`.

### 1. Instalar ferramentas e preparar diretórios

```bash
sudo apt update
sudo apt install -y rsync util-linux postgresql-client
sudo install -d -o www-data -g www-data -m 0750 /srv/sistema-inovar/arquivos
sudo install -d -o www-data -g www-data -m 0750 /srv/sistema-inovar/backup-database
sudo install -d -o www-data -g www-data -m 0750 /srv/sistema-inovar/logs-backup
```

Adicionar ao `.env`, mantendo temporariamente o `MEDIA_ROOT` antigo:

```env
CLOUD_MEDIA_ROOT=/srv/sistema-inovar/arquivos
PHYSICAL_BACKUP_ROOT=/mnt/servidor-inovar/SISTEMA INOVAR
```

### 2. Inventariar o acervo atual

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar
source .venv/bin/activate
python manage.py inventariar_arquivos \
  --output=/var/tmp/inventario_antes_migracao.json
```

Esse comando não modifica arquivos nem banco. Executar fora do horário de pico
para reduzir leitura concorrente no SMB.

### 3. Simular a cópia

```bash
python manage.py migrar_arquivos_para_nuvem
```

Revisar toda a saída antes da execução real. A simulação é o comportamento
padrão.

### 4. Executar a cópia inicial

```bash
python manage.py migrar_arquivos_para_nuvem \
  --execute \
  --confirm=COPIAR_ARQUIVOS_PARA_DROPLET
```

Para retomar por ordem alfabética e reduzir o consumo de RAM, processe uma pasta
de empresa por vez. Por exemplo, para começar pela letra J:

```bash
python manage.py migrar_arquivos_para_nuvem \
  --start-from=J \
  --execute \
  --confirm=COPIAR_ARQUIVOS_PARA_DROPLET
```

O comando mostra o nome de cada empresa. Se for interrompido, ele pode ser
executado novamente com o nome da última pasta exibida em `--start-from`. Os
arquivos completos serão ignorados pelo rsync e os incompletos serão refeitos.

A aplicação pode continuar funcionando durante essa primeira cópia. Antes da
virada, fazer uma segunda execução curta para capturar arquivos criados enquanto
a cópia inicial estava em andamento:

```bash
python manage.py migrar_arquivos_para_nuvem \
  --execute \
  --confirm=COPIAR_ARQUIVOS_PARA_DROPLET
```

### 5. Verificar conteúdo integral

```bash
python manage.py migrar_arquivos_para_nuvem --checksum
```

O resultado não deve listar arquivos pendentes. Essa comparação lê os dois
lados integralmente e deve ser executada fora do horário de pico.

### 6. Virar o armazenamento principal

Alterar somente esta variável no `.env`:

```env
MEDIA_ROOT=/srv/sistema-inovar/arquivos
```

Editar também `/etc/systemd/system/sistema-inovar.service`. Depois da virada, o
serviço web não deve conter `Requires=zerotier-one.service`, nem depender do
ZeroTier em `After`. O bloco deve ficar assim:

```ini
[Unit]
Description=Sistema Inovar Django
After=network.target postgresql.service
Requires=postgresql.service
```

O ZeroTier continuará sendo exigido somente pelo serviço de backup noturno.

Reiniciar e validar:

```bash
sudo systemctl daemon-reload
sudo systemctl restart sistema-inovar
sudo systemctl status sistema-inovar --no-pager
sudo -u www-data test -w /srv/sistema-inovar/arquivos
curl -I http://127.0.0.1:8000/admin/
```

Testar upload, download, visualização, e-mail, WhatsApp e geração de um DAS. Não
apagar nem desmontar o acervo físico durante a estabilização.

### 7. Instalar e testar o backup diário

```bash
sudo chmod 0750 /opt/apps/web_sistema_inovar/deploy/scripts/backup_arquivos.sh
sudo cp /opt/apps/web_sistema_inovar/deploy/systemd/sistema-inovar-backup.service /etc/systemd/system/
sudo cp /opt/apps/web_sistema_inovar/deploy/systemd/sistema-inovar-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start sistema-inovar-backup.service
sudo systemctl status sistema-inovar-backup.service --no-pager
sudo journalctl -u sistema-inovar-backup.service -n 100 --no-pager
```

Somente depois do teste manual bem-sucedido:

```bash
sudo systemctl enable --now sistema-inovar-backup.timer
systemctl list-timers sistema-inovar-backup.timer --all
```

O timer usa `America/Sao_Paulo`, executa todos os dias à meia-noite e, por ser
persistente, executa posteriormente se a Droplet estiver desligada no horário.

### 8. Reversão durante a estabilização

Se ocorrer uma falha crítica, restaurar temporariamente no `.env`:

```env
MEDIA_ROOT=/mnt/servidor-inovar/SISTEMA INOVAR
```

Antes de reiniciar, copiar para o físico qualquer arquivo criado exclusivamente
na Droplet durante a janela. Depois:

```bash
sudo systemctl restart sistema-inovar
```

## Problemas Comuns

### 404 Cannot POST /api/token/

O frontend esta chamando o servidor errado. Localmente, use:

```env
REACT_APP_API_URL=http://localhost:8000
```

Na producao, normalmente deixe vazio no build para usar o mesmo dominio.

### Tela branca no frontend

Verificar se o build existe:

```bash
ls -lah /opt/apps/web_sistema_inovar/sistema_inovar/frontend/build/index.html
```

Regerar:

```bash
cd /opt/apps/web_sistema_inovar/sistema_inovar/frontend
npm run build
sudo systemctl reload nginx
```

### 500 ao sincronizar pasta

Ver logs:

```bash
sudo journalctl -u sistema-inovar -n 120 --no-pager
```

Checar mount:

```bash
sudo -u www-data ls -lah "/mnt/servidor-inovar/SISTEMA INOVAR"
```

### 504 Gateway Timeout

Verificar endpoint lento e aumentar timeouts do Nginx/Gunicorn. Se o banco
estiver remoto via ZeroTier, considerar banco local na droplet.

### Bad Request 400 no login

Verificar `ALLOWED_HOSTS` no `.env`:

```bash
grep ALLOWED_HOSTS /opt/apps/web_sistema_inovar/sistema_inovar/sistema_inovar/.env
```

Adicionar o IP/dominio usado no navegador e reiniciar:

```bash
sudo systemctl restart sistema-inovar
```
