import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { DocumentTextIcon, EnvelopeIcon, ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const fetchArquivos = (empresaId, setArquivos, setLoadingState) => { // Renomeado setLoading para setLoadingState
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

// Lista de meses para o seletor
const monthOrder = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const PastaManager = () => {
  const { empresaId: empresaIdStr } = useParams();
  const empresaId = parseInt(empresaIdStr, 10);
  const [pastas, setPastas] = useState([]);
  const [selectedPasta, setSelectedPasta] = useState(null);
  const [empresaNome, setEmpresaNome] = useState('');
  const [empresaCnpj, setEmpresaCnpj] = useState('');
  const [arquivos, setArquivos] = useState({ xml: [] }); // Inicializa arquivos.xml como array
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  // Estados para o filtro de XML
  const [selectedXmlYear, setSelectedXmlYear] = useState('');
  const [selectedXmlMonth, setSelectedXmlMonth] = useState('');
  const [availableXmlYears, setAvailableXmlYears] = useState([]);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE_URL}/empresas/${empresaId}/`)
      .then(response => {
        setEmpresaNome(response.data.nome);
        setEmpresaCnpj(response.data.cnpj);
      })
      .catch(error => {
        console.error('Erro ao carregar dados da empresa:', error);
        setError('Erro ao carregar dados da empresa.');
      })
      .finally(() => setLoading(false));

    const pastaTypes = ['documentos_constitutivos', 'departamento_pessoal', 'xml', 'simples_nacional', 'outros'];
    setPastas(pastaTypes.map(tipo => ({ tipo, id: tipo })));

    fetchArquivos(empresaId, setArquivos, setLoading);
  }, [empresaId]);

  // Efeito para definir filtros XML padrão e anos disponíveis
  useEffect(() => {
    if (selectedPasta && selectedPasta.tipo === 'xml') {
      const currentYear = new Date().getFullYear().toString();
      const currentMonth = new Date().toLocaleString('pt-BR', { month: 'long' }).toLowerCase();

      const yearsInData = arquivos.xml && arquivos.xml.length > 0
        ? [...new Set(arquivos.xml.map(f => f.ano.toString()))].sort((a, b) => b.localeCompare(a))
        : [];
      
      let uniqueYears = [...yearsInData];
      if (!uniqueYears.includes(currentYear)) {
        uniqueYears.push(currentYear);
        uniqueYears.sort((a, b) => b.localeCompare(a));
      }
      setAvailableXmlYears(uniqueYears.length > 0 ? uniqueYears : [currentYear]);

      // Define o ano e mês selecionados como padrão (atual) apenas se não estiverem definidos ainda
      // ou se a pasta foi recém-selecionada.
      if (!selectedXmlYear || !uniqueYears.includes(selectedXmlYear)) {
        setSelectedXmlYear(currentYear);
      }
      if (!selectedXmlMonth) {
        setSelectedXmlMonth(currentMonth);
      }
    } else {
      // Limpa filtros quando outra pasta é selecionada ou nenhuma pasta está selecionada
      setSelectedXmlYear('');
      setSelectedXmlMonth('');
      setAvailableXmlYears([]);
    }
  }, [selectedPasta, arquivos.xml]); // Não incluir selectedXmlYear e selectedXmlMonth aqui para evitar loops

  const onDrop = useCallback((acceptedFiles, pastaTipo) => {
    if (!empresaNome || !empresaCnpj) {
      alert('Aguarde o carregamento dos dados da empresa antes de fazer upload.');
      return;
    }
    if (!pastaTipo) {
        alert('Selecione uma pasta antes de arrastar arquivos.');
        return;
    }

    setUploading(true);
    acceptedFiles.forEach(file => {
      const tipo = pastaTipo;
      const formData = new FormData();
      formData.append('caminho_arquivo', file);
      formData.append('nome_arquivo', file.name);
      formData.append('cnpj_empresa', empresaCnpj);
      formData.append('nome_empresa', empresaNome);
      formData.append('tipo_documento', tipo.replace('_', '-'));

      if (['xml', 'departamento_pessoal', 'simples_nacional'].includes(tipo)) {
        const uploadMonth = new Date().toLocaleString('pt-BR', { month: 'long' });
        const uploadYear = new Date().getFullYear().toString();
        formData.append('mes', uploadMonth);
        formData.append('ano', uploadYear);

        // Se o upload for para a pasta XML e os filtros estiverem no mês/ano atual,
        // os arquivos novos aparecerão. Se não, o usuário precisará ajustar o filtro.
      }
      
      if (['departamento_pessoal', 'simples_nacional'].includes(tipo)) {
        formData.append('entregue', 'false');
      }

      const endpoint = tipo.replace('_', '-');
      const url = `${API_BASE_URL}/${endpoint}/`;

      axios.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
        .then(response => {
          fetchArquivos(empresaId, setArquivos, setLoading); // Atualiza lista de arquivos
        })
        .catch(error => {
          console.error(`Erro ao salvar ${tipo}:`, error.response ? error.response.data : error.message);
          alert(`Erro no upload: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        })
        .finally(() => setUploading(false));
    });
  }, [empresaId, empresaNome, empresaCnpj, fetchArquivos]);


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
      .catch(error => {
        const errorMsg = error.response?.data?.error || 'Erro ao enviar email.';
        setError(errorMsg); alert(`Erro: ${errorMsg}`);
      })
      .finally(() => setLoading(false));
  };

  const handleWhatsAppClick = () => alert('Funcionalidade de envio por WhatsApp ainda não implementada.');

  // Função para renderizar arquivos XML filtrados
  const renderFilteredXmlFiles = () => {
    if (!selectedXmlYear || !selectedXmlMonth) {
      return <p className="text-gray-500 mt-4">Selecione o ano e o mês para visualizar os arquivos XML.</p>;
    }
    if (!arquivos.xml || arquivos.xml.length === 0) {
        return <p className="text-gray-500 mt-4">Nenhum arquivo XML encontrado para esta empresa.</p>;
    }

    const filtered = arquivos.xml.filter(
      file => file.ano.toString() === selectedXmlYear && file.mes.toLowerCase() === selectedXmlMonth.toLowerCase()
    );

    if (filtered.length === 0) {
      return <p className="text-gray-500 mt-4">Nenhum arquivo XML encontrado para {selectedXmlMonth}/{selectedXmlYear}.</p>;
    }

    return (
      <ul className="space-y-2 mt-4">
        {filtered.map(file => (
          <li key={file.id} className="text-gray-300 flex items-center space-x-2 p-2 hover:bg-gray-700 rounded-md transition-colors">
            <input
              type="checkbox"
              checked={selectedFiles.includes(file.id)}
              onChange={() => toggleFileSelection(file.id)}
              className="form-checkbox h-4 w-4 text-indigo-600 rounded bg-gray-800 border-gray-600 focus:ring-indigo-500"
            />
            <span className="flex-1 truncate" title={file.nome_arquivo}>{file.nome_arquivo}</span>
            <a
              href={`http://127.0.0.1:8000${file.caminho_arquivo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-700 transition-colors"
            >
              Ver
            </a>
          </li>
        ))}
      </ul>
    );
  };
  
  const handlePastaClick = (pasta) => {
    setSelectedPasta(pasta);
    setSelectedFiles([]); // Limpa seleção de arquivos ao trocar de pasta
    setError(null); // Limpa erros
    // Resetar filtros de XML é feito pelo useEffect [selectedPasta, arquivos.xml]
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
              onClick={() => handlePastaClick(pasta)} // Usar handlePastaClick
              whileHover={{ scale: selectedPasta?.id === pasta.id ? 1 : 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <div className="flex flex-col items-center text-center">
                <DocumentTextIcon className={`h-8 w-8 mb-1 ${selectedPasta?.id === pasta.id ? 'text-white' : 'text-indigo-400'}`} />
                <p className={`text-sm font-medium ${selectedPasta?.id === pasta.id ? 'text-white' : 'text-gray-300'} capitalize`}>
                  {pasta.tipo.replace('_', ' ')}
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
              {selectedPasta.tipo.replace('_', ' ')}
            </h3>
            
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
                  {selectedPasta.tipo === 'xml' ? `Arquivos de ${selectedXmlMonth || ''}/${selectedXmlYear || ''}` : 'Arquivos na Pasta'}
                </h4>
                {(selectedFiles.length > 0 && (!selectedPasta || selectedPasta.tipo !== 'xml' || (selectedPasta.tipo === 'xml' && arquivos.xml.filter(f => f.ano.toString() === selectedXmlYear && f.mes.toLowerCase() === selectedXmlMonth.toLowerCase() && selectedFiles.includes(f.id) ).length > 0 ) )) && (
                  <div className="flex space-x-2">
                    <button onClick={handleEmailClick} className="flex items-center text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-3 rounded-md shadow-md transition duration-150 ease-in-out disabled:opacity-50" title="Enviar por Email" disabled={loading || uploading}>
                      <EnvelopeIcon className="h-5 w-5 mr-1" /> Email
                    </button>
                    <button onClick={handleWhatsAppClick} className="flex items-center text-sm bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-3 rounded-md shadow-md transition duration-150 ease-in-out disabled:opacity-50" title="Enviar por WhatsApp (Em breve)" disabled={loading || uploading || true}>
                      <ChatBubbleBottomCenterTextIcon className="h-5 w-5 mr-1" /> WhatsApp
                    </button>
                  </div>
                )}
              </div>
              {error && <p className="text-red-400 bg-red-900 p-2 rounded mb-3 text-sm">{error}</p>}
              
              {selectedPasta.tipo === 'xml' ? (
                <>
                  <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 mb-4 p-4 bg-gray-750 rounded-md items-end">
                    <div>
                      <label htmlFor="xml-year-select" className="block text-sm font-medium text-gray-300 mb-1">Ano:</label>
                      <select
                        id="xml-year-select"
                        value={selectedXmlYear}
                        onChange={(e) => { setSelectedXmlYear(e.target.value); setSelectedFiles([]); }} // Limpa seleção ao mudar filtro
                        className="block w-full sm:w-32 pl-3 pr-10 py-2 text-base border-gray-600 bg-gray-700 text-gray-200 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
                      >
                        {availableXmlYears.map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="xml-month-select" className="block text-sm font-medium text-gray-300 mb-1">Mês:</label>
                      <select
                        id="xml-month-select"
                        value={selectedXmlMonth}
                        onChange={(e) => { setSelectedXmlMonth(e.target.value); setSelectedFiles([]); }} // Limpa seleção ao mudar filtro
                        className="block w-full sm:w-40 pl-3 pr-10 py-2 text-base border-gray-600 bg-gray-700 text-gray-200 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
                      >
                        {monthOrder.map(monthName => (
                          <option key={monthName} value={monthName.toLowerCase()}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {renderFilteredXmlFiles()}
                </>
              ) : (
                arquivos[selectedPasta.tipo] && arquivos[selectedPasta.tipo].length > 0 ? (
                  <ul className="space-y-2">
                    {arquivos[selectedPasta.tipo].map(file => (
                      <li key={file.id} className="text-gray-300 flex items-center space-x-2 p-2 hover:bg-gray-700 rounded-md transition-colors">
                        <input type="checkbox" checked={selectedFiles.includes(file.id)} onChange={() => toggleFileSelection(file.id)} className="form-checkbox h-4 w-4 text-indigo-600 rounded bg-gray-800 border-gray-600 focus:ring-indigo-500"/>
                        <span className="flex-1 truncate" title={file.nome_arquivo}>{file.nome_arquivo}</span>
                        {(file.mes && file.ano) && (<span className="text-xs text-gray-500 capitalize">{file.mes}/{file.ano}</span>)}
                        {file.hasOwnProperty('entregue') && (<span className={`text-xs px-2 py-0.5 rounded-full ${file.entregue ? 'bg-green-700 text-green-200' : 'bg-yellow-700 text-yellow-200'}`}>{file.entregue ? 'Entregue' : 'Pendente'}</span>)}
                        <a href={`http://127.0.0.1:8000${file.caminho_arquivo}`} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-700 transition-colors">Ver</a>
                      </li>
                    ))}
                  </ul>
                ) : ( <p className="text-gray-500 italic">Nenhum arquivo encontrado nesta pasta.</p> )
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default PastaManager;