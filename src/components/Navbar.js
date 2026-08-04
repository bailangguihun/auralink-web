import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

// 添加JWT令牌验证功能
const isTokenValid = (token) => {
  if (!token) return false;
  
  try {
    // 解析JWT令牌（不需要密钥来验证有效期）
    const base64Url = token.split('.')[1];
    if (!base64Url) return false;
    
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // 安全的base64解码，适用于浏览器和Node.js环境
    let jsonPayload;
    if (typeof window !== 'undefined') {
      // 浏览器环境
      try {
        jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join('')
        );
      } catch (e) {
        return false;
      }
    } else {
      // Node.js环境
      try {
        const buff = Buffer.from(base64, 'base64');
        jsonPayload = buff.toString('utf-8');
      } catch (e) {
        return false;
      }
    }

    const { exp } = JSON.parse(jsonPayload);
    
    // 检查令牌是否过期
    return exp * 1000 > Date.now();
  } catch (error) {
    return false;
  }
};

const Navbar = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // 检查用户登录状态
        const token = localStorage.getItem('auth_token');
        const user = localStorage.getItem('user_info');
        
        if (token && user && isTokenValid(token)) {
            try {
                const userInfo = JSON.parse(user);
                setIsLoggedIn(true);
                setUsername(userInfo.username || '用户');
                setFullName(userInfo.fullName || userInfo.username || '用户');
            } catch (error) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_info');
            }
        } else if (token && !isTokenValid(token)) {
            // 令牌无效或已过期，清除登录状态
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_info');
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_info');
        setIsLoggedIn(false);
        setUsername('');
        setFullName('');
        setMenuOpen(false);
        router.push('/');
    };

    const toggleMenu = () => {
        setMenuOpen(!menuOpen);
    };

    // 点击页面其他地方时关闭菜单
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuOpen && !event.target.closest('.user-menu')) {
                setMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [menuOpen]);

    return (
        <header className="fixed top-0 left-0 right-0 z-[100] bg-black/30 backdrop-blur-md py-4 border-b border-amber-900/30">
            <div className="container mx-auto px-6 flex justify-between items-center">
                <Link href="/" className="flex items-center gap-2">
                    <div className="relative w-8 h-8">
                        <Image 
                            src="/icon.png"
                            alt="画音智链"
                            width={32}
                            height={32}
                            className="rounded-full"
                        />
                    </div>
                    <span className="text-xl font-bold bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">画音智链</span>
                </Link>
                
                <nav className="hidden md:flex items-center space-x-1">
                    <Link href="/" className="text-gray-300 hover:text-amber-300 px-4 py-2 rounded-md transition-colors duration-200">首页</Link>
                    <Link href="/detail" className="text-gray-300 hover:text-amber-300 px-4 py-2 rounded-md transition-colors duration-200">介绍</Link>
                    <Link href="/generate" className="text-gray-300 hover:text-amber-300 px-4 py-2 rounded-md transition-colors duration-200">在线生成</Link>
                    <Link href="/painting-appreciation" className="text-gray-300 hover:text-amber-300 px-4 py-2 rounded-md transition-colors duration-200">国画数据库</Link>
                    <Link href="/poetry-appreciation" className="text-gray-300 hover:text-amber-300 px-4 py-2 rounded-md transition-colors duration-200">诗词数据库</Link>
                    
                    {isLoggedIn ? (
                        <div className="relative user-menu ml-2">
                            <button 
                                className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-amber-300 border border-amber-800/50 rounded-full bg-black/20 hover:bg-black/40 transition-all duration-200"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMenu();
                                }}
                            >
                                <div className="w-6 h-6 bg-gradient-to-br from-amber-500 to-amber-700 rounded-full flex items-center justify-center text-xs text-white">
                                    {fullName.charAt(0).toUpperCase()}
                                </div>
                                <span className="truncate max-w-[100px]">{fullName}</span>
                                <span className="text-xs ml-1">{menuOpen ? '▲' : '▼'}</span>
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-black/80 backdrop-blur-md rounded-md shadow-lg py-1 z-[101] border border-amber-900/30">
                                    <Link 
                                        href="/user" 
                                        className="block px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300 transition-colors duration-200"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        用户中心
                                    </Link>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleLogout();
                                        }}
                                        className="block w-full text-left px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300 transition-colors duration-200"
                                    >
                                        退出登录
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link 
                            href="/login" 
                            className="px-4 py-2 border border-amber-600/60 text-amber-400 hover:text-amber-300 rounded-full bg-black/20 hover:bg-black/40 transition-all duration-200 ml-2"
                        >
                            登录/注册
                        </Link>
                    )}
                </nav>
                
                <div className="md:hidden">
                    <button 
                        className="text-amber-400 hover:text-amber-300 p-2"
                        onClick={toggleMenu}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                        </svg>
                    </button>
                    
                    {menuOpen && (
                        <div className="absolute top-full right-0 w-48 bg-black/80 backdrop-blur-md mt-1 rounded-md shadow-lg py-1 z-[101] border border-amber-900/30 mr-6">
                            <Link 
                                href="/" 
                                className="block px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300"
                                onClick={() => setMenuOpen(false)}
                            >
                                首页
                            </Link>
                            <Link 
                                href="/detail" 
                                className="block px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300"
                                onClick={() => setMenuOpen(false)}
                            >
                                介绍
                            </Link>
                            <Link 
                                href="/generate" 
                                className="block px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300"
                                onClick={() => setMenuOpen(false)}
                            >
                                在线生成
                            </Link>
                            <Link 
                                href="/painting-appreciation" 
                                className="block px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300"
                                onClick={() => setMenuOpen(false)}
                            >
                                国画数据库
                            </Link>
                            <Link 
                                href="/poetry-appreciation" 
                                className="block px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300"
                                onClick={() => setMenuOpen(false)}
                            >
                                诗词数据库
                            </Link>
                            
                            {isLoggedIn ? (
                                <>
                                    <div className="border-t border-amber-900/30 my-1"></div>
                                    <Link 
                                        href="/user" 
                                        className="block px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300"
                                        onClick={() => setMenuOpen(false)}
                                    >
                                        用户中心
                                    </Link>
                                    <button 
                                        onClick={handleLogout}
                                        className="block w-full text-left px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300"
                                    >
                                        退出登录
                                    </button>
                                </>
                            ) : (
                                <Link 
                                    href="/login" 
                                    className="block px-4 py-2 text-gray-300 hover:bg-amber-900/20 hover:text-amber-300"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    登录/注册
                                </Link>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Navbar;