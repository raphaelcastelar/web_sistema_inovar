import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';
import { DocumentArrowDownIcon, UsersIcon, ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

const GerarBoletoPage = () => {
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [boletoData, setBoletoData] = useState({
        numeroConvenio: 0,
        numeroCarteira: 0,
        numeroVariacaoCarteira: 0,
        codigoModalidade: 0,
        dataEmissao: new Date().toISOString().split('T')[0],
        dataVencimento: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        valorOriginal: 0.1,
        valorAbatimento: 0.1,
        quantidadeDiasProtesto: 0.1,
        quantidadeDiasNegativacao: 0,
        orgaoNegativador: 0,
        indicadorAceiteTituloVencido: 'N',
        numeroDiasLimiteRecebimento: 0,
        codigoAceite: 'N',
        codigoTipoTitulo: 0,
        descricaoTipoTitulo: '',
        indicadorPermissaoRecebimentoParcial: 'N',
        numeroTituloBeneficiario: '',
        campoUtilizacaoBeneficiario: '',
        numeroTituloCliente: '',
        mensagemBloquetoOcorrencia: '',
        desconto: {
            tipo: 0,
            dataExpiracao: '',
            porcentagem: 0.1,
            valor: 0.1
        },
        segundoDesconto: {
            dataExpiracao: '',
            porcentagem: 0.1,
            valor: 0.1
        },
        terceiroDesconto: {
            dataExpiracao: '',
            porcentagem: 0.1,
            valor: 0.1
        },
        jurosMora: {
            tipo: 0,
            porcentagem: 0.1,
            valor: 0.1
        },
        multa: {
            tipo: 0,
            data: '',
            porcentagem: 0.1,
            valor: 0.1
        },
        beneficiarioFinal: {
            tipoInscricao: 0,
            numeroInscricao: 0,
            nome: ''
        },
        indicadorPix: 'N'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        axiosInstance.get('/api/empresas/?all=true')
            .then(response => {
                setEmpresas(response.data);
            })
            .catch(err => {
                console.error("Erro ao buscar empresas:", err);
                setError("Não foi possível carregar a lista de empresas.");
            });
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setBoletoData(prev => ({ ...prev, [name]: value }));
    };

    const handleNestedInputChange = (e, field) => {
        const { name, value } = e.target;
        setBoletoData(prev => ({
            ...prev,
            [field]: { ...prev[field], [name]: value }
        }));
    };

    const handleGerarBoleto = async () => {
        if (!selectedEmpresaId) {
            setError("Selecione uma empresa.");
            return;
        }

        setLoading(true);
        setError('');
        setSuccessMessage('');

        const empresaSelecionada = empresas.find(e => e.id === parseInt(selectedEmpresaId));
        if (!empresaSelecionada) {
            setError("Empresa selecionada não encontrada.");
            setLoading(false);
            return;
        }

        // Preenche o pagador com dados da empresa
        const pagador = {
            tipoInscricao: 2,
            numeroInscricao: parseInt(empresaSelecionada.cnpj.replace(/\D/g, '')),
            nome: empresaSelecionada.nome,
            endereco: empresaSelecionada.endereco || "Endereço padrão",
            cep: parseInt(empresaSelecionada.cep || 0),
            cidade: empresaSelecionada.cidade || "Cidade",
            bairro: empresaSelecionada.bairro || "Bairro",
            uf: empresaSelecionada.uf || "SP",
            telefone: empresaSelecionada.telefone || "00000000000",
            email: empresaSelecionada.email || "email@exemplo.com"
        };

        const payload = { ...boletoData, pagador };

        try {
            const response = await axiosInstance.post('/api/gerar-boleto/', {
                empresa_id: selectedEmpresaId,
                boleto_data: payload
            }, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'boleto.pdf');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);

            setSuccessMessage('Boleto gerado e baixado com sucesso!');
        } catch (err) {
            console.error("Erro ao gerar boleto:", err);
            setError("Ocorreu um erro ao gerar o boleto.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 md:p-8">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-8">Gerar Boletos de Cobrança</h1>

            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="mb-6">
                    <label htmlFor="empresa-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Selecione a Empresa
                    </label>
                    <select
                        id="empresa-select"
                        value={selectedEmpresaId}
                        onChange={(e) => setSelectedEmpresaId(e.target.value)}
                        className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="">Selecione...</option>
                        {empresas.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.nome} ({emp.cnpj})</option>
                        ))}
                    </select>
                </div>

                {/* Formulário para os parâmetros do boleto */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label htmlFor="numeroConvenio" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Número do Convênio
                        </label>
                        <input
                            id="numeroConvenio"
                            name="numeroConvenio"
                            type="number"
                            value={boletoData.numeroConvenio}
                            onChange={handleInputChange}
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="numeroCarteira" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Número da Carteira
                        </label>
                        <input
                            id="numeroCarteira"
                            name="numeroCarteira"
                            type="number"
                            value={boletoData.numeroCarteira}
                            onChange={handleInputChange}
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    {/* Adicione os outros parâmetros de forma semelhante */}
                    {/* Exemplo para desconto */}
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Desconto
                        </label>
                        <input
                            name="tipo"
                            type="number"
                            value={boletoData.desconto.tipo}
                            onChange={(e) => handleNestedInputChange(e, 'desconto')}
                            placeholder="Tipo de Desconto"
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                        />
                        <input
                            name="dataExpiracao"
                            type="date"
                            value={boletoData.desconto.dataExpiracao}
                            onChange={(e) => handleNestedInputChange(e, 'desconto')}
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        {/* Adicione outros subparâmetros */}
                    </div>
                    {/* Continue adicionando os outros campos como valorOriginal, dataEmissao, etc. */}
                </div>

                <button
                    onClick={handleGerarBoleto}
                    disabled={loading || !selectedEmpresaId}
                    className="w-full p-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                    {loading ? 'Gerando...' : 'Gerar Boleto'}
                </button>

                {error && <p className="mt-4 text-red-500">{error}</p>}
                {successMessage && <p className="mt-4 text-green-500">{successMessage}</p>}
            </div>
        </div>
    );
};

export default GerarBoletoPage;