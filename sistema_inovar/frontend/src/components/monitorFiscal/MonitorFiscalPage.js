import React, { useEffect, useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import { chipClass, chipOff, chipOn } from '../centralShared';
import { API } from './shared';
import VisaoGeral from './VisaoGeral';
import Documentos from './Documentos';
import EmpresasMonitoramento from './EmpresasMonitoramento';
import Certificados from './Certificados';
import Importacao from './Importacao';
import AlertasAuditoria from './AlertasAuditoria';
import Relatorios from './Relatorios';

const ABAS = [
    { chave: 'visao', titulo: 'Visão geral', permissao: 'view_documentofiscal' },
    { chave: 'documentos', titulo: 'Documentos fiscais', permissao: 'view_documentofiscal' },
    { chave: 'manifestacoes', titulo: 'Manifestações', permissao: 'view_documentofiscal' },
    { chave: 'empresas', titulo: 'Monitoramento de empresas', permissao: 'view_documentofiscal' },
    { chave: 'certificados', titulo: 'Certificados', permissao: 'gerenciar_certificados' },
    { chave: 'importacao', titulo: 'Importação', permissao: 'importar_xml' },
    { chave: 'auditoria', titulo: 'Alertas e auditoria', permissao: 'view_documentofiscal' },
    { chave: 'relatorios', titulo: 'Relatórios', permissao: 'consultar_relatorios' },
];

const MonitorFiscalPage = () => {
    const [permissoes, setPermissoes] = useState(null);
    const [integracoes, setIntegracoes] = useState([]);
    const [aba, setAba] = useState('visao');
    const [erro, setErro] = useState('');

    useEffect(() => {
        axiosInstance.get(`${API}/permissoes/`)
            .then(({ data }) => {
                setPermissoes(data.permissoes || []);
                setIntegracoes(data.integracoes || []);
            })
            .catch(() => setErro('Não foi possível carregar as permissões do Monitor Fiscal.'));
    }, []);

    if (erro) return <p className="p-8 text-center text-sm text-rose-600">{erro}</p>;
    if (!permissoes) return <p className="p-8 text-center text-sm text-gray-500">Carregando...</p>;

    const pode = (codigo) => permissoes.includes(codigo);
    const abas = ABAS.filter((item) => pode(item.permissao));

    return (
        <div className="space-y-6 p-6 md:p-8">
            <header>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Monitor Fiscal</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Captura direta nos serviços oficiais (Ambiente Nacional NF-e/CT-e, MDF-e e ADN da NFS-e), central de
                    documentos, manifestação do destinatário e auditoria inicial.
                </p>
            </header>
            <nav className="flex flex-wrap gap-2">
                {abas.map((item) => (
                    <button key={item.chave} type="button" onClick={() => setAba(item.chave)}
                        className={`${chipClass} ${aba === item.chave ? chipOn : chipOff}`}>
                        {item.titulo}
                    </button>
                ))}
            </nav>
            {aba === 'visao' && <VisaoGeral integracoes={integracoes} pode={pode} />}
            {aba === 'documentos' && <Documentos pode={pode} />}
            {aba === 'manifestacoes' && <Documentos pode={pode} modoManifestacao />}
            {aba === 'empresas' && <EmpresasMonitoramento pode={pode} />}
            {aba === 'certificados' && <Certificados />}
            {aba === 'importacao' && <Importacao />}
            {aba === 'auditoria' && <AlertasAuditoria pode={pode} />}
            {aba === 'relatorios' && <Relatorios />}
        </div>
    );
};

export default MonitorFiscalPage;
