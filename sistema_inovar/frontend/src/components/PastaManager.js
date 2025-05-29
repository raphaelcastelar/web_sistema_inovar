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
  const [empresaNome, setEmpresaNome] = useState(''); // Estado para armazenar o nome da empresa

  useEffect(() => {
    // Carregar o nome da empresa
    axios.get(`http://127.0.0.1:8000/api/empresas/${empresaId}/`)
      .then(response => {
        setEmpresaNome(response.data.nome);
      })
      .catch(error => console.error('Erro ao carregar nome da empresa:', error));

    // Carregar as pastas
    axios.get(`http://127.0.0.1:8000/api/pastas/?empresa=${empresaId}`)
      .then(response => setPastas(response.data))
      .catch(error => console.error('Erro ao carregar pastas:', error));
  }, [empresaId]);

  const onDrop = (acceptedFiles, pastaId) => {
    const formData = new FormData();
    acceptedFiles.forEach(file => formData.append('arquivo', file));
    formData.append('pasta', pastaId);
    formData.append('nome', acceptedFiles[0].name);

    axios.post('http://127.0.0.1:8000/api/arquivos/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
      .then(() => {
        setSelectedPasta(null); // Recarrega a pasta selecionada
      })
      .catch(error => console.error('Erro ao upload:', error));
  };

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold text-indigo-200 mb-6">
        Pastas da Empresa {empresaNome ? `(${empresaNome})` : ''}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {['documentos_constitutivos', 'departamento_pessoal', 'xml', 'simples_nacional', 'outros'].map(tipo => (
          <motion.div
            key={tipo}
            className="bg-gray-800 rounded-lg shadow-md p-4 cursor-pointer hover:bg-gray-700 transition-all duration-300"
            onClick={() => setSelectedPasta(tipo)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <DocumentTextIcon className="h-8 w-8 text-indigo-400 mb-2" />
            <p className="text-gray-300 capitalize">{tipo.replace('_', ' ')}</p>
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
            {selectedPasta.replace('_', ' ')}
          </h3>
          <div {...getRootProps()} className="border-2 border-dashed border-indigo-500 p-6 text-center bg-gray-700 rounded-lg hover:bg-gray-600 transition-all duration-300">
            <input {...getInputProps()} />
            <p className="text-gray-400">Arraste e solte arquivos aqui ou clique para selecionar</p>
          </div>
          <div className="mt-4">
            <p className="text-gray-500">Arquivos serão listados aqui.</p>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default PastaManager;