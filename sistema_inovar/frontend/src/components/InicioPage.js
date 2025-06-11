// src/pages/InicioPage.js
import React from 'react';
import { motion } from 'framer-motion';

const InicioPage = () => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="p-6 md:p-8"
        >
            <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-4">
                Página Inicial
            </h1>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-10 mt-6 text-center">
                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200">
                    Bem-vindo ao Sistema Inovar!
                </h2>
                <p className="mt-2 text-gray-500 dark:text-gray-400">
                    Este será o seu Dashboard principal. Em breve, adicionaremos gráficos e informações importantes aqui.
                </p>
            </div>
        </motion.div>
    );
};

export default InicioPage;