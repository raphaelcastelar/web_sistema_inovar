import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { DocumentTextIcon, EnvelopeIcon, ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';

const fetchArquivos = async (empresaId, setArquivos) => {
  const endpoints = {
    documentos_constitutivos: 'documentos-constitutivos',
    departamento_pessoal: 'departamento-pessoal',
    xml: 'xml',
    simples_nacional: 'simples-nacional',
  };
  const newArquivos = {};
  for (const [tipo, endpoint] of Object.entries(endpoints)) {
    try {
      const response = await axios.get(`http://127.0.0.1:8000/api/${endpoint}/?cnpj_empresa=${empresaId}`);
      newArquivos[tipo] = response.data;
    } catch (error) {
      console.error(`Erro ao carregar ${tipo}:`, error);
      newArquivos[tipo] = [];
    }
  }
  setArquivos(newArquivos);
};

const PastaManager = () => {
  const { empresaId } = useParams();
  const [pastas, setPastas] = useState([]);
  const [selectedPasta, setSelectedPasta] = useState(null);
  const [empresaNome, setEmpresaNome] = useState('');
  const [arquivos, setArquivos] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]); // Estado para arquivos selecionados

  useEffect(() => {
    axios.get(`http://127.0.0.1:8000/api/empresas/${empresaId}/`)
      .then(response => {
        setEmpresaNome(response.data.nome);
      })
      .catch(error => console.error('Erro ao carregar nome da empresa:', error));

    const pastaTypes = ['documentos_constitutivos', 'departamento_pessoal', 'xml', 'simples_nacional', 'outros'];
    setPastas(pastaTypes.map(tipo => ({ tipo, id: tipo })));

    fetchArquivos(empresaId, setArquivos);
  }, [empresaId]);

  const onDrop = (acceptedFiles, pasta) => {
    acceptedFiles.forEach(file => {
      const tipo = typeof pasta === 'object' ? pasta.tipo : pasta;
      if (!tipo) {
        console.error('Tipo de pasta inválido:', pasta);
        return;
      }

      if (!file) {
        console.error('Nenhum arquivo fornecido:', file);
        return;
      }

      const formData = new FormData();
      formData.append('caminho_arquivo', file);
      formData.append('nome_arquivo', file.name);
      formData.append('cnpj_empresa', empresaId);
      formData.append('nome_empresa', empresaNome || empresaId);
      formData.append('tipo_documento', tipo.replace('_', '-'));
      formData.append('mes', new Date().toLocaleString('default', { month: 'long' }));
      formData.append('ano', new Date().getFullYear().toString());
      formData.append('entregue', 'false');

      console.log('Arquivo enviado:', file);
      console.log('Dados enviados:', [...formData.entries()]);

      let url = '';
      switch (tipo) {
        case 'documentos_constitutivos':
          url = 'http://127.0.0.1:8000/api/documentos-constitutivos/';
          break;
        case 'departamento_pessoal':
          url = 'http://127.0.0.1:8000/api/departamento-pessoal/';
          break;
        case 'xml':
          url = 'http://127.0.0.1:8000/api/xml/';
          break;
        case 'simples_nacional':
          url = 'http://127.0.0.1:8000/api/simples-nacional/';
          break;
        default:
          console.warn(`Pasta ${tipo} não tem tabela associada.`);
          return;
      }

      axios.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
        .then(response => {
          console.log(`${tipo} salvo:`, response.data);
          fetchArquivos(empresaId, setArquivos);
          setSelectedFiles([]); // Limpa seleção após upload
        })
        .catch(error => {
          console.error(`Erro ao salvar ${tipo}:`, error);
          if (error.response) {
            console.log('Detalhes:', error.response.data);
            console.log('Status:', error.response.status);
            console.log('Headers:', error.response.headers);
          }
        });
    });
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (acceptedFiles) => onDrop(acceptedFiles, selectedPasta),
  });

  const toggleFileSelection = (fileId) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleEmailClick = () => {
    if (selectedFiles.length === 0) {
      alert('Por favor, selecione pelo menos um arquivo.');
      return;
    }
    console.log('Arquivos selecionados para envio por email:', selectedFiles);
    // Funcionalidade futura aqui
  };

  const handleWhatsAppClick = () => {
    if (selectedFiles.length === 0) {
      alert('Por favor, selecione pelo menos um arquivo.');
      return;
    }
    console.log('Arquivos selecionados para envio por WhatsApp:', selectedFiles);
    // Funcionalidade futura aqui
  };

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold text-indigo-200 mb-6">
        Pastas da Empresa {empresaNome ? `(${empresaNome})` : ''}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {pastas.map(pasta => (
          <motion.div
            key={pasta.id}
            className="bg-gray-800 rounded-lg shadow-md p-4 cursor-pointer hover:bg-gray-700 transition-all duration-300"
            onClick={() => setSelectedPasta(pasta)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="flex items-center">
              <DocumentTextIcon className="h-8 w-8 text-indigo-400 mr-2" />
              <p className="text-gray-300 capitalize">{pasta.tipo.replace('_', ' ')}</p>
            </div>
          </motion.div>
        ))}
      </div>
      {selectedPasta && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gray-800 rounded-lg shadow-lg p-6"
        >
          <h3 className="text-xl font-semibold text-indigo-200 mb-4 capitalize">
            {selectedPasta.tipo.replace('_', ' ')}
          </h3>
          <div {...getRootProps()} className="border-2 border-dashed border-indigo-500 p-6 text-center bg-gray-700 rounded-lg hover:bg-gray-600 transition-all duration-300">
            <input {...getInputProps()} />
            <p className="text-gray-400">Arraste e solte arquivos aqui ou clique para selecionar</p>
          </div>
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-lg font-semibold text-indigo-300">Arquivos</h4>
              <div className="flex space-x-2">
                <button
                  onClick={handleEmailClick}
                  className="text-indigo-400 hover:text-indigo-300"
                  title="Enviar por Email"
                >
                  <EnvelopeIcon className="h-6 w-6" />
                </button>
                <button
                  onClick={handleWhatsAppClick}
                  className="text-indigo-400 hover:text-indigo-300"
                  title="Enviar por WhatsApp"
                >
                  <ChatBubbleBottomCenterTextIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
            {arquivos[selectedPasta.tipo] && arquivos[selectedPasta.tipo].length > 0 ? (
              <ul className="space-y-2">
                {arquivos[selectedPasta.tipo].map(file => (
                  <li key={file.id} className="text-gray-300 flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedFiles.includes(file.id)}
                      onChange={() => toggleFileSelection(file.id)}
                      className="h-4 w-4 text-indigo-600 rounded"
                    />
                    <span className="flex-1">{file.nome_arquivo}</span>
                    <a
                      href={`http://127.0.0.1:8000${file.caminho_arquivo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      Visualizar
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">Nenhum arquivo encontrado.</p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default PastaManager;