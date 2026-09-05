# Manual do DNS privado `sistema.inovar` pela rede ZeroTier

## 1. Objetivo

Este manual configura o nome privado:

```text
http://sistema.inovar
```

para abrir o Sistema Inovar sem digitar o IP da Droplet. O endereço funciona
somente em computadores conectados e autorizados na rede privada ZeroTier.

Não é necessário comprar ou controlar um domínio público. O nome
`sistema.inovar` será resolvido pelo `dnsmasq` instalado na Droplet.

## 2. Dados usados nesta instalação

```text
Rede ZeroTier (Network ID): e5cd7a9e1c5d7972
Nome da rede:               sistema_inovar
IP ZeroTier da Droplet:     192.168.196.189
Faixa privada:              192.168.196.0/24
Interface na Droplet:       ztppispz3o
Nome privado escolhido:     sistema.inovar
Endereço de acesso:         http://sistema.inovar
```

O IP `167.71.24.230` é o IP público da Droplet e não deve ser usado como servidor
DNS privado nesta configuração.

## 3. Visão da arquitetura

```text
Computador autorizado no ZeroTier
              |
              | consulta DNS pela rede privada
              v
dnsmasq na Droplet: 192.168.196.189:53
              |
              | sistema.inovar = 192.168.196.189
              v
Nginx -> React / Gunicorn / Django
```

O `dnsmasq` escuta apenas na interface ZeroTier. A porta DNS não deve ser aberta
na interface pública da Droplet.

---

## 4. Configuração única na Droplet

Todos os comandos desta seção devem ser executados na Droplet Ubuntu.

### 4.1. Confirmar o endereço e a interface ZeroTier

```bash
sudo zerotier-cli listnetworks
```

Resultado esperado, contendo estes valores:

```text
e5cd7a9e1c5d7972 sistema_inovar ... OK PRIVATE ztppispz3o 192.168.196.189/24
```

Confirme também a interface:

```bash
ip address show dev ztppispz3o
```

### 4.2. Verificar a porta 53

```bash
sudo ss -lntup | grep ':53 ' || true
```

É normal encontrar `systemd-resolved` em `127.0.0.53`. O `dnsmasq` será
configurado para ouvir especificamente em `192.168.196.189`.

### 4.3. Instalar os pacotes

```bash
sudo apt update
sudo apt install -y dnsmasq dnsutils
```

Se o serviço ainda não iniciar neste momento, prossiga para criar a configuração.

### 4.4. Criar a configuração do DNS privado

Abra o arquivo:

```bash
sudo nano /etc/dnsmasq.d/sistema-inovar.conf
```

Cole exatamente:

```ini
# DNS privado do Sistema Inovar pela rede ZeroTier
interface=ztppispz3o
listen-address=192.168.196.189
bind-dynamic

# Zona e nome privados
address=/sistema.inovar/192.168.196.189
local=/inovar/
domain=inovar

# Segurança e cache
domain-needed
bogus-priv
cache-size=1000
```

No Nano, use `Ctrl+O`, Enter e `Ctrl+X` para salvar e sair.

### 4.5. Validar e iniciar o dnsmasq

```bash
sudo dnsmasq --test
sudo systemctl restart dnsmasq
sudo systemctl enable dnsmasq
sudo systemctl status dnsmasq --no-pager
```

O teste deve informar:

```text
dnsmasq: syntax check OK
```

Confirme que as portas TCP e UDP estão limitadas ao IP ZeroTier:

```bash
sudo ss -lnup | grep '192.168.196.189:53'
sudo ss -lntp | grep '192.168.196.189:53'
```

### 4.6. Configurar o firewall UFW

Confira primeiro o estado:

```bash
sudo ufw status verbose
```

Adicione as regras privadas:

```bash
sudo ufw allow in on ztppispz3o from 192.168.196.0/24 to 192.168.196.189 port 53 proto udp comment 'DNS Sistema Inovar via ZeroTier'
sudo ufw allow in on ztppispz3o from 192.168.196.0/24 to 192.168.196.189 port 53 proto tcp comment 'DNS Sistema Inovar via ZeroTier'
sudo ufw status numbered
```

Não crie uma regra de porta 53 em `eth0` e não use `sudo ufw allow 53`, pois
isso poderia expor o DNS publicamente.

### 4.7. Testar o servidor DNS diretamente

```bash
dig @192.168.196.189 sistema.inovar
nslookup sistema.inovar 192.168.196.189
```

O resultado deve conter:

```text
sistema.inovar.  IN  A  192.168.196.189
```

---

## 5. Configuração única no ZeroTier Central

Esta etapa é feita pelo navegador:

1. Acesse `https://my.zerotier.com/` e entre na conta.
2. Abra a rede de ID `e5cd7a9e1c5d7972`, chamada `sistema_inovar`.
3. Abra **DNS Settings**.
4. Cadastre o domínio de pesquisa `inovar`.
5. Cadastre `192.168.196.189` como endereço do servidor DNS.
6. Salve a configuração.

Valores esperados:

```text
Search domain:  inovar
Server address: 192.168.196.189
```

O endereço do servidor DNS deve ser o IP ZeroTier da Droplet, nunca o IP público.

---

## 6. Autorizar o nome no Nginx

Na Droplet, abra a configuração:

```bash
sudo nano /etc/nginx/sites-available/sistema-inovar
```

Na diretiva `server_name`, inclua `sistema.inovar`. Exemplo:

```nginx
server_name 167.71.24.230 inovarcontabilidadeibatiba.com.br bbhook.inovarcontabilidadeibatiba.com.br sistema.inovar;
```

Valide e recarregue:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Teste o roteamento pelo cabeçalho HTTP:

```bash
curl -I -H 'Host: sistema.inovar' http://192.168.196.189/
```

Uma resposta HTTP do Nginx, inclusive redirecionamento `301` ou `302`, confirma
que o nome foi reconhecido. Se houver redirecionamento obrigatório para HTTPS,
consulte a seção de solução de problemas.

---

## 7. Autorizar o nome no Django

Abra o arquivo de ambiente da aplicação:

```bash
sudo nano /opt/apps/web_sistema_inovar/sistema_inovar/sistema_inovar/.env
```

Inclua `sistema.inovar` na linha já existente de `ALLOWED_HOSTS`:

```env
ALLOWED_HOSTS=167.71.24.230,inovarcontabilidadeibatiba.com.br,bbhook.inovarcontabilidadeibatiba.com.br,sistema.inovar,localhost,127.0.0.1
```

Inclua também a origem HTTP nas listas existentes:

```env
CSRF_TRUSTED_ORIGINS=https://inovarcontabilidadeibatiba.com.br,https://bbhook.inovarcontabilidadeibatiba.com.br,http://167.71.24.230,http://sistema.inovar
CORS_ALLOWED_ORIGINS=https://inovarcontabilidadeibatiba.com.br,https://bbhook.inovarcontabilidadeibatiba.com.br,http://167.71.24.230,http://sistema.inovar
```

Não crie linhas duplicadas para a mesma variável. Edite as linhas existentes.
Não mostre nem copie senhas presentes no `.env`.

Reinicie e confira o backend:

```bash
sudo systemctl restart sistema-inovar
sudo systemctl status sistema-inovar --no-pager
sudo journalctl -u sistema-inovar -n 50 --no-pager
```

---

## 8. Configuração necessária em cada computador Windows

Cada computador precisa:

- ter o ZeroTier instalado;
- estar conectado à rede `e5cd7a9e1c5d7972`;
- estar autorizado no ZeroTier Central;
- permitir o DNS gerenciado da rede.

Não é necessário editar o arquivo `hosts` de cada computador.

### 8.1. Entrar na rede, se ainda não estiver conectado

Abra PowerShell ou Prompt de Comando **como administrador**:

```powershell
zerotier-cli join e5cd7a9e1c5d7972
zerotier-cli listnetworks
```

Depois, no ZeroTier Central, autorize o novo dispositivo. O estado esperado no
computador é `OK PRIVATE`.

### 8.2. Permitir o DNS gerenciado

```powershell
zerotier-cli set e5cd7a9e1c5d7972 allowDNS=1
ipconfig /flushdns
```

Se `zerotier-cli` não for reconhecido, tente:

```powershell
& "C:\Program Files (x86)\ZeroTier\One\zerotier-cli.bat" set e5cd7a9e1c5d7972 allowDNS=1
ipconfig /flushdns
```

Também é possível abrir o aplicativo ZeroTier na bandeja do Windows, selecionar
a rede `sistema_inovar` e ativar **Allow DNS**.

### 8.3. Testar no Windows

```powershell
Resolve-DnsName sistema.inovar
ping sistema.inovar
Test-NetConnection sistema.inovar -Port 80
```

O nome precisa resolver para:

```text
192.168.196.189
```

Abra no navegador:

```text
http://sistema.inovar
```

---

## 9. Configuração em computadores Linux

O suporte ao DNS gerenciado depende do resolvedor DNS da distribuição. Primeiro,
entre na rede e permita o DNS:

```bash
sudo zerotier-cli join e5cd7a9e1c5d7972
sudo zerotier-cli set e5cd7a9e1c5d7972 allowDNS=1
sudo zerotier-cli listnetworks
```

Se o sistema usa `systemd-resolved`, limpe o cache e teste:

```bash
sudo resolvectl flush-caches
resolvectl query sistema.inovar
getent hosts sistema.inovar
curl -I http://sistema.inovar
```

Se não resolver, confirme se o servidor DNS foi aplicado:

```bash
resolvectl status
```

O IP `192.168.196.189` deve aparecer como servidor DNS associado à interface
ZeroTier.

---

## 10. Configuração em computadores macOS

Entre na rede pelo aplicativo ZeroTier, autorize o dispositivo no Central e
ative **Allow DNS** para a rede `sistema_inovar`.

Para limpar o cache e testar:

```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
dscacheutil -q host -a name sistema.inovar
ping -c 4 sistema.inovar
curl -I http://sistema.inovar
```

No macOS, `dig` e `nslookup` podem não representar corretamente resoluções DNS
associadas a uma interface específica. Para o teste final, use o navegador,
`dscacheutil`, `ping` ou `curl`.

---

## 11. Remover entradas antigas do arquivo hosts

Entradas manuais podem mascarar o resultado do DNS. Depois de concluir a
configuração, remova a linha abaixo dos computadores onde ela foi criada:

```text
192.168.196.189 sistema.inovar
```

Na Droplet:

```bash
sudo nano /etc/hosts
```

No Windows, abra como administrador:

```text
C:\Windows\System32\drivers\etc\hosts
```

Depois, no Windows:

```powershell
ipconfig /flushdns
Resolve-DnsName sistema.inovar
```

---

## 12. Verificação completa

### Na Droplet

```bash
sudo zerotier-cli listnetworks
sudo systemctl is-active dnsmasq
sudo systemctl is-enabled dnsmasq
sudo dnsmasq --test
dig @192.168.196.189 sistema.inovar
sudo ss -lntup | grep '192.168.196.189:53'
sudo nginx -t
sudo systemctl is-active nginx sistema-inovar
curl -I -H 'Host: sistema.inovar' http://192.168.196.189/
```

### Em cada computador Windows

```powershell
zerotier-cli listnetworks
ipconfig /flushdns
Resolve-DnsName sistema.inovar
ping sistema.inovar
Test-NetConnection sistema.inovar -Port 53
Test-NetConnection sistema.inovar -Port 80
```

Depois acesse:

```text
http://sistema.inovar
```

---

## 13. Solução de problemas

### O nome não resolve

Na Droplet:

```bash
sudo systemctl status dnsmasq --no-pager
sudo journalctl -u dnsmasq -n 100 --no-pager
dig @192.168.196.189 sistema.inovar
sudo ufw status numbered
```

No Windows:

```powershell
zerotier-cli listnetworks
zerotier-cli set e5cd7a9e1c5d7972 allowDNS=1
ipconfig /flushdns
nslookup sistema.inovar 192.168.196.189
Resolve-DnsName sistema.inovar
```

Se `nslookup sistema.inovar 192.168.196.189` funcionar, mas
`Resolve-DnsName sistema.inovar` não funcionar, o servidor está correto e o
problema está na aplicação da configuração DNS pelo cliente ZeroTier.

### O DNS funciona, mas o navegador não abre

No computador:

```powershell
Test-NetConnection sistema.inovar -Port 80
```

Na Droplet:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo systemctl status sistema-inovar --no-pager
sudo tail -n 100 /var/log/nginx/error.log
sudo journalctl -u sistema-inovar -n 100 --no-pager
```

Confirme que `sistema.inovar` aparece no `server_name` do Nginx e em
`ALLOWED_HOSTS` no `.env`.

### Aparece `DisallowedHost`

Edite o `.env`, inclua `sistema.inovar` em `ALLOWED_HOSTS` e reinicie:

```bash
sudo systemctl restart sistema-inovar
```

### O navegador tenta abrir HTTPS

Digite explicitamente:

```text
http://sistema.inovar
```

Como `.inovar` é um nome privado, não há certificado HTTPS público comum para
esse endereço. Uma regra global que force HTTPS no Nginx deve excluir esse host,
ou o acesso privado precisará de uma autoridade certificadora interna.

### O dnsmasq não inicia porque a porta 53 está ocupada

Confira o endereço exato ocupado:

```bash
sudo ss -lntup | grep ':53 '
sudo journalctl -u dnsmasq -n 100 --no-pager
```

`systemd-resolved` em `127.0.0.53` pode coexistir com o dnsmasq em
`192.168.196.189`. Não desative o `systemd-resolved` sem antes confirmar um
conflito real no mesmo endereço.

---

## 14. Reversão

Para desativar o DNS privado na Droplet:

```bash
sudo systemctl disable --now dnsmasq
```

Remova somente as regras UFW correspondentes, usando os números exibidos:

```bash
sudo ufw status numbered
```

Depois execute `sudo ufw delete NUMERO` individualmente para as duas regras
identificadas como `DNS Sistema Inovar via ZeroTier`. Confira os números de novo
após cada exclusão, pois eles são reorganizados.

No ZeroTier Central, remova o domínio de pesquisa `inovar` e o servidor DNS
`192.168.196.189` das configurações da rede.

Em cada cliente, desative o DNS gerenciado se necessário:

```powershell
zerotier-cli set e5cd7a9e1c5d7972 allowDNS=0
ipconfig /flushdns
```

Desativar o dnsmasq não remove arquivos da aplicação, não altera o PostgreSQL,
não interfere no backup e não remove nenhum dispositivo da rede ZeroTier.

