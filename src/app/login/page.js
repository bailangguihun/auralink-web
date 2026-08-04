'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { motion } from 'framer-motion';
import { Card, CardBody, CardHeader, Divider, Button, Input, Tabs, Tab, Avatar } from "@heroui/react";
import { toast } from 'sonner';
import { IconEye, IconEyeOff, IconMail, IconUser, IconLock, IconUserCircle } from '@tabler/icons-react';
import Image from 'next/image';
import config from '@/config';

const API_BASE_URL = config.api.baseUrl;

// 动画变量
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerChildren = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState('login');
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: ''
  });
  const [registerForm, setRegisterForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    fullName: ''
  });
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isRegVisible, setIsRegVisible] = useState(false);
  const [isRegConfirmVisible, setIsRegConfirmVisible] = useState(false);
  const router = useRouter();

  // 统一的输入样式（恢复浮动标签动画并移除白色聚焦描边）
  const inputClassNames = {
    input: "!text-white placeholder:text-gray-400 [color:#fff] [-webkit-text-fill-color:#fff] caret-white",
    label:
      "text-gray-300 transition-all group-data-[focus=true]:-translate-y-3 group-data-[focus=true]:scale-85 group-data-[focus=true]:opacity-90 group-data-[focus=true]:text-amber-200 group-data-[filled=true]:-translate-y-3 group-data-[filled=true]:scale-85 group-data-[filled=true]:opacity-90",
    inputWrapper:
      "bg-white/[0.03] border border-amber-700/40 shadow-none transition-colors focus-within:!ring-0 focus-within:!outline-none data-[hover=true]:border-amber-500/55 data-[focus=true]:border-amber-500/70",
  };

  useEffect(() => {
    // 如果已登录，重定向到首页
    const token = localStorage.getItem('auth_token');
    if (token) {
      router.push('/');
    }
  }, [router]);

  const toggleVisibility = () => setIsVisible(!isVisible);
  const toggleRegVisibility = () => setIsRegVisible(!isRegVisible);
  const toggleRegConfirmVisibility = () => setIsRegConfirmVisible(!isRegConfirmVisible);

  // 检查注册通道是否开启
  const checkRegisterEnabled = () => {
    if (!config.auth.registerEnabled) {
      toast.error('用户注册服务暂未开放', {
        description: '平台当前处于注册服务维护期，建议稍后重试。如有特殊需求，请联系系统管理员获取协助，敬请谅解'
      });
      return false;
    }
    return true;
  };

  // 处理标签切换
  const handleTabChange = (key) => {
    if (key === 'register') {
      if (!checkRegisterEnabled()) {
        return; // 不切换到注册标签
      }
    }
    setActiveTab(key);
  };

  const handleLoginChange = (e) => {
    setLoginForm({
      ...loginForm,
      [e.target.name]: e.target.value
    });
  };

  const handleRegisterChange = (e) => {
    setRegisterForm({
      ...registerForm,
      [e.target.name]: e.target.value
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 保存token和用户信息
        localStorage.setItem('auth_token', data.data.token);
        localStorage.setItem('user_info', JSON.stringify({
          username: data.data.username,
          id: data.data.userId,
          fullName: data.data.fullName
        }));
        
        toast.success('登录成功', {
          description: '欢迎回到画音智链！'
        });
        
        // 跳转到首页
        router.push('/');
      } else {
        toast.error('登录失败', {
          description: data.message || "用户名或密码错误"
        });
      }
    } catch (error) {
      toast.error('登录失败', {
        description: "服务器连接错误，请稍后再试"
      });
    } finally {
      setLoading(false);
    }
  };

  // 处理注册
  const handleRegister = async (e) => {
    e.preventDefault();
    
    // 检查注册通道是否开启
    if (!checkRegisterEnabled()) {
      return;
    }
    
    // 验证两次密码是否一致
    if (registerForm.password !== registerForm.confirmPassword) {
      toast.error('密码不匹配', {
        description: "两次输入的密码不一致，请重新输入"
      });
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: registerForm.username,
          password: registerForm.password,
          email: registerForm.email,
          fullName: registerForm.fullName
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('注册成功', {
          description: '请使用新账号登录'
        });
        
        // 切换到登录标签
        setActiveTab('login');
        
        // 清空注册表单
        setRegisterForm({
          username: '',
          password: '',
          confirmPassword: '',
          email: '',
          fullName: ''
        });
      } else {
        toast.error('注册失败', {
          description: data.message || "注册时出现问题，请稍后再试"
        });
      }
    } catch (error) {
      toast.error('注册失败', {
        description: "服务器连接错误，请稍后再试"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
      <Navbar />
      
      {/* 背景装饰元素 */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[100px]"></div>
        <div className="absolute bottom-[10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-blue-500/10 blur-[100px]"></div>
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-purple-500/10 blur-[100px]"></div>
      </div>
      
      <div className="container mx-auto pt-24 pb-20 px-6 relative z-10">
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-md mx-auto"
        >
          <Card className="bg-black/40 backdrop-blur-lg border border-white/10 shadow-xl">
            <CardHeader className="flex flex-col gap-2 items-center">
              <Image 
                src="/icon.png" 
                alt="画音智链" 
                width={80} 
                height={80}
                className="rounded-full p-1 bg-gradient-to-br from-amber-400 to-amber-600"
              />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                画音智链
              </h2>
              <p className="text-gray-400 text-sm">
                跨模态AI驱动的音画解码与生成平台
              </p>
            </CardHeader>
            
            <Divider className="my-2" />
            
            <CardBody>
              <Tabs 
                fullWidth 
                aria-label="登录/注册选项" 
                selectedKey={activeTab}
                onSelectionChange={handleTabChange}
                classNames={{
                  base: "w-full",
                  tabList: "bg-black/25 p-1 rounded-lg border border-white/5",
                  cursor: "bg-gradient-to-r from-amber-500 to-amber-700 shadow-lg shadow-amber-500/20",
                  tab: "text-gray-400 data-[hover-unselected=true]:text-amber-200 data-[selected=true]:text-white",
                  tabContent: "font-medium group-data-[selected=true]:text-white"
                }}
            >
                <Tab key="login" title="登录">
                  <motion.form 
                    onSubmit={handleLogin}
                    variants={staggerChildren}
                    initial="hidden"
                    animate="visible"
                    className="space-y-4 py-4"
                  >
                    <motion.div variants={fadeIn}>
                      <Input
                        name="username"
                        label="用户名"
                        labelPlacement="inside"
                        placeholder="请输入用户名"
                        variant="bordered"
                        classNames={inputClassNames}
                        startContent={<IconUser size={18} className="text-gray-400" />}
                        value={loginForm.username}
                        onChange={handleLoginChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.div variants={fadeIn}>
                      <Input
                        name="password"
                        label="密码"
                        labelPlacement="inside"
                        placeholder="请输入密码"
                        variant="bordered"
                        classNames={inputClassNames}
                        startContent={<IconLock size={18} className="text-gray-400" />}
                        endContent={
                          <button type="button" onClick={toggleVisibility} className="text-gray-400">
                            {isVisible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                          </button>
                        }
                        type={isVisible ? "text" : "password"}
                        value={loginForm.password}
                        onChange={handleLoginChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.div variants={fadeIn} className="pt-2">
                <Button 
                  type="submit"
                        fullWidth
                  isLoading={loading}
                  isDisabled={loading}
                        color="warning"
                        variant="shadow"
                        className="bg-gradient-to-r from-amber-500 to-amber-700 !text-white [&_*]:!text-white"
                >
                  {loading ? '登录中...' : '登录'}
                </Button>
                    </motion.div>
                  </motion.form>
                </Tab>
                
                <Tab key="register" title="注册">
                  <motion.form 
                    onSubmit={handleRegister}
                    variants={staggerChildren}
                    initial="hidden"
                    animate="visible"
                    className="space-y-4 py-4"
                  >
                    <motion.div variants={fadeIn}>
                      <Input
                        name="username"
                        label="用户名"
                        labelPlacement="inside"
                        placeholder="请设置用户名"
                        variant="bordered"
                        classNames={inputClassNames}
                        startContent={<IconUser size={18} className="text-gray-400" />}
                        value={registerForm.username}
                        onChange={handleRegisterChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.div variants={fadeIn}>
                      <Input
                        name="fullName"
                        label="昵称"
                        labelPlacement="inside"
                        placeholder="请输入您的昵称"
                        variant="bordered"
                        classNames={inputClassNames}
                        startContent={<IconUserCircle size={18} className="text-gray-400" />}
                        value={registerForm.fullName}
                        onChange={handleRegisterChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.div variants={fadeIn}>
                      <Input
                        name="email"
                        type="email"
                        label="邮箱"
                        labelPlacement="inside"
                        placeholder="请输入有效的邮箱地址"
                        variant="bordered"
                        classNames={inputClassNames}
                        startContent={<IconMail size={18} className="text-gray-400" />}
                        value={registerForm.email}
                        onChange={handleRegisterChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.div variants={fadeIn}>
                      <Input
                        name="password"
                        label="密码"
                        labelPlacement="inside"
                        placeholder="请设置密码"
                        variant="bordered"
                        classNames={inputClassNames}
                        startContent={<IconLock size={18} className="text-gray-400" />}
                        endContent={
                          <button type="button" onClick={toggleRegVisibility} className="text-gray-400">
                            {isRegVisible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                          </button>
                        }
                        type={isRegVisible ? "text" : "password"}
                        value={registerForm.password}
                        onChange={handleRegisterChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.div variants={fadeIn}>
                      <Input
                        name="confirmPassword"
                        label="确认密码"
                        labelPlacement="inside"
                        placeholder="请再次输入密码"
                        variant="bordered"
                        classNames={inputClassNames}
                        startContent={<IconLock size={18} className="text-gray-400" />}
                        endContent={
                          <button type="button" onClick={toggleRegConfirmVisibility} className="text-gray-400">
                            {isRegConfirmVisible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                          </button>
                        }
                        type={isRegConfirmVisible ? "text" : "password"}
                        value={registerForm.confirmPassword}
                        onChange={handleRegisterChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.div variants={fadeIn} className="pt-2">
                <Button 
                  type="submit"
                        fullWidth
                        isLoading={loading}
                  isDisabled={loading}
                        color="warning"
                        variant="shadow"
                        className="bg-gradient-to-r from-amber-500 to-amber-700 !text-white [&_*]:!text-white"
                >
                        {loading ? '注册中...' : '注册'}
                </Button>
                    </motion.div>
                  </motion.form>
                </Tab>
              </Tabs>
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </main>
  );
} 
