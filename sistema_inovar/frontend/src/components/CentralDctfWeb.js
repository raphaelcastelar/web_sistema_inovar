import React from 'react';
import {
    BanknotesIcon,
    DocumentArrowDownIcon,
    DocumentTextIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import CentralDocumentosPage from './CentralDocumentosPage';

const dctfwebRequest = (codigo) => ({ cnpj, periodo }) => axiosInstance.post(
    `/api/serpro/dctfweb/${codigo}/`,
    { cnpj, periodo },
    { responseType: 'blob' },
);

const services = [
    {
        key: 'GERARGUIA31',
        label: 'Gerar Guia',
        icon: BanknotesIcon,
        tone: 'emerald',
        errorMessage: 'Erro ao gerar a guia da declaração DCTFWeb.',
        request: dctfwebRequest('GERARGUIA31'),
        filename: ({ periodo }) => `DCTFWeb_GERARGUIA31_${periodo}.pdf`,
    },
    {
        key: 'CONSRECIBO32',
        label: 'Recibo',
        icon: DocumentArrowDownIcon,
        tone: 'slate',
        errorMessage: 'Erro ao consultar o recibo da declaração DCTFWeb.',
        request: dctfwebRequest('CONSRECIBO32'),
        filename: ({ periodo }) => `DCTFWeb_CONSRECIBO32_${periodo}.pdf`,
    },
    {
        key: 'CONSDECCOMPLETA33',
        label: 'Declaração Completa',
        icon: DocumentTextIcon,
        tone: 'amber',
        errorMessage: 'Erro ao consultar a declaração completa DCTFWeb.',
        request: dctfwebRequest('CONSDECCOMPLETA33'),
        filename: ({ periodo }) => `DCTFWeb_CONSDECCOMPLETA33_${periodo}.pdf`,
    },
];

const extraFilters = [
    {
        key: 'ocultarMei',
        label: 'Ocultar MEI',
        description: 'MEI não transmite DCTFWeb; use este filtro para reduzir a lista.',
        predicate: (empresa) => empresa.porte_empresa !== 'MEI',
    },
];

const CentralDctfWeb = () => (
    <CentralDocumentosPage
        eyebrow="Fiscal"
        titulo="Central DCTFWeb"
        descricao="Consulte e gere as guias, recibos e declarações DCTFWeb por empresa e competência."
        storageKey="centralDctfWebFiltros"
        periodoLabel="Competência"
        observacao="Será utilizada automaticamente a declaração mais recente da competência selecionada acima."
        services={services}
        extraFilters={extraFilters}
    />
);

export default CentralDctfWeb;
