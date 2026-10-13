# Análise das tarefas automáticas do `gestor-de-processos`

Data da análise: 13/10/2026  
Projeto de origem: `/Users/selmajosecastelarferreira/Desktop/Projetos/gestor-de-processos`  
Projeto de destino: `/Users/selmajosecastelarferreira/Desktop/web_sistema_inovar`

## 1. Objetivo e contexto

Este documento registra as regras encontradas no projeto `gestor-de-processos` que relacionam o cadastro de uma empresa às obrigações e às tarefas criadas automaticamente.

O histórico local do Codex confirma que a conversa usada anteriormente para portar funcionalidades ocorreu em **21/09/2026**, com continuidade em **22/09/2026**. Naquela conversa, a tela de Tarefas do `gestor-de-processos` foi usada como referência para criar no Sistema Inovar:

- a rota `/tarefas`;
- busca, filtros e agrupamento por estado;
- visão individual e da equipe;
- criação e edição de atividades;
- conclusão, reabertura e recorrência de atividades manuais;
- integração com o modal e com os detalhes já usados em Início e Calendário.

O que foi portado naquela ocasião foi principalmente a experiência da tela e o domínio geral de atividades. O motor de obrigações automáticas por empresa, descrito neste documento, **não foi portado**.

## 2. Fontes analisadas

No `gestor-de-processos`:

- `server/planner/catalogo.js`: critérios de aplicação das obrigações;
- `shared/obrigacoes.json`: categoria, ordem, periodicidade e vencimento;
- `server/planner/sincronizador.js`: criação e reatribuição das tarefas automáticas;
- `server/planner/vencimentos.js`: cálculo de competência e prazo;
- `server/planner/modelo.js`: formato, validação e campos imutáveis;
- `server/planner/responsaveis.js`: responsáveis principais por departamento;
- `server/planner/*.test.js`: comportamento confirmado pelos testes;
- `client/src/obrigacoes.js`: regras equivalentes usadas na interface;
- `server/firebase/empresas.js`, `server/firebase/planner.js` e `server/firebase/sincronizador.js` da referência `origin/main`: acionamento do mesmo motor na versão Firebase.

A cópia local do projeto de origem está no commit `05e5c7a` e quatro commits atrás de `origin/main`, atualmente em `3f9fc66`. Os arquivos centrais de regras (`catalogo.js`, `sincronizador.js`, `vencimentos.js` e `obrigacoes.json`) são iguais nas duas referências. A versão remota acrescenta persistência e acionamento via Firebase, sem mudar as relações de obrigações.

No Sistema Inovar atual:

- `sistema_inovar/empresas/models.py`;
- `sistema_inovar/empresas/views.py`;
- `sistema_inovar/empresas/serializers.py`;
- `sistema_inovar/empresas/management/commands/criar_obrigacoes_mensais.py`;
- `sistema_inovar/frontend/src/components/TarefasPage.js`.

## 3. Resumo direto das regras

As regras são **cumulativas**. O sistema primeiro considera o regime tributário e depois soma obrigações conforme:

- prestação de serviço;
- existência de empregados;
- existência de sócios com pró-labore;
- recolhimento de INSS do pró-labore pelo SAL;
- empresa ativa ou paralisada.

Obrigações repetidas por mais de uma regra aparecem apenas uma vez.

### 3.1. Obrigações-base por regime tributário

| Cadastro da empresa | Obrigações selecionadas pelo catálogo | Tarefas automáticas efetivamente criadas |
|---|---|---|
| MEI | DASN-Mei | DASN-Mei |
| Simples Nacional | PG-DAS, Guia DAS, DEFIS, Escrituração Contábil e Balanço Anual | as mesmas cinco |
| Lucro Real | Escrituração Contábil e Balanço Trimestral | as mesmas duas |
| Lucro Presumido | nenhuma obrigação-base | nenhuma |
| Isento | nenhuma obrigação-base | nenhuma |
| Regime vazio ou diferente dos textos esperados | nenhuma obrigação-base | nenhuma |

O campo é comparado por texto exato. Portanto, `Simples Nacional`, `Lucro Real` e `MEI` precisam estar exatamente nesses formatos.

### 3.2. Regras adicionais por atividade e folha

| Condição no cadastro | Obrigações acrescentadas | Resultado como tarefa automática |
|---|---|---|
| `grupoAtividade` contém a palavra `Serviço` | NFS-e | **não cria tarefa**, pois NFS-e não possui vencimento configurado |
| `qtdProLabore > 0` e `inss20Sal = false` | Folha de Pagamento, E-Social, DCTF-WEB e Guia INSS | cria as quatro |
| `qtdProLabore > 0` e `inss20Sal = true` | INSS 20% (SAL) | cria somente essa tarefa por causa do pró-labore |
| `qtdEmpregados > 0` e empresa é MEI | Folha de Pagamento, E-Social, DCTF-WEB e Guia Unificada MEI | cria as quatro |
| `qtdEmpregados > 0` e empresa não é MEI | Folha de Pagamento, E-Social, DCTF-WEB, Guia INSS e Guia FGTS | cria as cinco |
| `ativa = false` | nenhuma nova obrigação | nenhuma nova tarefa |

Detalhes importantes:

- `inss20Sal` só produz efeito quando `qtdProLabore > 0`.
- O número exato de empregados ou sócios não muda a quantidade de tarefas. O teste é apenas maior que zero.
- `semMovimento`, faturamento, porte, natureza jurídica, UF, atividade específica, honorário e anexo do Simples não participam dessas regras.
- A detecção de serviço procura literalmente `Serviço` dentro de `grupoAtividade`.

## 4. Exemplos completos de combinações

As listas abaixo representam as tarefas que o sincronizador realmente cria, já excluindo NFS-e, que aparece como obrigação na interface mas não tem ocorrência automática.

### 4.1. Simples Nacional

**Somente Simples Nacional, sem empregados e sem pró-labore:**

1. PG-DAS
2. Guia DAS
3. DEFIS
4. Escrituração Contábil
5. Balanço Anual

**Simples Nacional com empregados:**

1. Folha de Pagamento
2. E-Social
3. DCTF-WEB
4. Guia INSS
5. Guia FGTS
6. PG-DAS
7. Guia DAS
8. DEFIS
9. Escrituração Contábil
10. Balanço Anual

**Simples Nacional somente com pró-labore, fora do SAL:**

1. Folha de Pagamento
2. E-Social
3. DCTF-WEB
4. Guia INSS
5. PG-DAS
6. Guia DAS
7. DEFIS
8. Escrituração Contábil
9. Balanço Anual

**Simples Nacional somente com pró-labore recolhido pelo SAL:**

1. INSS 20% (SAL)
2. PG-DAS
3. Guia DAS
4. DEFIS
5. Escrituração Contábil
6. Balanço Anual

**Simples Nacional com empregados e pró-labore pelo SAL:**

1. Folha de Pagamento
2. E-Social
3. DCTF-WEB
4. INSS 20% (SAL)
5. Guia INSS
6. Guia FGTS
7. PG-DAS
8. Guia DAS
9. DEFIS
10. Escrituração Contábil
11. Balanço Anual

Se qualquer um desses cadastros também prestar serviço, NFS-e é mostrada como obrigação aplicável, mas não entra na tela como tarefa automática porque não há prazo calculável no catálogo.

### 4.2. MEI

**MEI sem empregados e sem pró-labore:**

1. DASN-Mei

**MEI com empregados:**

1. Folha de Pagamento
2. E-Social
3. DCTF-WEB
4. Guia Unificada MEI
5. DASN-Mei

**MEI somente com pró-labore, fora do SAL:**

1. Folha de Pagamento
2. E-Social
3. DCTF-WEB
4. Guia INSS
5. DASN-Mei

**MEI somente com pró-labore pelo SAL:**

1. INSS 20% (SAL)
2. DASN-Mei

**MEI com empregados e pró-labore fora do SAL:**

1. Folha de Pagamento
2. E-Social
3. DCTF-WEB
4. Guia INSS
5. Guia Unificada MEI
6. DASN-Mei

Aqui existe uma possível ambiguidade de negócio: um comentário do código diz que “MEI com empregado não recebe Guia INSS nem Guia FGTS”, porém a combinação de regras adiciona **Guia INSS** quando o mesmo MEI também tem pró-labore fora do SAL. A Guia FGTS realmente não é adicionada para MEI. Antes de portar, é recomendável confirmar se Guia INSS + Guia Unificada MEI é a intenção contábil.

### 4.3. Lucro Real

**Lucro Real sem empregados e sem pró-labore:**

1. Escrituração Contábil
2. Balanço Trimestral

As regras de empregados e pró-labore são somadas da mesma forma mostrada no Simples Nacional. O que muda é apenas o conjunto-base: não existem PG-DAS, Guia DAS, DEFIS ou Balanço Anual.

### 4.4. Lucro Presumido e Isento

Esses dois regimes não possuem obrigações-base cadastradas.

- Sem empregados e sem pró-labore: nenhuma tarefa automática.
- Somente pró-labore fora do SAL: Folha de Pagamento, E-Social, DCTF-WEB e Guia INSS.
- Somente pró-labore pelo SAL: INSS 20% (SAL).
- Com empregados: Folha de Pagamento, E-Social, DCTF-WEB, Guia INSS e Guia FGTS.

Se prestarem serviço, NFS-e aparece na relação visual de obrigações, mas continua sem tarefa automática por não possuir vencimento configurado.

## 5. Catálogo de tarefas, departamentos e vencimentos

| Tarefa/obrigação | Departamento | Periodicidade | Prazo configurado |
|---|---|---|---|
| Folha de Pagamento | Pessoal | mensal | dia 5 |
| E-Social | Pessoal | mensal | dia 15 |
| DCTF-WEB | Pessoal | mensal | dia 15 |
| INSS 20% (SAL) | Pessoal | mensal | dia 15 |
| Guia INSS | Pessoal | mensal | dia 20 |
| Guia FGTS | Pessoal | mensal | dia 20 |
| Guia Unificada MEI | Pessoal | mensal | dia 20 |
| NFS-e | Fiscal | periódica | sem vencimento calculável; não vira tarefa automática |
| PG-DAS | Fiscal | mensal | dia 15 |
| Guia DAS | Fiscal | mensal | dia 20 |
| DEFIS | Fiscal | anual | 31 de março |
| DASN-Mei | Fiscal | anual | 31 de maio |
| Escrituração Contábil | Contábil | mensal | dia 30, limitado ao último dia do mês |
| Balanço Trimestral | Contábil | trimestral | dia 31 de janeiro, abril, julho ou outubro |
| Balanço Anual | Contábil | anual | 31 de maio |

Os prazos são datas fixas. O motor não consulta feriados nem antecipa ou posterga vencimentos para dias úteis.

## 6. Como competência e prazo são calculados

O cálculo usa a data civil do fuso `America/Sao_Paulo`.

### Mensais

- A tarefa é criada para o vencimento do mês civil atual.
- A competência é o mês imediatamente anterior.
- Exemplo em 13/10/2026: competência `09/2026`, com prazo em outubro.
- Mesmo que o dia do vencimento já tenha passado, o sincronizador ainda cria a ocorrência do mês atual. Ele só passa para a competência seguinte quando o mês civil muda.

### Trimestrais

- O sistema procura o próximo vencimento em janeiro, abril, julho ou outubro.
- A competência identifica o trimestre anterior ao mês de vencimento.
- Exemplo em 13/10/2026: Balanço Trimestral `3º trim/2026`, prazo `31/10/2026`.
- Se o vencimento do trimestre já passou, é calculado o próximo trimestre.

### Anuais

- O sistema usa o próximo vencimento anual que ainda não passou.
- A competência é o ano anterior ao ano do vencimento.
- Em 13/10/2026, DEFIS fica com competência `2026` e prazo `31/03/2027`; DASN-Mei e Balanço Anual ficam com competência `2026` e prazo `31/05/2027`.

## 7. Como a tarefa automática é criada

Cada ocorrência recebe:

- título igual ao nome da obrigação;
- tipo `tarefa`;
- origem `automatica`;
- estado inicial `a_fazer`;
- prioridade inicial `normal`;
- empresa;
- obrigação;
- competência;
- departamento;
- responsável, quando houver um principal válido;
- `dataPlanejada` igual ao prazo;
- chave única lógica no formato `empresaId::obrigacao::competencia`;
- autor `Sistema`.

A chave lógica torna a sincronização idempotente: executar o processo novamente para a mesma empresa, obrigação e competência não duplica a tarefa.

Uma tarefa automática permite alteração operacional de:

- responsável;
- data planejada;
- prioridade;
- estado;
- duração estimada.

Não permite alterar sua origem, empresa, obrigação, competência, prazo original, título, tipo, departamento, compartilhamento direto ou privacidade.

## 8. Responsável automático

Cada empresa pode ter um responsável principal por departamento:

- `pessoal`;
- `fiscal`;
- `contabil`.

A obrigação herda o responsável principal de seu departamento. O usuário precisa estar ativo e ser administrador ou pertencer ao departamento correspondente.

Se não houver responsável válido, a tarefa **é criada mesmo assim**, com responsável nulo, e entra no relatório administrativo de tarefas sem responsável.

Quando o responsável principal muda, tarefas automáticas ainda abertas podem ser reatribuídas. Tarefas concluídas e canceladas preservam o histórico. Uma substituição manual do responsável de uma tarefa aberta é mantida enquanto esse usuário continuar válido e vinculado à empresa.

## 9. Quando a sincronização acontece

Na versão Firebase de `origin/main`, a sincronização é acionada:

- imediatamente após criar uma empresa;
- imediatamente após editar uma empresa;
- após paralisar ou reativar uma empresa;
- após alterar responsáveis da empresa;
- ao listar atividades ou tarefas;
- ao atualizar a conclusão pela API legada de tarefas.

Não foi encontrado um cron específico para gerar essas ocorrências. A atualização acontece em resposta às operações acima.

Na versão local anterior, a sincronização também ocorre ao iniciar o servidor, ao listar atividades/tarefas e ao alterar usuários ou responsáveis. Criar ou editar uma empresa não chama diretamente a sincronização nessa versão, mas a próxima leitura das atividades faz isso.

## 10. Comportamento ao alterar o cadastro

O sincronizador é aditivo: cria o que estiver faltando e reatribui tarefas abertas quando necessário. Ele **não remove nem cancela** automaticamente ocorrências antigas que deixaram de ser aplicáveis.

Exemplos:

- mudar de Simples Nacional para Lucro Real cria as novas tarefas aplicáveis, mas as tarefas do Simples já existentes não são apagadas;
- zerar `qtdEmpregados` não cancela automaticamente Folha, E-Social, DCTF-WEB, Guia INSS ou Guia FGTS já criadas;
- marcar a empresa como inativa impede novas ocorrências, mas não remove as tarefas existentes;
- reativar volta a permitir a criação conforme o cadastro atual.

Esse comportamento preserva histórico, mas exige uma decisão explícita sobre o que fazer com tarefas abertas que se tornaram indevidas.

## 11. Diferença entre “obrigação aplicável” e “tarefa automática”

O frontend calcula e exibe a lista de obrigações aplicáveis usando as regras de cadastro. O backend só materializa uma tarefa quando a obrigação também possui uma especificação de vencimento.

Por isso:

- NFS-e aparece em cards, relatórios e agrupamentos de obrigações de empresas de serviço;
- NFS-e não gera atividade na tela de Tarefas;
- todas as outras obrigações atualmente catalogadas possuem vencimento e podem virar tarefas.

## 12. Situação atual no Sistema Inovar

O Sistema Inovar já possui:

- modelo `Atividade`;
- tela `/tarefas`;
- criação e edição de tarefas e compromissos;
- recorrência de tarefas manuais;
- responsáveis, privacidade, estados e blocos de execução.

Porém, o modelo atual de `Atividade` não possui os campos necessários para representar a ocorrência automática do projeto de origem, como:

- obrigação;
- competência;
- chave de ocorrência;
- responsável automático;
- distinção de regras imutáveis para origem automática.

Também faltam no cadastro atual da empresa equivalentes diretos a:

- `qtdEmpregados`;
- `qtdProLabore`;
- `inss20Sal`.

O Sistema Inovar possui os booleanos `inss`, `fgts`, `folha` e `honorario`, mas eles representam outro fluxo e não substituem automaticamente as quantidades usadas pelo motor do `gestor-de-processos`.

Existe ainda `ObrigacaoMensal`, separado de `Atividade`. Atualmente ele aceita somente o tipo `simples_nacional`. O comando `criar_obrigacoes_mensais`:

- cria uma obrigação de Simples Nacional para **todas** as empresas, apesar do comentário indicar que deveria filtrar empresas do Simples;
- não filtra apenas empresas ativas;
- não alimenta a tela nova de Tarefas;
- não implementa o catálogo e as combinações descritas neste documento.

Portanto, a presença da tela de Tarefas e de `ObrigacaoMensal` não significa que o motor automático já exista neste repositório.

## 13. Pontos que precisam de decisão antes de portar

1. Definir se as tarefas automáticas serão gravadas em `Atividade`, em `ObrigacaoMensal` ou se haverá integração entre os dois modelos. A tela atual lê `Atividade`.
2. Definir como obter quantidade de empregados e sócios com pró-labore no cadastro do Sistema Inovar.
3. Confirmar a combinação de MEI com empregado e pró-labore, que hoje pode gerar Guia INSS e Guia Unificada MEI ao mesmo tempo.
4. Definir um vencimento ou outro modelo de ocorrência para NFS-e.
5. Completar regras de Lucro Presumido e Isento, caso devam ter obrigações fiscais ou contábeis próprias.
6. Definir se mudança de regime, retirada de empregados ou paralisação deve cancelar tarefas abertas que ficaram obsoletas.
7. Definir tratamento de dias úteis e feriados.
8. Decidir se a competência mensal deve continuar no mês corrente mesmo após o vencimento ou avançar para a próxima ocorrência.
9. Mapear o responsável automático para a estrutura de usuários e permissões do Sistema Inovar.
10. Criar chave única de empresa + obrigação + competência para impedir duplicação.

## 14. Conclusão

O `gestor-de-processos` usa um motor simples e determinístico: regime tributário define uma base, empregados/pró-labore/serviço acrescentam itens, a empresa inativa deixa de receber novas ocorrências e cada obrigação com vencimento vira uma tarefa única por competência.

Para o exemplo principal: uma empresa apenas do **Simples Nacional** recebe automaticamente **PG-DAS, Guia DAS, DEFIS, Escrituração Contábil e Balanço Anual**. Empregados ou pró-labore acrescentam as tarefas de Departamento Pessoal conforme as combinações documentadas acima.

O motor pode ser adaptado ao Sistema Inovar, mas não deve ser copiado sem antes resolver as lacunas de Lucro Presumido/Isento, NFS-e, tarefas obsoletas e o caso combinado de MEI com empregado e pró-labore.
