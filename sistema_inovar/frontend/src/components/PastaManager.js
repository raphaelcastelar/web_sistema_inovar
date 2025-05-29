import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { DocumentTextIcon } from '@heroicons/react/24/outline';

const PastaManager = () => {
  const { empresaId } = useParams();
  const [pastas, setPastas] = useState([]);
  const [selectedPasta, setSelectedPasta] = useState(null);
  const [empresaNome, setEmpresaNome] = useState('');
  const [arquivos, setArquivos] = useState({});

  useEffect(() => {
    axios.get(`http://127.0.0.1:8000/api/empresas/${empresaId}/`)
      .then(response => {
        setEmpresaNome(response.data.nome);
      })
      .catch(error => console.error('Erro ao carregar nome da empresa:', error));

    const pastaTypes = ['documentos_constitutivos', 'departamento_pessoal', 'xml', 'simples_nacional', 'outros'];
    setPastas(pastaTypes.map(tipo => ({ tipo, id: tipo })));

    fetchArquivos();
  }, [empresaId]);

  const fetchArquivos = async () => {
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

  const onDrop = (acceptedFiles, pasta) => {
    acceptedFiles.forEach(file => {
      const tipo = typeof pasta === 'object' ? pasta.tipo : pasta;
      if (!tipo) {
        console.error('Tipo de pasta inválido:', pasta);
        return;
      }

      const formData = new FormData();
      formData.append('caminho_arquivo', file); // Campo FileField no backend
      formData.append('nome_arquivo', file.name);
      formData.append('cnpj_empresa', empresaId);
      formData.append('nome_empresa', empresaNome || empresaId); // Usa empresaId como fallback
      formData.append('tipo_documento', tipo.replace('_', '-'));
      formData.append('mes', new Date().toLocaleString('default', { month: 'long' }));
      formData.append('ano', new Date().getFullYear().toString());
      formData.append('entregue', 'false');

      console.log('Arquivo enviado:', file); // Log do arquivo
      console.log('Dados enviados:', [...formData.entries()]); // Log completo do formData

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
          fetchArquivos();
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
            <DocumentTextIcon className="h-8 w-8 text-indigo-400 mb-2" />
            <p className="text-gray-300 capitalize">{pasta.tipo.replace('_', ' ')}</p>
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
            <h4 className="text-lg font-semibold text-indigo-300 mb-2">Arquivos</h4>
            {arquivos[selectedPasta.tipo] && arquivos[selectedPasta.tipo].length > 0 ? (
              <ul className="space-y-2">
                {arquivos[selectedPasta.tipo].map(file => (
                  <li key={file.id} className="text-gray-300 flex justify-between items-center">
                    <span>{file.nome_arquivo}</span>
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