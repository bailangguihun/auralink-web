'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import GradientText from '../components/GradientText';
import { Button } from '@heroui/react';
import SplashCursor from '../components/SplashCursor';
import DecryptedText from '../components/DecryptedText';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import TermsOfServiceModal from '../components/TermsOfServiceModal';
import ContactModal from '../components/ContactModal';
import Image from 'next/image';

const videoSources = [
  '/videos/ink-wash-bg-1.MP4',
  '/videos/ink-wash-bg-2.MP4',
  '/videos/ink-wash-bg-3.MP4',
];

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const slideIn = {
  initial: { opacity: 0, x: -30 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

export default function HomePage() {
  const router = useRouter();
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  
  const handleExploreClick = () => {
    router.push('/detail');
  };
  
  const handleCreateClick = () => {
    router.push('/generate');
  };
  
  const handlePrivacyClick = (e) => {
    e.preventDefault();
    setIsPrivacyModalOpen(true);
  };
  
  const handleTermsClick = (e) => {
    e.preventDefault();
    setIsTermsModalOpen(true);
  };
  
  const handleContactClick = (e) => {
    e.preventDefault();
    setIsContactModalOpen(true);
  };
  
  const videoRef = useRef(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(() => {
    return Math.floor(Math.random() * videoSources.length);
  });
  
  useEffect(() => {
    const video = videoRef.current;
    
    const playRandomVideo = () => {
      const randomIndex = Math.floor(Math.random() * videoSources.length);
      setCurrentVideoIndex(randomIndex);
    };
    
    video.addEventListener('ended', playRandomVideo);
    return () => {
      video.removeEventListener('ended', playRandomVideo);
    };
  }, []);
  
  return (
    <div className="relative min-h-screen flex flex-col">
      <SplashCursor />
      <div className="fixed top-0 left-0 w-full h-full z-0">
        <video
          key={currentVideoIndex}
          ref={videoRef}
          muted
          loop={false}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        >
          <source src={videoSources[currentVideoIndex]} type="video/mp4" />
          您的浏览器不支持视频标签。
        </video>
        <div className="absolute top-0 left-0 w-full h-full bg-black opacity-40"></div>
      </div>
      
      <Navbar />
      
      <main className="relative flex-grow flex flex-col justify-center items-center text-center text-white z-10"
        style={{ pointerEvents: 'none' }}
      >
        <div style={{ pointerEvents: 'auto' }} className="max-w-4xl px-6">
          <motion.div
            variants={fadeIn} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.5 }}
            className="mb-6"
          >
            <GradientText
              colors={["#f3d19c", "#d5a021", "#f3d19c", "#d5a021", "#f3d19c"]}
              animationSpeed={10}
              showBorder={false}
              className="text-4xl md:text-8xl font-semibold"
            >
              画音智链
            </GradientText>
          </motion.div>
          
          <motion.div
            className="flex justify-center mb-2"
            variants={fadeIn} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.5 }}
            transition={{ delay: 0.1 }}
          >
            <div className="h-0.5 w-24 bg-gradient-to-r from-transparent via-amber-400 to-transparent"></div>
          </motion.div>
          
          <motion.p
            className="text-lg md:text-2xl mb-12 text-gray-100"
            variants={fadeIn} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.5 }}
            transition={{ delay: 0.2 }}
          >
            <DecryptedText
              text="跨模态AI驱动的国粹基因解码与生成平台"
              speed={100}
              maxIterations={20}
              animateOn="view"
              revealDirection="start"
            />
            <br /> 
            <DecryptedText
              text="以科技之笔，绘传统之韵，闻当代之声"
              speed={120}
              maxIterations={20}
              animateOn="view"
              revealDirection="start"
            />
          </motion.p>
          
          <motion.div
            className="flex flex-col md:flex-row justify-center items-center gap-4"
            variants={fadeIn} initial="initial" whileInView="animate" viewport={{ once: true, amount: 0.5 }}
            transition={{ delay: 0.4 }}
          >
            <Button 
              color="primary" 
              size="lg" 
              variant="shadow" 
              onClick={handleExploreClick}
              className="bg-amber-600 hover:bg-amber-700 border-amber-800 min-w-[180px]"
            >
              了解详情
            </Button>
            <Button 
              color="secondary" 
              size="lg" 
              variant="bordered" 
              onClick={handleCreateClick}
              className="border-amber-400 text-amber-300 hover:bg-amber-900/20 min-w-[180px]"
            >
              开始创作
            </Button>
          </motion.div>
        </div>
      </main>
      
      <footer className="relative z-10 bg-black/60 backdrop-blur-sm text-gray-300 py-6 text-center border-t border-amber-900/30">
        <p>© 2025 画音智链. 保留所有权利.</p>
        <div className="mt-2">
          <a href="#" className="text-amber-400/70 hover:text-amber-400 text-sm mx-2 cursor-pointer">联系我们</a> |
          <a href="#" onClick={handleTermsClick} className="text-amber-400/70 hover:text-amber-400 text-sm mx-2 cursor-pointer">使用条款</a> |
          <a href="#" onClick={handlePrivacyClick} className="text-amber-400/70 hover:text-amber-400 text-sm mx-2 cursor-pointer">隐私政策</a>
        </div>
      </footer>
      
      <PrivacyPolicyModal 
        isOpen={isPrivacyModalOpen} 
        onClose={() => setIsPrivacyModalOpen(false)} 
      />
      
      <TermsOfServiceModal 
        isOpen={isTermsModalOpen} 
        onClose={() => setIsTermsModalOpen(false)} 
      />
      
      <ContactModal 
        isOpen={isContactModalOpen} 
        onClose={() => setIsContactModalOpen(false)} 
      />
    </div>
  );
}