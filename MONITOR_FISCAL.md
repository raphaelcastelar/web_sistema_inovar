# Monitor Fiscal — documentação técnica

Módulo de captura, central e auditoria de documentos fiscais eletrônicos da INOVAR, integrado
**diretamente** aos serviços oficiais (sem intermediários comerciais).

- Backend: app Django `sistema_inovar/monitor_fiscal/` (rotas em `/api/monitor-fiscal/`).
- Frontend: `frontend/src/components/monitorFiscal/` (rota `/monitor-fiscal`, menu **Fiscal → Monitor Fiscal**).
- Agendamento: `deploy/systemd/sistema-inovar-monitor-fiscal*.{service,timer}`.

---

## 1. Situação das integrações

> Nenhuma integração foi validada em homologação ou produção até o momento. Todas foram testadas
> somente com respostas representativas montadas conforme os leiautes oficiais. **Não considerar
> nenhuma delas funcional em produção antes do procedimento da seção 7.**

| Integração | Implementada | Testes automatizados | Homologação | Produção |
|---|---|---|---|---|
| NF-e — NFeDistribuicaoDFe (distNSU, consNSU, consChNFe) | Sim | Sim | Não validada | Não validada |
| Manifestação do destinatário — NFeRecepcaoEvento4 (AN) | Sim | Sim | Não validada | Não validada |
| CT-e — CTeDistribuicaoDFe (distNSU, consNSU) | Sim | Sim | Não validada | Não validada |
| NFS-e — ADN API de Contribuintes (GET /DFe/{NSU}) | Sim, com pendências de confirmação (3.4) | Sim | Não validada | Não validada |
| MDF-e — MDFeDistribuicaoDFe | Sim (opcional, desligado por padrão) | Parcial (montagem/parsing) | Não validada | Não validada |
| Importação manual (XML/ZIP) | Sim | Sim | n/a | n/a |

---

## 2. Diagnóstico da estrutura existente

**Reutilizado**

- `empresas.Empresa` (CNPJ, razão social, nome, UF, cidade, regime) — o Monitor cria uma
  `ConfiguracaoMonitorFiscal` 1:1 por empresa/estabelecimento.
- Usuários (`Funcionario`, campo `cargo`) e isolamento por `empresas_gerenciadas`.
- Controle de páginas (`PaginaSistema` / `PAGE_CATALOG`): nova página `monitor_fiscal`, seção Fiscal.
- Notificações (`empresas.Notificacao`) para alertas relevantes.
- Gerador de XLSX já existente (`empresas.views._build_xlsx_file`) para relatórios.
- `reportlab` (já instalado) para o PDF auxiliar; `react-dropzone`, `chart.js` e estilos de
  `centralShared.js` no frontend.
- Padrão de agendamento por systemd timer (mesmo modelo do backup).

**Não existia e foi desenvolvido**

- Armazenamento de certificados digitais por empresa (o projeto só tinha o certificado SERPRO
  global em arquivo). Agora: PFX e senha cifrados (Fernet) no banco.
- Comunicação SOAP/mTLS com SEFAZ, assinatura XMLDSig, parsers de leiautes fiscais.
- Central de documentos com deduplicação, eventos, manifestação, alertas, auditoria e relatórios.

**Observação:** o modelo antigo `empresas.XML` (arquivos XML soltos nas pastas) continua intacto;
o Monitor Fiscal não depende dele nem o altera.

---

## 3. Serviços governamentais e endpoints confirmados

Endereços em `monitor_fiscal/constantes.py` (podem ser sobrescritos por `MONITOR_FISCAL_ENDPOINTS`).
Fontes consultadas em 24/11/2026.

### 3.1 NF-e — NFeDistribuicaoDFe (Ambiente Nacional)

- Produção: `https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`
- Homologação: `https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`
- Fonte: relação de Web Services do AN publicada pela SEFAZ-SP; leiaute no MOC
  (`moc.sped.fazenda.pr.gov.br/NFe_NFCe/NFeDistribuicaoDFe.html`, atualizado até NT 2026.008).
- SOAP 1.2, método `nfeDistDFeInteresse`, `distDFeInt` versão 1.01, retorno `retDistDFeInt`
  com `docZip` (gzip + base64), máximo de 50 documentos por lote.
- **Regras implementadas:** autenticação pelo CNPJ base do certificado (rejeição 593); NSU com
  15 posições; espera mínima de 1 hora quando `ultNSU == maxNSU` ou cStat 137; consumo indevido
  (656) bloqueia a fonte; lacunas de NSU são registradas para recuperação via `consNSU`.
- **Restrições de captura (MOC):** documentos disponíveis por até 3 meses (90 dias para
  `consChNFe`); NF-e emitidas pela própria empresa **não** são distribuídas; o destinatário recebe
  apenas o resumo até manifestar Ciência/Confirmação/Operação não Realizada; transportador só se
  identificado no grupo X03; terceiros só se informados em `autXML`.
- **Não confirmado:** os limites numéricos de consultas pontuais da revisão vigente da NT 2014.002
  (citada como v1.40). O limite de 20 consultas pontuais/hora por empresa é um valor conservador
  configurável (`MONITOR_FISCAL_CONSULTAS_PONTUAIS_POR_HORA`), não um valor oficial. O tempo de
  bloqueio após 656 também é configurável (padrão 60 min). Conferir na NT antes da produção.

### 3.2 Manifestação do destinatário — NFeRecepcaoEvento4 (AN, cOrgao 91)

- Produção: `https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx`
- Homologação: `https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx`
- Leiaute: MOC, Recepção de Evento — Parte Geral e Manifestação do Destinatário.
- Eventos 210210, 210200, 210220, 210240; `envEvento` 1.00; `verEvento` 1.00;
  `Id = "ID" + tpEvento + chave + nSeqEvento(2)`; assinatura enveloped RSA-SHA1/C14N 1.0 sobre
  `infEvento`.
- Validações locais antes de transmitir: chave (DV, modelo 55), legitimidade (empresa é a
  destinatária), justificativa de 15–255 caracteres para 210240 (rejeição 595), nSeqEvento ≤ 2
  (594), prazo de 6 meses (596), Ciência/Desconhecimento para NF-e cancelada (650/651), Ciência após
  manifestação conclusiva (655), duplicidade local, certificado vigente e compatível.
- Sucesso **somente** com lote cStat 128 e evento cStat 135/136 — HTTP 200 não basta.
- **Não confirmado:** o nome exato do elemento de resposta do WSDL v4 (o parser localiza
  `retEnvEvento` em qualquer posição do envelope).

### 3.3 CT-e — CTeDistribuicaoDFe

- Produção: `https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx`
  (Portal Nacional do CT-e, “Relação de Serviços Web”).
- Homologação: `https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx`
  (Portal de Homologação do CT-e, “Relação de Serviços Web”, conferido em 26/11/2026).
- Método `cteDistDFeInteresse`, `distDFeInt` versão 1.00; somente `distNSU` e `consNSU`;
  consumo indevido = 656; disponibilidade de 3 meses; CT-e emitidos pela própria empresa não são
  distribuídos; para terceiros (`autXML`) as chaves relacionadas vêm mascaradas com 44 noves.

### 3.4 NFS-e — ADN, API de Contribuintes

- Produção: `https://adn.nfse.gov.br/contribuintes` · Produção restrita:
  `https://adn.producaorestrita.nfse.gov.br/contribuintes`
- Fonte: Manual dos Contribuintes — APIs do ADN v1.0 (12/02/2026): `GET /DFe/{NSU}` e
  `GET /NFSe/{ChaveAcesso}/Eventos`; consulta permitida com certificado de mesmo CNPJ raiz e
  parâmetro para informar CNPJ consultado diferente do certificado.
- **Pendências de confirmação (o Swagger exige certificado cliente já no handshake TLS e não pôde
  ser lido daqui):**
  - nome do parâmetro do CNPJ consultado (adotado `cnpjConsulta`) e do parâmetro de lote
    (adotado `lote=true`) — ajustáveis por `MONITOR_FISCAL_ADN_PARAM_CNPJ` / `_LOTE`;
  - nomes dos campos JSON (adotados `StatusProcessamento`, `LoteDFe[].NSU`, `ChaveAcesso`,
    `TipoDocumento`, `ArquivoXml` gzip+base64) — o parser aceita PascalCase e camelCase;
  - se o NSU do caminho é inclusivo ou exclusivo — tratado de forma idempotente (NSUs já
    recebidos são ignorados);
  - regras de limite de consumo do ADN — adotado o mesmo intervalo de 1 hora sem documentos e
    bloqueio em HTTP 429, **sem base oficial confirmada**.
- **Cobertura:** o ADN só contém notas de municípios integrados ao padrão nacional, a partir da
  data de adesão. Não há conectores municipais nesta etapa.
- Consulta pontual por NSU no ADN não foi implementada (não confirmada na documentação lida).

### 3.5 MDF-e — MDFeDistribuicaoDFe (avaliação)

- Produção: `https://mdfe.svrs.rs.gov.br/WS/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx`
- Homologação: `https://mdfe-homologacao.svrs.rs.gov.br/WS/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx`
- Fonte: MOC MDF-e (NT 2015.002 v1.03). SOAP 1.2 com `mdfeCabecMsg` (cUF, versaoDados),
  documentos por até 6 meses, consumo indevido = **678**, NSU superior = 493.
- **Conclusão da avaliação:** viável com a infraestrutura oficial, mas o serviço só distribui a
  autorizados no XML, contratantes e proprietários de veículos (RNTRC diferente do emitente) — não é
  útil para a maioria das empresas. Implementado e **desligado por padrão** (`monitorar_mdfe`).

---

## 4. Arquitetura

```
fonte (AN NF-e | AN CT-e | ADN NFS-e | MDF-e | importação | futuras)
        │
        ▼
clientes/ (SOAP 1.2 / REST, mTLS)  ──►  sincronizacao.py (NSU, travas, limites, bloqueios)
                                                 │
                                                 ▼
                                   processador.py  (único para todas as fontes)
                                   ├─ RecebimentoDFe (conteúdo bruto + origem + NSU)
                                   ├─ parsers.py (identificação dinâmica do leiaute)
                                   ├─ DocumentoFiscal (+ itens) — deduplicação
                                   └─ EventoFiscal — vínculo e efeitos (cancelamento etc.)
```

Pontos centrais:

- **Identidade fiscal:** `empresa + tipo + chave + ambiente` (único). Número da nota nunca é usado
  como identificador. Produção e homologação nunca se misturam (documento de ambiente divergente é
  rejeitado e preservado em `RecebimentoDFe`).
- **Resumo × completo:** resumo cria o documento com XML “resumo”; o completo atualiza o mesmo
  registro; um resumo nunca substitui um XML completo.
- **Eventos antes da nota:** ficam órfãos e são vinculados (com efeitos reaplicados) quando a nota
  chega. Carta de correção permanece como evento; o XML original não é alterado.
- **NSU seguro:** o NSU só avança na mesma transação que grava os documentos do lote. Falha de
  banco no meio do lote desfaz tudo e o NSU fica onde estava. `RecebimentoDFe` tem restrição única
  `(empresa, fonte, ambiente, nsu)` — reprocessar o mesmo NSU é idempotente.
- **Concorrência:** trava por controle com expiração (`executando_desde` + token), renovada a cada
  lote; se o processo cair, outra rodada assume após `MONITOR_FISCAL_TRAVA_EXECUCAO_MIN`.
  Empresas diferentes rodam em paralelo (`MONITOR_FISCAL_EXECUCOES_PARALELAS`).
- **Troca de certificado** não reinicia NSU (a sequência pertence ao contribuinte).
- **Armazenamento dos XMLs:** em banco (PostgreSQL TOAST) para garantir atomicidade com o NSU.
  Hash SHA-256 de cada conteúdo recebido.

---

## 5. Segurança

- PFX e senha cifrados com Fernet (`MONITOR_FISCAL_CHAVE_CRIPTOGRAFIA`, obrigatória). Sem a chave,
  nenhum certificado é aceito. **Perder a chave torna os certificados irrecuperáveis** — guarde-a
  com o mesmo cuidado do `SECRET_KEY` e não a altere sem recadastrar os certificados.
- Para o mTLS a chave privada é exportada para arquivo temporário **cifrado com senha aleatória de
  uso único**, em diretório 0700, removido logo após a requisição.
- Senha/chave nunca aparecem em respostas de API, admin, logs ou auditoria (sanitização de chaves
  sensíveis em `auditoria_log.py`).
- XML: parser `lxml` sem DTD, sem entidades, sem rede (XXE/billion laughs rejeitados); limite de
  10 MB por documento. ZIP: limite de arquivos, tamanho total, tamanho por arquivo e taxa de
  compressão; somente `.xml` é processado; ZIPs aninhados não são expandidos.
- Isolamento: toda consulta filtra por `empresas_acessiveis(usuario)`; documento de outra empresa
  retorna 404.
- Permissões (Django, app `monitor_fiscal`): `view_documentofiscal`, `baixar_documentos`,
  `importar_xml`, `consultar_relatorios`, `visualizar_tributos`, `realizar_manifestacao`,
  `configurar_ciencia_automatica`, `gerenciar_certificados`, `ativar_monitoramento`,
  `solicitar_sincronizacao`, `gerenciar_alertas`, `acessar_logs`, `configurar_integracoes`.
  Administradores têm todas. Padrões por cargo: **fiscal** (visualizar, baixar, importar,
  relatórios, tributos, sincronizar, alertas) e **contábil** (idem, sem sincronizar). As
  permissões sensíveis exigem concessão explícita no admin do Django.
- Trilha de auditoria (`RegistroAuditoria`): upload/desativação de certificado, configuração,
  sincronização manual/lote, consulta pontual, manifestação, download, exportação, importação,
  conferência e tratamento de ocorrências.

---

## 6. Configuração e implantação

Variáveis no `.env` do servidor:

```
# Ambiente fiscal da SEFAZ que a instalação usa (1 = produção, 2 = homologação).
# Instalação de homologação do sistema: AMBIENTE_PADRAO=2 e AMBIENTES_PERMITIDOS=2.
# Produção: AMBIENTE_PADRAO=1 e AMBIENTES_PERMITIDOS=1 (ou 1,2 para permitir testes).
MONITOR_FISCAL_AMBIENTE_PADRAO=1
MONITOR_FISCAL_AMBIENTES_PERMITIDOS=1,2
MONITOR_FISCAL_CHAVE_CRIPTOGRAFIA=<gerar com: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
# Opcional: cadeia de ACs em PEM caso o bundle padrão não valide os servidores governamentais
MONITOR_FISCAL_CA_BUNDLE=/opt/apps/web_sistema_inovar/chaves/cadeia-icp-brasil.pem
# Opcionais (padrões entre parênteses)
MONITOR_FISCAL_TIMEOUT=60
MONITOR_FISCAL_INTERVALO_SEM_DOCUMENTOS_MIN=60
MONITOR_FISCAL_BLOQUEIO_CONSUMO_INDEVIDO_MIN=60
MONITOR_FISCAL_MAX_LOTES_POR_EXECUCAO=20
MONITOR_FISCAL_CONSULTAS_PONTUAIS_POR_HORA=20
MONITOR_FISCAL_TRAVA_EXECUCAO_MIN=15
MONITOR_FISCAL_EXECUCOES_PARALELAS=4
MONITOR_FISCAL_CTE_DISTRIBUICAO_HOMOLOGACAO=
MONITOR_FISCAL_ADN_PARAM_CNPJ=cnpjConsulta
MONITOR_FISCAL_ADN_PARAM_LOTE=lote
```

`MONITOR_FISCAL_AMBIENTES_PERMITIDOS` restringe toda comunicação com a SEFAZ/ADN (sincronização,
consulta pontual e manifestação) e as opções de configuração. A visualização de documentos não é
restrita: XMLs reais importados manualmente (tpAmb=1) continuam acessíveis pelo filtro “Produção”.

Atenção: `sistema_inovar/settings.py` está no `.gitignore` mas é rastreado pelo git; as novas
configurações foram adicionadas a ele e precisam chegar ao servidor.

Implantação:

```bash
source .venv/bin/activate
pip install -r requirements.txt          # novas: cryptography, lxml
python manage.py migrate monitor_fiscal
sudo cp ../deploy/systemd/sistema-inovar-monitor-fiscal*.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sistema-inovar-monitor-fiscal.timer sistema-inovar-monitor-fiscal-rotinas.timer
```

- `monitor_fiscal_sincronizar` roda a cada 10 min, mas cada empresa/fonte só é consultada quando
  permitido (intervalo obrigatório, bloqueio, trava). Parâmetros: `--empresa`, `--fonte`,
  `--paralelas`.
- `monitor_fiscal_rotinas` roda diariamente às 06:30: alertas de certificado (30/15/7/1 dias,
  configurável por empresa), manifestações pendentes e auditoria.
- A página aparece em **Gerenciar páginas** como “Monitor Fiscal” (seção Fiscal).

---

## 7. Procedimento de validação com serviços reais

Usar uma empresa com certificado A1 próprio (mesmo CNPJ raiz). Começar em **homologação**.

1. Cadastrar o certificado (aba Certificados) e vincular à empresa. Conferir alertas de validação.
2. Configurar a empresa: ambiente **Homologação**, código IBGE da UF (cUFAutor), monitorar NF-e.
3. Sincronizar manualmente. Esperado: cStat 137 ou 138. Registrar cStat/xMotivo no histórico.
   - Erro TLS: configurar `MONITOR_FISCAL_CA_BUNDLE` com a cadeia ICP-Brasil/servidor.
   - cStat 593: certificado de outro CNPJ raiz.
4. Repetir a sincronização: deve ser recusada localmente pelo intervalo de 1 hora (sem requisição).
5. Se houver resumo de NF-e em homologação, transmitir Ciência e conferir cStat 135/136 e
   protocolo; na sincronização seguinte (após 1 h) o XML completo deve substituir o resumo.
6. NFS-e: em produção restrita, abrir o Swagger com o certificado instalado no navegador e conferir
   parâmetros e campos (seção 3.4). Ajustar `MONITOR_FISCAL_ADN_PARAM_*` se necessário e sincronizar.
8. Registrar o resultado e só então atualizar `situacao_integracoes()` em `monitor_fiscal/views.py`
   (exibida na Visão geral) para “validada em homologação”. Repetir em produção com uma empresa piloto.

---

## 8. Testes automatizados

```bash
cd sistema_inovar
python manage.py test monitor_fiscal --settings=sistema_inovar.test_settings
```

61 testes, com respostas representativas montadas conforme os leiautes oficiais e um certificado
de teste gerado na hora (`monitor_fiscal/tests/utils.py`). Mapeamento dos cenários obrigatórios:

| Cenários | Teste |
|---|---|
| 1–4 certificado válido, senha incorreta, vencido, incompatível | `test_certificados_seguranca.CertificadoTests`, `test_sincronizacao_nfe` (`test_certificado_incompativel_impede_consulta`, `test_rejeicao_593_marca_certificado`) |
| 5–8 primeira sincronização, NSU existente, múltiplos lotes, sem documentos | `test_primeira_sincronizacao_monta_requisicao_oficial`, `test_multiplos_lotes_e_nsu_existente`, `test_consulta_sem_documentos_respeita_uma_hora` |
| 9–10 consumo indevido e tentativa durante bloqueio | `test_consumo_indevido_bloqueia_e_impede_nova_tentativa` |
| 11–12 resumo e XML completo | `test_resumo_e_depois_xml_completo_sem_duplicar`, `test_resumo_nao_substitui_xml_completo` |
| 13–15 ciência, rejeição, duplicidade | `test_manifestacao.*` |
| 16–18 cancelada, evento antes da nota, repetição | `test_nota_cancelada_e_evento_antes_da_nota`, `test_recebimento_repetido_e_idempotente` |
| 19–23 falha de persistência, comunicação, reinício, concorrência, empresas simultâneas | `test_falha_na_persistencia_nao_avanca_nsu`, `test_falha_de_comunicacao_preserva_nsu_e_agenda_retentativa`, `test_reinicializacao_durante_sincronizacao`, `test_sincronizacao_concorrente_da_mesma_empresa`, `test_empresas_diferentes_sincronizam_independentemente` |
| 24–28 NFS-e prestada/tomada/intermediário, cancelamento, substituição | `test_nfse_cte.NFSeTests` |
| 29 CT-e | `test_nfse_cte.CTeTests` |
| 30–33 importação XML/ZIP, malformado, malicioso | `test_importacao_api.ImportacaoTests`, `SegurancaXMLTests` |
| 34–36 download, exportação, empresa não autorizada | `test_importacao_api.ApiTests` |
| 37 certificado substituído | `test_certificado_substituido_preserva_nsu` |
| 38 indisponibilidade | `test_servico_paralisado`, `test_falha_de_comunicacao_...` |
| 39 produção × homologação | `test_separacao_producao_homologacao` |
| 40 município sem cobertura no ADN | `test_municipio_sem_documentos_no_adn` |
| 41 diferentes fontes | `test_documento_recebido_por_diferentes_fontes` |
| 42 cancelada fora da movimentação | `test_nota_cancelada_nao_conta_como_movimentacao` |

---

## 9. Limitações conhecidas e pendências

- **Nenhuma validação real ainda** (seção 7).
- **XSD:** os schemas oficiais não estão embarcados; a validação atual é estrutural (leiaute,
  chave com DV, protocolo, ambiente). Próximo passo: incluir os pacotes de schemas vigentes e
  validar com `lxml.etree.XMLSchema`.
- **PDF auxiliar:** representação simplificada, identificada no próprio PDF; **não** segue o
  leiaute oficial do DANFE/DACTE/DANFSE.
- **CFOP:** validada a estrutura (1º dígito 1/2/3/5/6/7), não a tabela completa vigente.
- **Classificação de NF-e** quando a empresa é emitente vem apenas de importação manual (o AN não
  distribui notas emitidas pela própria empresa).
- **Ciência automática** registra a manifestação e aguarda a liberação do XML pela distribuição
  (próxima consulta permitida); não usa `consChNFe` para isso.
- **Outro sistema consultando o mesmo CNPJ** consome a mesma sequência; o sistema registra
  inconsistência quando recebe rejeição de NSU superior (589/493), mas não detecta todos os casos.
- **Procuração eletrônica:** não implementada (não confirmada para os serviços de distribuição).
- Fora do escopo desta etapa (estrutura preparada via campo `fontes`/`FONTE_CHOICES`): coletor
  local, pastas, ERP, e-mail, prefeituras, emissão, apuração.
