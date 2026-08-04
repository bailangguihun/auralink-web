import React from 'react';
import Threads from './Threads';
import SpotlightCard from './SpotlightCard';

const Section1 = () => {
    return (
        <div className="section paper-bg">
            <Threads
                amplitude={5}
                distance={0}
                enableMouseInteraction={true}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.7 }}
            />
            <div className="content-wrapper" style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', height: '100%', paddingLeft: '10%', color: 'white' }}>
                <SpotlightCard className="custom-spotlight-card bg-black/40 backdrop-blur-md border border-amber-900/30 shadow-2xl" spotlightColor="rgba(213, 160, 33, 0.2)">
                    <h2 className="text-3xl md:text-4xl font-bold mb-6 bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">画音智链：传统与现代的交融</h2>
                    <p className="mb-8 text-gray-200 text-lg">
                        跨模态AI驱动的音画解码与生成平台，
                        让传统文化艺术以现代科技方式焕发新生。
                    </p>
                    <a href="/generate" className="inline-block bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-medium py-3 px-6 rounded-lg shadow-lg transition-all duration-300 border border-amber-800/50">
                        开始创作之旅
                    </a>
                </SpotlightCard>
            </div>
        </div>
    );
};

export default Section1;