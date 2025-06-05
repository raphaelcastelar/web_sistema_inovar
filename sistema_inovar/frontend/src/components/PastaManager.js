import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { DocumentTextIcon, EnvelopeIcon, ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';

const API_BASE_URL = 'http://192.168.196.162:8000/api';
const SERVER_FILE_URL_BASE = 'http://192.168.196.162:8000'; 

const fetchArquivos = (empresaId, setArquivos, setLoadingState) => {
    setLoadingState(true);
    const pastaTypes = ['documentos_constitutivos', 'departamento_pessoal', 'xml', 'simples_nacional', 'outros'];
    const promises = pastaTypes.map(tipo => {
      const endpoint = tipo.replace('_', '-');
      const url = `${API_BASE_URL}/${endpoint}/`;
      return axios.get(url, { params: { empresa_id: empresaId } })
        .then(response => ({ tipo, data: response.data }))
        .catch(error => {
          console.error(`Erro ao buscar arquivos para ${tipo}:`, error);
          return { tipo, data: [] };
        });
    });
  
    Promise.all(promises).then(results => {
      const arquivosData = {};
      results.forEach(({ tipo, data }) => {
        arquivosData[tipo] = data;
      });
      setArquivos(arquivosData);
      setLoadingState(false);
    });
};

const monthOrder = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const groupFilesByYearAndMonth = (files) => {
    if (!files || files.length === 0) return {};
    const grouped = files.reduce((acc, file) => {
        if (!file.ano || !file.mes) {
            // console.warn('Arquivo sem ano ou mês definidos:', file);
            return acc;
        }
        const year = file.ano.toString();
        const monthNumber = parseInt(file.mes, 10);
        if (isNaN(monthNumber) || monthNumber < 1 || monthNumber > 12) {
            // console.warn('Mês inválido para o arquivo:', file);
            return acc;
        }
        const monthKey = `${file.mes.padStart(2, '0')}${year}`;
        const monthName = monthOrder[monthNumber - 1] || `Mês ${file.mes}`;
        if (!acc[year]) {
            acc[year] = {};
        }
        if (!acc[year][monthKey]) {
            acc[year][monthKey] = { 
                monthNameDisplay: monthName.charAt(0).toUpperCase() + monthName.slice(1),
                monthSortKey: monthNumber,
                files: [] 
            };
        }
        acc[year][monthKey].files.push(file);
        return acc;
    }, {});
    const sortedYears = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const result = {};
    for (const year of sortedYears) {
        const yearData = grouped[year];
        const sortedMonthKeys = Object.keys(yearData).sort((a, b) => {
            return yearData[a].monthSortKey - yearData[b].monthSortKey;
        });
        result[year] = {};
        for (const monthKey of sortedMonthKeys) {
            result[year][monthKey] = yearData[monthKey];
        }
    }
    return result;
};

const YearMonthAccordion = ({ files, selectedFiles, toggleFileSelection, serverFileUrlBase }) => {
    const [activeYear, setActiveYear] = useState(null);
    const [activeMonthKey, setActiveMonthKey] = useState(null);

    const groupedData = useMemo(() => groupFilesByYearAndMonth(files), [files]);
    const sortedYears = useMemo(() => Object.keys(groupedData), [groupedData]);

    useEffect(() => {
        if (sortedYears.length > 0) {
            if (activeYear === null || !sortedYears.includes(activeYear)) {
                const latestYear = sortedYears[0];
                setActiveYear(latestYear);
                const monthsInLatestYear = groupedData[latestYear];
                if (monthsInLatestYear && Object.keys(monthsInLatestYear).length > 0) {
                    const monthKeys = Object.keys(monthsInLatestYear);
                    setActiveMonthKey(monthKeys[monthKeys.length - 1]);
                } else {
                    setActiveMonthKey(null);
                }
            }
        } else {
            setActiveYear(null);
            setActiveMonthKey(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [files, sortedYears]);

    const handleYearToggle = (yearToToggle) => {
        const newActiveYear = activeYear === yearToToggle ? null : yearToToggle;
        setActiveYear(newActiveYear);
        setActiveMonthKey(null); 
    };

    const handleMonthToggle = (monthKeyToToggle) => {
        setActiveMonthKey(activeMonthKey === monthKeyToToggle ? null : monthKeyToToggle);
    };

    if (!files || files.length === 0) {
        return <p className="text-gray-500 italic mt-4">Nenhum arquivo encontrado nesta categoria.</p>;
    }
    if (sortedYears.length === 0 && files.length > 0) {
        return <p className="text-gray-500 mt-4">Arquivos presentes, mas não foi possível agrupar por ano. Verifique os dados 'ano' dos arquivos.</p>;
    }
    if (sortedYears.length === 0) {
        return <p className="text-gray-500 italic mt-4">Nenhum arquivo com dados de ano/mês para agrupar.</p>;
    }

    return (
        <div className="space-y-3 mt-4">
            {sortedYears.map(year => (
                <div key={year} className="bg-gray-750 rounded-lg shadow-md overflow-hidden">
                    <button
                        onClick={() => handleYearToggle(year)}
                        className="w-full flex justify-between items-center text-left p-4 font-semibold text-lg text-indigo-300 hover:bg-gray-700 transition-colors"
                    >
                        Ano: {year}
                        <span className={`transform transition-transform duration-200 ${activeYear === year ? 'rotate-180' : 'rotate-0'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </span>
                    </button>
                    {activeYear === year && (
                        <div className="border-t border-gray-700">
                            {monthOrder.map((nomeDoMesOriginal, indexDoMesArray) => {
                                const numeroDoMes = indexDoMesArray + 1;
                                const mesFormatadoStr = numeroDoMes.toString().padStart(2, '0');
                                const chaveMesAnoParaDados = `${mesFormatadoStr}${activeYear}`;
                                
                                const dadosDoMes = groupedData[activeYear]?.[chaveMesAnoParaDados];
                                const arquivosParaEsteMes = dadosDoMes?.files || [];
                                const nomeExibicaoMes = nomeDoMesOriginal.charAt(0).toUpperCase() + nomeDoMesOriginal.slice(1);

                                return (
                                    <div key={chaveMesAnoParaDados} className="border-b border-gray-600 last:border-b-0">
                                        <button
                                            onClick={() => handleMonthToggle(chaveMesAnoParaDados)}
                                            className="w-full flex justify-between items-center text-left py-3 px-6 text-gray-200 hover:bg-gray-600 transition-colors"
                                        >
                                            {nomeExibicaoMes}
                                            <span className={`transform transition-transform duration-200 ${activeMonthKey === chaveMesAnoParaDados && activeYear === year ? 'rotate-180' : 'rotate-0'}`}>
                                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            </span>
                                        </button>
                                        {activeMonthKey === chaveMesAnoParaDados && activeYear === year && (
                                            <div className="pl-8 pr-4 py-2 bg-gray-700"> 
                                                {arquivosParaEsteMes.length > 0 ? (
                                                    <ul className="space-y-1">
                                                        {arquivosParaEsteMes.map(file => (
                                                            <li key={file.id} className="text-gray-300 flex items-center space-x-2 p-1.5 hover:bg-gray-600 rounded-md transition-colors">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedFiles.includes(file.id)}
                                                                    onChange={() => toggleFileSelection(file.id)}
                                                                    className="form-checkbox h-4 w-4 text-indigo-600 rounded bg-gray-800 border-gray-600 focus:ring-indigo-500 cursor-pointer"
                                                                />
                                                                <span className="flex-1 truncate" title={file.nome_arquivo}>{file.nome_arquivo}</span>
                                                                <a
                                                                    href={`${serverFileUrlBase}${file.caminho_arquivo}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-700 transition-colors"
                                                                >
                                                                    Ver
                                                                </a>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-gray-500 italic py-2">Nenhum arquivo para {nomeExibicaoMes} de {activeYear}.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};


const PastaManager = () => {
  const { empresaId: empresaIdStr } = useParams();
  const empresaId = parseInt(empresaIdStr, 10);
  const [pastas, setPastas] = useState([]);
  const [selectedPasta, setSelectedPasta] = useState(null);
  const [empresaNome, setEmpresaNome] = useState('');
  const [empresaCnpj, setEmpresaCnpj] = useState('');
  const [arquivos, setArquivos] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  
  // --- INÍCIO: Estados para seleção de Mês/Ano para Upload ---
  const [targetUploadYear, setTargetUploadYear] = useState('');
  const [targetUploadMonth, setTargetUploadMonth] = useState('');
  // --- FIM: Estados para seleção de Mês/Ano para Upload ---

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE_URL}/empresas/${empresaId}/`)
      .then(response => {
        setEmpresaNome(response.data.nome);
        setEmpresaCnpj(response.data.cnpj);
      })
      .catch(err => {
        console.error('Erro ao carregar dados da empresa:', err);
        setError('Erro ao carregar dados da empresa.');
      })
      .finally(() => setLoading(false));

    const pastaTypes = ['documentos_constitutivos', 'departamento_pessoal', 'xml', 'simples_nacional', 'outros'];
    setPastas(pastaTypes.map(tipo => ({ tipo, id: tipo })));
    fetchArquivos(empresaId, setArquivos, setLoading);
  }, [empresaId]);

  const onDrop = useCallback((acceptedFiles, pastaTipo) => {
    if (!empresaNome || !empresaCnpj) {
      alert('Aguarde o carregamento dos dados da empresa antes de fazer upload.');
      return;
    }
    if (!pastaTipo) {
        alert('Selecione uma pasta antes de arrastar arquivos.');
        return;
    }
    setUploading(true); // Esta função (setUploading) é estável
    acceptedFiles.forEach(file => {
      const tipo = pastaTipo;
      const formData = new FormData();
      formData.append('caminho_arquivo', file);
      formData.append('nome_arquivo', file.name);
      formData.append('cnpj_empresa', empresaCnpj); // Dependência: empresaCnpj
      formData.append('nome_empresa', empresaNome); // Dependência: empresaNome
      formData.append('tipo_documento', tipo.replace('_', '-'));

      if (['xml', 'departamento_pessoal', 'simples_nacional'].includes(tipo)) {
        const anoParaSalvar = targetUploadYear || new Date().getFullYear().toString(); // Dependência: targetUploadYear
        const mesParaSalvar = targetUploadMonth || (new Date().getMonth() + 1).toString().padStart(2, '0'); // Dependência: targetUploadMonth
        
        formData.append('mes', mesParaSalvar);
        formData.append('ano', anoParaSalvar);
      }

      if (['departamento_pessoal', 'simples_nacional'].includes(tipo)) {
        formData.append('entregue', 'false');
      }
      const endpoint = tipo.replace('_', '-');
      const url = `${API_BASE_URL}/${endpoint}/`;
      axios.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
        .then(() => { 
          // fetchArquivos é definida fora, sua referência não muda.
          // empresaId, setArquivos, setLoading são passados para ela.
          fetchArquivos(empresaId, setArquivos, setLoading); 
        })
        .catch(err => {
          console.error(`Erro ao salvar ${tipo}:`, err.response ? err.response.data : err.message);
          alert(`Erro no upload: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
        })
        .finally(() => setUploading(false)); // setUploading é estável
    });
  // Lista de dependências corrigida:
  // Apenas variáveis/funções do escopo do componente que são usadas dentro do useCallback
  // e que podem mudar entre renderizações, necessitando que o useCallback retorne uma nova
  // instância da função.
  // 'setArquivos' e 'setLoading' são state setters e são estáveis,
  // o ESLint geralmente não os requer, mas incluí-los não causa problemas.
  // O ESLint estava reclamando especificamente de 'fetchArquivos'.
  }, [empresaId, empresaNome, empresaCnpj, targetUploadYear, targetUploadMonth, setArquivos, setLoading, setUploading]);


  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
        if (selectedPasta) {
            onDrop(acceptedFiles, selectedPasta.tipo);
        } else {
            alert("Por favor, selecione uma pasta primeiro.");
        }
    },
    noClick: true,
  });

  const toggleFileSelection = (fileId) => {
    setSelectedFiles(prev =>
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };
  
  const handleEmailClick = () => {
    if (selectedFiles.length === 0) {
      alert('Por favor, selecione pelo menos um arquivo.'); return;
    }
    if (!selectedPasta) {
        alert('Nenhuma pasta selecionada.'); return;
    }
    setLoading(true); setError(null);
    axios.post(`${API_BASE_URL}/enviar-email/`, {
      empresa_id: empresaId, tipo_pasta: selectedPasta.tipo, file_ids: selectedFiles,
    })
      .then(response => { alert(response.data.message); setSelectedFiles([]); })
      .catch(err => {
        const errorMsg = err.response?.data?.error || 'Erro ao enviar email.';
        setError(errorMsg); alert(`Erro: ${errorMsg}`);
      })
      .finally(() => setLoading(false));
  };

 const handleWhatsAppClick = () => {
    if (selectedFiles.length === 0) {
        alert('Por favor, selecione pelo menos um arquivo.');
        return;
    }
    if (!selectedPasta) {
        alert('Nenhuma pasta selecionada.');
        return;
    }
    const allowedPastaTypesForWhatsApp = [
        'documentos_constitutivos', 
        'departamento_pessoal', 
        'simples_nacional', 
        'outros'
    ];
    if (!allowedPastaTypesForWhatsApp.includes(selectedPasta.tipo)) {
        alert(`A funcionalidade de envio por WhatsApp não está disponível para a pasta "${selectedPasta.tipo.replace(/_/g, ' ')}".`);
        return;
    }
    setLoading(true); setError(null);
    axios.post(`${API_BASE_URL}/enviar-documentos-whatsapp/`, {
        empresa_id: empresaId,
        file_ids: selectedFiles,
        tipo_pasta: selectedPasta.tipo
    })
    .then(response => {
        let message = `Relatório do Envio por WhatsApp para ${empresaNome} (Pasta: ${selectedPasta.tipo.replace(/_/g, ' ')})\n(Usando telefone cadastrado):\n`;
        if (response.data.successful_sends && response.data.successful_sends.length > 0) {
            message += `\nSucessos (${response.data.successful_sends.length}):\n`;
            response.data.successful_sends.forEach(send => {
                message += `- ${send.filename} (ID: ${send.message_id})\n`;
            });
        }
        if (response.data.failed_sends && response.data.failed_sends.length > 0) {
            message += `\nFalhas (${response.data.failed_sends.length}):\n`;
            response.data.failed_sends.forEach(fail => {
                message += `- ${fail.filename}: ${fail.reason}\n`;
            });
        }
        if ((!response.data.successful_sends || response.data.successful_sends.length === 0) && 
            (!response.data.failed_sends || response.data.failed_sends.length === 0) &&
            response.data.message) {
             message = response.data.message;
        } else if (!response.data.successful_sends?.length && !response.data.failed_sends?.length) {
            message = `Nenhuma operação de envio para a pasta ${selectedPasta.tipo.replace(/_/g, ' ')} foi processada ou todas falharam sem detalhes específicos.`;
        }
        alert(message);
        setSelectedFiles([]);
    })
    .catch(err => {
        console.error('Erro detalhado ao enviar por WhatsApp:', err.response ? err.response.data : err.message);
        const errorMsg = err.response?.data?.error || err.response?.data?.detail || 'Erro desconhecido ao tentar enviar por WhatsApp.';
        setError(errorMsg);
        alert(`Erro ao enviar por WhatsApp: ${errorMsg}`);
    })
    .finally(() => {
        setLoading(false);
    });
  };
  
  const handlePastaClick = (pasta) => {
    setSelectedPasta(pasta);
    setSelectedFiles([]);
    setError(null);
    // --- INÍCIO: Resetar targetUploadYear e targetUploadMonth ---
    setTargetUploadYear('');
    setTargetUploadMonth('');
    // --- FIM: Resetar targetUploadYear e targetUploadMonth ---
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-900 min-h-screen text-gray-100">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-indigo-300 mb-6">
          Gerenciador de Arquivos: {empresaNome ? `${empresaNome} (CNPJ: ${empresaCnpj})` : 'Carregando...'}
        </h2>

        {loading && !selectedPasta && <p className="text-center text-indigo-400">Carregando dados...</p>}
        {error && <p className="text-red-400 bg-red-900 p-3 rounded mb-4">{error}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
          {pastas.map(pasta => (
            <motion.div
              key={pasta.id}
              className={`rounded-lg shadow-lg p-3 cursor-pointer transition-all duration-200 ease-in-out
                          ${selectedPasta?.id === pasta.id ? 'bg-indigo-600 ring-2 ring-indigo-400' : 'bg-gray-800 hover:bg-gray-700'}`}
              onClick={() => handlePastaClick(pasta)}
              whileHover={{ scale: selectedPasta?.id === pasta.id ? 1 : 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <div className="flex flex-col items-center text-center">
                <DocumentTextIcon className={`h-8 w-8 mb-1 ${selectedPasta?.id === pasta.id ? 'text-white' : 'text-indigo-400'}`} />
                <p className={`text-sm font-medium ${selectedPasta?.id === pasta.id ? 'text-white' : 'text-gray-300'} capitalize`}>
                  {pasta.tipo.replace(/_/g, ' ')}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {selectedPasta && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 rounded-lg shadow-xl p-4 sm:p-6"
          >
            <h3 className="text-xl sm:text-2xl font-semibold text-indigo-300 mb-4 capitalize flex items-center">
              <DocumentTextIcon className="h-7 w-7 mr-2 text-indigo-400" />
              {selectedPasta.tipo.replace(/_/g, ' ')}
            </h3>
            
            {/* --- INÍCIO: Seletores de Mês/Ano para Upload --- */}
            {(selectedPasta.tipo === 'xml' || selectedPasta.tipo === 'departamento_pessoal' || selectedPasta.tipo === 'simples_nacional') && (
              <div className="my-4 p-4 bg-gray-700 rounded-lg shadow-md flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 items-start sm:items-end">
                <p className="text-sm text-indigo-300 font-semibold sm:mb-1 whitespace-nowrap self-center sm:self-end">Período do Documento para Upload:</p>
                <div>
                  <label htmlFor="upload-year-select" className="block text-xs font-medium text-gray-300 mb-1">Ano</label>
                  <select
                    id="upload-year-select"
                    value={targetUploadYear}
                    onChange={(e) => setTargetUploadYear(e.target.value)}
                    className="block w-full sm:w-32 pl-3 pr-10 py-2 text-sm border-gray-600 bg-gray-600 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm"
                  >
                    <option value="">Ano Atual</option>
                    {[...Array(7)].map((_, i) => { // Gera uma lista de anos: atual + 2 futuros, atual - 4 passados
                      const yearOption = new Date().getFullYear() + 2 - i;
                      return <option key={yearOption} value={yearOption.toString()}>{yearOption}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label htmlFor="upload-month-select" className="block text-xs font-medium text-gray-300 mb-1">Mês</label>
                  <select
                    id="upload-month-select"
                    value={targetUploadMonth}
                    onChange={(e) => setTargetUploadMonth(e.target.value)}
                    className="block w-full sm:w-40 pl-3 pr-10 py-2 text-sm border-gray-600 bg-gray-600 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm"
                  >
                    <option value="">Mês Atual</option>
                    {monthOrder.map((monthName, index) => (
                      <option key={monthName} value={(index + 1).toString().padStart(2, '0')}>
                        {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {/* --- FIM: Seletores de Mês/Ano para Upload --- */}

            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                          transition-all duration-300 ease-in-out mb-6
                          ${isDragActive ? 'border-indigo-400 bg-gray-700' : 'border-gray-600 hover:border-indigo-500 bg-gray-750 hover:bg-gray-700'}`}
              onClick={() => document.getElementById(`fileInput-${selectedPasta.id}`)?.click()}
            >
              <input {...getInputProps({ id: `fileInput-${selectedPasta.id}` })} />
              {uploading ? ( <p className="text-indigo-400">Enviando arquivos...</p>
              ) : isDragActive ? ( <p className="text-indigo-300">Solte os arquivos aqui...</p>
              ) : ( <p className="text-gray-400">Arraste e solte arquivos aqui, ou clique para selecionar.</p> )}
            </div>

            <div className="mt-6">
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-700">
                <h4 className="text-lg font-semibold text-indigo-300">
                  Arquivos na Pasta
                  {(selectedPasta.tipo === 'xml' || selectedPasta.tipo === 'departamento_pessoal' || selectedPasta.tipo === 'simples_nacional')
                    ? ` (Agrupados por Ano/Mês)`
                    : ''}
                </h4>
                {selectedFiles.length > 0 && (
                  <div className="flex space-x-2">
                    <button 
                        onClick={handleEmailClick} 
                        className="flex items-center text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-3 rounded-md shadow-md transition duration-150 ease-in-out disabled:opacity-50" 
                        title="Enviar por Email" 
                        disabled={loading || uploading}>
                      <EnvelopeIcon className="h-5 w-5 mr-1" /> Email
                    </button>
                    <button 
                        onClick={handleWhatsAppClick} 
                        className="flex items-center text-sm bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-3 rounded-md shadow-md transition duration-150 ease-in-out disabled:opacity-50" 
                        title="Enviar por WhatsApp"
                        disabled={ 
                          loading || 
                          uploading || 
                          selectedFiles.length === 0 ||
                          !selectedPasta ||
                          selectedPasta.tipo === 'xml'
                        }>
                      <ChatBubbleBottomCenterTextIcon className="h-5 w-5 mr-1" /> WhatsApp
                    </button>
                  </div>
                )}
              </div>
              {error && <p className="text-red-400 bg-red-900 p-2 rounded mb-3 text-sm">{error}</p>}
              
              {(selectedPasta.tipo === 'xml' || selectedPasta.tipo === 'departamento_pessoal' || selectedPasta.tipo === 'simples_nacional') ? (
                <YearMonthAccordion 
                    files={arquivos[selectedPasta.tipo] || []} 
                    selectedFiles={selectedFiles}
                    toggleFileSelection={toggleFileSelection}
                    serverFileUrlBase={SERVER_FILE_URL_BASE}
                />
              ) : (
                arquivos[selectedPasta.tipo] && arquivos[selectedPasta.tipo].length > 0 ? (
                    <ul className="space-y-2">
                        {arquivos[selectedPasta.tipo].map(file => (
                            <li key={file.id} className="text-gray-300 flex items-center space-x-2 p-2 hover:bg-gray-700 rounded-md transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={selectedFiles.includes(file.id)} 
                                    onChange={() => toggleFileSelection(file.id)} 
                                    className="form-checkbox h-4 w-4 text-indigo-600 rounded bg-gray-800 border-gray-600 focus:ring-indigo-500 cursor-pointer"
                                />
                                <span className="flex-1 truncate" title={file.nome_arquivo}>{file.nome_arquivo}</span>
                                {file.hasOwnProperty('entregue') && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${file.entregue ? 'bg-green-700 text-green-200' : 'bg-yellow-700 text-yellow-200'}`}>
                                        {file.entregue ? 'Entregue' : 'Pendente'}
                                    </span>
                                )}
                                <a 
                                    href={`${SERVER_FILE_URL_BASE}${file.caminho_arquivo}`} 
                                    target="_blank" rel="noopener noreferrer" 
                                    className="text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-700 transition-colors">
                                    Ver
                                </a>
                            </li>
                        ))}
                    </ul>
                ) : ( <p className="text-gray-500 italic mt-4">Nenhum arquivo encontrado nesta pasta.</p> )
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default PastaManager;