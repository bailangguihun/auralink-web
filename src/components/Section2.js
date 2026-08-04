import React from 'react';
import GridMotion from './GridMotion';
import SpotlightCard from './SpotlightCard';

const Section2 = () => {
    const items = [
        '/images/guohua (1).png',
        '/images/guohua (2).png',
        '/images/guohua (3).png',
        '/images/guohua (4).png',
        '/images/guohua (5).png',
        '/images/guohua (6).png',
        '/images/guohua (7).png',
        '/images/guohua (8).png',
        '/images/guohua (9).png',
        '/images/guohua (10).png',
        '/images/guohua (11).png',
        '/images/guohua (12).png',
        '/images/guohua (13).png',
        '/images/guohua (14).png',
        '/images/guohua (15).png',
        '/images/guohua (16).png',
        '/images/guohua (17).png',
        '/images/guohua (18).png',
        '/images/guohua (19).png',
        '/images/guohua (20).png',
        '/images/guohua (21).png',
        '/images/guohua (22).png',
        '/images/guohua (23).png',
        '/images/guohua (24).png',
        '/images/guohua (25).png',
        '/images/guohua (26).png',
        '/images/guohua (27).png',
        '/images/guohua (28).png',
    ];

    return (
        <div className="section ink-wash-bg">
            <GridMotion items={items} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, opacity: 0.85 }} />
            <div className="content-wrapper" style={{  position: 'absolute', top: 0, left: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '100%', paddingRight: '10%', color: 'white', textAlign: 'right' }}>
                <SpotlightCard className="custom-spotlight-card bg-black/40 backdrop-blur-md border border-amber-900/30 shadow-2xl" spotlightColor="rgba(213, 160, 33, 0.2)">
                    <h2 className="text-3xl md:text-4xl font-bold mb-6 bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">丰富的艺术基因库</h2>
                    <p className="mb-8 text-gray-200 text-lg">
                        汇聚传统与现代艺术资源，
                        为AI模型提供跨模态学习的基础，
                        促进音画互生与艺术创新。
                    </p>
                    <a href="/painting-appreciation" className="inline-block bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-medium py-3 px-6 rounded-lg shadow-lg transition-all duration-300 border border-amber-800/50">
                        探索艺术基因
                    </a>
                </SpotlightCard>
            </div>
        </div>
    );
};

export default Section2;