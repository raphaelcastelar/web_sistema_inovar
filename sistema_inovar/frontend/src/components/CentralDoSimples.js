import React from 'react';
import {
    DocumentArrowDownIcon,
    DocumentChartBarIcon,
    DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import CentralDocumentosPage from './CentralDocumentosPage';

const services = [
    {
        key: 'das',
        label: 'Gerar DAS',
        icon: DocumentArrowDownIcon,
        tone: 'emerald',
        errorMessage: 'Erro ao gerar DAS.',
        request: ({ cnpj, periodo }) => axiosInstance.post(
            '/api/serpro/gerar-das/',
            { cnpj, periodo },
            { responseType: 'blob' },
        ),
        filename: ({ cnpjLimpo, periodo }) => `DAS_${cnpjLimpo}_${periodo}.pdf`,
    },
    {
        key: 'extrato',
        label: 'Extrato',
        icon: DocumentChartBarIcon,
        tone: 'slate',
        errorMessage: 'Erro ao baixar extrato.',
        request: ({ cnpj, periodo }) => axiosInstance.post(
            '/api/serpro/consultar-extrato/',
            { cnpj, periodo },
            { responseType: 'blob' },
        ),
        filename: ({ cnpjLimpo, periodo }) => `Extrato_Simples_${cnpjLimpo}_${periodo}.pdf`,
    },
    {
        key: 'declaracao',
        label: 'Declaração/Recibo',
        icon: DocumentDuplicateIcon,
        tone: 'amber',
        errorMessage: 'Erro ao consultar a declaração/recibo.',
        request: ({ cnpj, periodo }) => axiosInstance.post(
            '/api/serpro/consultar-declaracao-recibo/',
            { cnpj, periodo },
            { responseType: 'blob' },
        ),
        filename: ({ cnpjLimpo, periodo }) => `Declaracao_Recibo_${cnpjLimpo}_${periodo}.zip`,
    },
];

const extraFilters = [
    {
        key: 'somenteSimples',
        label: 'Somente Simples Nacional',
        description: 'Mostra apenas empresas marcadas como Simples Nacional no cadastro.',
        predicate: (empresa) => empresa.simples_nacional === true || empresa.regime_tributario === 'SIMPLES NACIONAL',
    },
    {
        key: 'somenteMonitoradas',
        label: 'Somente monitoradas',
        description: 'Mostra apenas empresas com monitoramento do Simples Nacional ativo.',
        predicate: (empresa) => empresa.monitorar_simples === true,
    },
];

const CentralDoSimples = () => (
    <CentralDocumentosPage
        eyebrow="Fiscal"
        titulo="Central DAS"
        descricao="Consulte e gere os documentos do Simples Nacional por empresa e competência."
        storageKey="centralDasFiltros"
        periodoLabel="Período de apuração"
        observacao="Os documentos são gerados para a competência selecionada acima, valendo para as ações individuais e em lote."
        services={services}
        extraFilters={extraFilters}
    />
);

export default CentralDoSimples;
