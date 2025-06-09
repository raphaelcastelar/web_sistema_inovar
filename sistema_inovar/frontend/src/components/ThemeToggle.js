// src/components/ThemeToggle.js
import React, { useContext } from 'react';
import ThemeContext from '../context/ThemeContext';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';

const ThemeToggle = () => {
    const { theme, toggleTheme } = useContext(ThemeContext);

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-full text-indigo-300 hover:text-white hover:bg-indigo-700/50 transition-colors"
            title={`Mudar para modo ${theme === 'light' ? 'escuro' : 'claro'}`}
        >
            {theme === 'light' ? (
                <MoonIcon className="h-6 w-6" />
            ) : (
                <SunIcon className="h-6 w-6" />
            )}
        </button>
    );
};

export default ThemeToggle;