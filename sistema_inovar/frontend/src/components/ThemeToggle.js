// src/components/ThemeToggle.js
import React, { useContext } from 'react';
import ThemeContext from '../context/ThemeContext';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';

const ThemeToggle = () => {
    const { theme, toggleTheme } = useContext(ThemeContext);

    return (
        <button
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-white"
            title={`Mudar para modo ${theme === 'light' ? 'escuro' : 'claro'}`}
        >
            {theme === 'light' ? (
                <MoonIcon className="h-4 w-4" />
            ) : (
                <SunIcon className="h-4 w-4" />
            )}
        </button>
    );
};

export default ThemeToggle;
