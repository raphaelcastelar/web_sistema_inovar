# Banco Inter - API Cobrança v3

A emissão de honorários usa a API Cobrança v3 (boleto com Pix), autenticação
OAuth 2.0 e mTLS. O PDF é obtido diretamente do Banco Inter.

## Variáveis de ambiente

```env
INTER_CLIENT_ID=
INTER_CLIENT_SECRET=
INTER_CERT_PATH=/caminho/seguro/Inter API_Certificado.crt
INTER_KEY_PATH=/caminho/seguro/Inter API_Chave.key
INTER_CONTA_CORRENTE=
INTER_SCOPE=boleto-cobranca.read boleto-cobranca.write
INTER_API_BASE_URL=https://cdpj.partners.bancointer.com.br/cobranca/v3
INTER_OAUTH_URL=https://cdpj.partners.bancointer.com.br/oauth/v2/token
INTER_REQUEST_TIMEOUT=30
INTER_DIAS_AGENDA=60
```

`INTER_CONTA_CORRENTE` só é obrigatório quando a integração estiver associada
a mais de uma conta. Certificado, chave e `.env` não devem ser versionados.

No ambiente local, os caminhos padrão apontam para os arquivos já colocados em
`chaves/`. Em produção, informe caminhos absolutos montados fora do repositório.

## Webhook

A URL pública é:

```text
https://SEU_DOMINIO/api/webhook/inter-cobranca/
```

Depois do deploy, cadastre-a no Inter com:

```powershell
python manage.py configurar_webhook_inter --url "https://SEU_DOMINIO/api/webhook/inter-cobranca/"
```

O proxy HTTPS deve preservar o corpo JSON e, quando disponível na
infraestrutura, validar o certificado de origem do callback do Inter.

## Sandbox

Para homologação, use credenciais e certificado próprios do Sandbox e altere:

```env
INTER_API_BASE_URL=https://cdpj-sandbox.partners.uatinter.co/cobranca/v3
INTER_OAUTH_URL=https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token
```

Não reutilize o certificado de produção no Sandbox.
