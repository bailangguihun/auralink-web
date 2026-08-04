import React from 'react';
import Aurora from './Aurora';
import SpotlightCard from './SpotlightCard';

const Section3 = () => {
    return (
        <div className="section" style={{
            position: 'relative',
            width: '100vw',
            height: '100vh',
            backgroundColor: '#0c0c0e',
            overflow: 'hidden'
        }}>
            <Aurora
                colorStops={["#d36c6c", "#ecc46c", "#6095b3"]}
                blend={0.8}
                amplitude={1.5}
                speed={0.6}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 20
                }}
            />
            <div className="content-wrapper" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                width: '100%',
                color: 'white'
            }}>
                <SpotlightCard className="custom-spotlight-card bg-black/40 backdrop-blur-md border border-amber-900/30 shadow-2xl" spotlightColor="rgba(213, 160, 33, 0.2)">
                    <h2 className="text-3xl md:text-4xl font-bold mb-6 bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">跨模态生成引擎</h2>
                    <p className="mb-8 text-gray-200 text-lg">
                        融合音乐与视觉的深度学习模型，
                        实现声音与图像的双向转化，
                        赋予艺术创作全新的可能性。
                    </p>
                    <div className="flex gap-3 flex-wrap">
                        <a href="/generate" className="inline-block bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-medium py-3 px-6 rounded-lg shadow-lg transition-all duration-300 border border-amber-800/50">
                            开始音画创作
                        </a>
                        <a href="/poetry-appreciation" className="inline-block bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3 px-6 rounded-lg shadow-lg transition-all duration-300 border border-blue-800/50">
                            知识图谱浏览
                        </a>
                    </div>
                </SpotlightCard>
            </div>
        </div>
    );
};

export default Section3;