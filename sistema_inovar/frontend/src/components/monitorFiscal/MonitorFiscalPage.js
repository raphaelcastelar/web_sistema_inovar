import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowUpTrayIcon, BeakerIcon, BellAlertIcon, BuildingOffice2Icon, ChartBarIcon, DocumentTextIcon,
    HandRaisedIcon, KeyIcon, ShieldCheckIcon, TableCellsIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../../api/axiosInstance';
import { chipClass, chipOff, chipOn } from '../centralShared';
import { API, Carregando, NOME_AMBIENTE, Observacao } from './shared';
import VisaoGeral from './VisaoGeral';
import Documentos from './Documentos';
import EmpresasMonitoramento from './EmpresasMonitoramento';
import Certificados from './Certificados';
import Importacao from './Importacao';
import AlertasAuditoria from './AlertasAuditoria';
import Relatorios from './Relatorios';

const ABAS = [
    { chave: 'visao', titulo: 'Visão geral', icone: ChartBarIcon, permissao: 'view_documentofiscal' },
    { chave: 'documentos', titulo: 'Documentos fiscais', icone: DocumentTextIcon, permissao: 'view_documentofiscal' },
    { chave: 'manifestacoes', titulo: 'Manifestações', icone: HandRaisedIcon, permissao: 'view_documentofiscal' },
    { chave: 'empresas', titulo: 'Empresas monitoradas', icone: BuildingOffice2Icon, permissao: 'view_documentofiscal' },
    { chave: 'certificados', titulo: 'Certificados', icone: KeyIcon, permissao: 'gerenciar_certificados' },
    { chave: 'importacao', titulo: 'Importação', icone: ArrowUpTrayIcon, permissao: 'importar_xml' },
    { chave: 'auditoria', titulo: 'Alertas e auditoria', icone: BellAlertIcon, permissao: 'view_documentofiscal' },
    { chave: 'relatorios', titulo: 'Relatórios', icone: TableCellsIcon, permissao: 'consultar_relatorios' },
];

const ARMAZENAMENTO_ABA = 'monitorFiscalAba';

const lerAba = () => {
    try { return window.localStorage.getItem(ARMAZENAMENTO_ABA) || 'visao'; } catch { return 'visao'; }
};

const MonitorFiscalPage = () => {
    const [contexto, setContexto] = useState(null);
    const [aba, setAba] = useState(lerAba);
    const [erro, setErro] = useState('');

    useEffect(() => {
        axiosInstance.get(`${API}/permissoes/`)
            .then(({ data }) => setContexto(data))
            .catch(() => setErro('Não foi possível carregar as permissões do Monitor Fiscal.'));
    }, []);

    useEffect(() => {
        try { window.localStorage.setItem(ARMAZENAMENTO_ABA, aba); } catch { /* preferência só da sessão */ }
    }, [aba]);

    const permissoes = useMemo(() => contexto?.permissoes || [], [contexto]);
    const pode = useCallback((codigo) => permissoes.includes(codigo), [permissoes]);
    const abas = ABAS.filter((item) => pode(item.permissao));
    const abaAtual = abas.some((item) => item.chave === aba) ? aba : abas[0]?.chave;
    const ambiente = contexto?.ambiente_padrao || 1;
    const somenteHomologacao = (contexto?.ambientes_permitidos || []).length === 1 && contexto?.ambientes_permitidos[0] === 2;
    const props = { pode, ambiente, ambientesPermitidos: contexto?.ambientes_permitidos || [1, 2] };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Fiscal</p>
                    <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Monitor Fiscal</h1>
                    <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                        Captura de NF-e, NFS-e e CT-e direto nos serviços oficiais, central de documentos, manifestação do destinatário e auditoria.
                    </p>
                </div>
                {contexto && (
                    <span className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-semibold ring-1 xl:self-auto ${ambiente === 2
                        ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900'}`}>
                        {ambiente === 2 ? <BeakerIcon className="h-4 w-4" /> : <ShieldCheckIcon className="h-4 w-4" />}
                        SEFAZ: {NOME_AMBIENTE[ambiente]}
                    </span>
                )}
            </div>

            {erro && <Observacao tom="vermelho">{erro}</Observacao>}
            {!contexto && !erro && <Carregando texto="Carregando Monitor Fiscal..." />}

            {contexto && (
                <>
                    {somenteHomologacao && (
                        <Observacao tom="ambar">
                            Esta instalação consulta somente o <strong>ambiente de homologação da SEFAZ</strong>: as respostas são de teste e
                            não têm valor fiscal. XMLs reais importados manualmente aparecem selecionando o ambiente “Produção” nos filtros.
                        </Observacao>
                    )}
                    <nav className="flex flex-wrap gap-2" aria-label="Seções do Monitor Fiscal">
                        {abas.map((item) => {
                            const Icone = item.icone;
                            return (
                                <button key={item.chave} type="button" onClick={() => setAba(item.chave)}
                                    className={`${chipClass} ${abaAtual === item.chave ? chipOn : chipOff}`}>
                                    <Icone className="h-4 w-4" />
                                    {item.titulo}
                                </button>
                            );
                        })}
                    </nav>
                    {abaAtual === 'visao' && <VisaoGeral integracoes={contexto.integracoes || []} {...props} />}
                    {abaAtual === 'documentos' && <Documentos {...props} />}
                    {abaAtual === 'manifestacoes' && <Documentos {...props} modoManifestacao />}
                    {abaAtual === 'empresas' && <EmpresasMonitoramento {...props} />}
                    {abaAtual === 'certificados' && <Certificados />}
                    {abaAtual === 'importacao' && <Importacao />}
                    {abaAtual === 'auditoria' && <AlertasAuditoria {...props} />}
                    {abaAtual === 'relatorios' && <Relatorios {...props} />}
                </>
            )}
        </motion.div>
    );
};

export default MonitorFiscalPage;
