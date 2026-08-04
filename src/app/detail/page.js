'use client';

import React, { useEffect } from 'react';
import Section1 from '@/components/Section1';
import Section2 from '@/components/Section2';
import Section3 from '@/components/Section3';
import Navbar from '@/components/Navbar';
import './page.css';

const App = () => {
    useEffect(() => {
        document.body.classList.add('detail-page-active');
        return () => {
            document.body.classList.remove('detail-page-active');
        };
    }, []);

    return (
        <div className="detail-page">
            <Navbar />
            <div className="app-container">
                <Section1 className="section" />
                <Section2 className="section" />
                <Section3 className="section" />
            </div>
        </div>
    );
};

export default App;