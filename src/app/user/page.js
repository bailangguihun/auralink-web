'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { Card, CardBody, CardHeader, Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip, Divider, Spinner, Pagination, Select, SelectItem, Input } from "@heroui/react";
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import ReactPlayer from 'react-player';
import Image from 'next/image';
import { IconHistory, IconEye, IconDownload, IconClock, IconCpu, IconCheck, IconX, IconFileText, IconMusic, IconPhoto, IconSearch, IconFilter } from '@tabler/icons-react';
import config from '@/config';
import ImagePreviewModal from '@/components/ImagePreviewModal';

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

// 任务类型映射
const TASK_TYPE_MAP = {
  'TEXT_TO_IMAGE': { name: '文生图', icon: IconPhoto, color: 'success' },
  'TEXT_TO_MUSIC': { name: '文生音', icon: IconMusic, color: 'secondary' },
  'IMAGE_TO_TEXT': { name: '图生文', icon: IconFileText, color: 'primary' },
  'IMAGE_TO_MUSIC': { name: '图生音', icon: IconMusic, color: 'warning' },
  'MUSIC_TO_TEXT': { name: '音生文', icon: IconFileText, color: 'danger' },
  'IMAGE_TO_IMAGE': { name: '图生图', icon: IconPhoto, color: 'default' },
  'TEXT_TO_TEXT': { name: '文生文', icon: IconFileText, color: 'default' }
};

// 认证请求函数
const authenticatedFetch = async (url, options = {}) => {
  const token = localStorage.getItem('auth_token');
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    window.location.href = '/login';
    throw new Error('登录已过期，请重新登录');
  }
  
  return response;
};

export default function UserCenterPage() {
  const [userInfo, setUserInfo] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [taskTypeFilter, setTaskTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewImage, setPreviewImage] = useState({ src: '', alt: '' });
  const router = useRouter();
  const {isOpen, onOpen, onClose} = useDisclosure();

  // 获取用户历史记录
  const fetchLogs = async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setLogsLoading(true);
      }
      
      // 构建查询参数
      const params = new URLSearchParams({
        page: currentPage.toString(),
        size: pageSize.toString()
      });
      
      if (taskTypeFilter) {
        params.append('type', taskTypeFilter);
      }
      
      const response = await authenticatedFetch(`${API_BASE_URL}/user/logs?${params}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.data) {
          const pageData = data.data;
          setLogs(pageData.content || []);
          setTotalPages(pageData.totalPages || 0);
        } else {
          toast.error(data.message || "无法获取历史记录");
        }
      } else {
        toast.error(`请求失败: ${response.status}`);
      }
    } catch (error) {
      console.error('获取历史记录失败:', error);
      toast.error("获取历史记录失败，请稍后再试");
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setLogsLoading(false);
      }
    }
  };

  // 初次加载用户信息和数据
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userInfoStr = localStorage.getItem('user_info');
    
    if (!token || !userInfoStr) {
      toast.warning("请先登录后再访问用户中心");
      router.push('/login');
      return;
    }

    try {
      const parsedUserInfo = JSON.parse(userInfoStr);
      setUserInfo(parsedUserInfo);
    } catch (error) {
      toast.error("用户信息解析失败，请重新登录");
      router.push('/login');
      return;
    }

    // 初次加载历史记录
    fetchLogs(true);
  }, [router]);

  // 筛选条件变化时重新获取数据
  useEffect(() => {
    if (userInfo) {
      fetchLogs(false);
    }
  }, [currentPage, pageSize, taskTypeFilter]);

  // 格式化日期显示
  const formatDate = (dateValue) => {
    if (!dateValue) return '未知时间';
    
    let date;
    
    // 处理数组格式的日期 [year, month, day, hour, minute, second, nanosecond]
    if (Array.isArray(dateValue)) {
      const [year, month, day, hour, minute, second] = dateValue;
      date = new Date(year, month - 1, day, hour, minute, second);
    } else {
      date = new Date(dateValue);
    }
    
    if (isNaN(date.getTime())) {
      return '日期无效';
    }
    
    return date.toLocaleString('zh-CN', {
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  // 获取任务类型信息
  const getTaskTypeInfo = (taskType) => {
    return TASK_TYPE_MAP[taskType] || { 
      name: taskType || '未知类型', 
      icon: IconFileText, 
      color: 'default' 
    };
  };

  // 格式化处理时间
  const formatProcessingTime = (timeMs) => {
    if (!timeMs) return '未知';
    if (timeMs < 1000) return `${timeMs}ms`;
    return `${(timeMs / 1000).toFixed(1)}s`;
  };

  // 特殊：画音智链-墨韵弦思（内置后端逻辑）
  const isMoyinXiansiBuiltIn = (log) => log?.apiSource === '画音智链-墨韵弦思';

  const renderMoyinXiansiInput = (log) => {
    const fileName = log?.imageUrl ? log.imageUrl.split('/').pop() : '';
    const previewUrl = fileName ? `${API_BASE_URL}/files/${fileName}` : null;

    if (previewUrl) {
      return (
        <div className="bg-black/30 rounded-lg p-4 border border-amber-700/20">
          <div
            className="relative w-full max-w-md mx-auto cursor-zoom-in"
            onClick={() => setPreviewImage({ src: previewUrl, alt: '输入图像' })}
          >
            <div className="aspect-square relative rounded-lg overflow-hidden">
              <Image
                src={previewUrl}
                alt="输入图像"
                fill
                className="object-cover"
              />
            </div>
          </div>
          <p className="text-gray-400 text-xs mt-2 text-center">
            输入图像
          </p>
        </div>
      );
    }

    return <span className="text-gray-400">无输入图像</span>;
  };

  const renderMoyinXiansiOutput = (log, { isModal = false } = {}) => {
    const text = log?.description || log?.outputData || '无生成描述';

    if (isModal) {
      return (
        <div className="bg-black/30 rounded-lg p-4 border border-amber-700/20">
          <div className="text-white text-sm leading-relaxed whitespace-pre-wrap break-words">
            {text}
          </div>
          <p className="text-gray-400 text-xs mt-2">文本长度: {text.length} 字符</p>
        </div>
      );
    }

    return (
      <div className="max-w-md text-sm text-gray-300 line-clamp-3 bg-black/20 rounded p-2 border border-amber-700/20">
        {text.length > 100 ? `${text.substring(0, 100)}...` : text}
      </div>
    );
  };

  // 解析JSON数据
  const parseJSONSafely = (jsonStr) => {
    try {
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  };

  // 打开详情弹窗
  const openDetailModal = (log) => {
    setSelectedLog(log);
    onOpen();
  };

  // 下载文件
  const downloadFile = (relativePath, fileName) => {
    if (!relativePath) {
      toast.error("文件路径不存在");
      return;
    }
    
    const fileUrl = `${API_BASE_URL}/files/${relativePath}`;
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName || '下载文件';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 文本文件内容组件
  const TextFilePreview = ({ filePath, isModal = false }) => {
    const [textContent, setTextContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
      const fetchTextContent = async () => {
        try {
          setLoading(true);
          const response = await fetch(`${API_BASE_URL}/files/${filePath}`);
          if (response.ok) {
            const text = await response.text();
            setTextContent(text);
          } else {
            setError('无法加载文件内容');
          }
        } catch (err) {
          setError('加载文件时出错');
        } finally {
          setLoading(false);
        }
      };

      if (filePath) {
        fetchTextContent();
      }
    }, [filePath]);

    if (loading) {
      return (
        <div className="flex items-center justify-center p-4">
          <Spinner size="sm" color="warning" />
          <span className="text-gray-400 ml-2">加载中...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-red-400 text-sm p-2">
          {error}
        </div>
      );
    }

    if (isModal) {
      return (
        <div className="bg-black/30 rounded-lg p-4 border border-amber-700/20 max-h-96 overflow-y-auto">
          <pre className="text-gray-300 text-sm whitespace-pre-wrap break-words">
            {textContent}
          </pre>
        </div>
      );
    }

    return (
      <div className="max-w-md text-sm text-gray-300 line-clamp-3 bg-black/20 rounded p-2 border border-amber-700/20">
        {textContent.length > 100 ? `${textContent.substring(0, 100)}...` : textContent}
      </div>
    );
  };

  // 渲染输入内容
  const renderInputContent = (inputData) => {
    if (!inputData || typeof inputData !== 'object') {
      return <span className="text-gray-400">无输入内容</span>;
    }

    // 提取输入内容，优先使用 actualInput，其次使用 prompt
    const inputContent = inputData.actualInput || inputData.prompt;
    
    if (!inputContent) {
      return <span className="text-gray-400">无输入内容</span>;
    }

    // 判断是否为URL（图片）
    const isImageUrl = typeof inputContent === 'string' && 
      (inputContent.startsWith('http') || inputContent.startsWith('/')) &&
      (inputContent.includes('.jpg') || inputContent.includes('.jpeg') || 
       inputContent.includes('.png') || inputContent.includes('.webp') ||
       inputContent.includes('/files/'));

    if (isImageUrl) {
      const fullImageUrl = inputContent.startsWith('http') ? inputContent : `${API_BASE_URL}${inputContent.startsWith('/') ? '' : '/'}${inputContent}`;
      return (
        <div className="bg-black/30 rounded-lg p-4 border border-amber-700/20">
          <div
            className="relative w-full max-w-md mx-auto cursor-zoom-in"
            onClick={() => setPreviewImage({ src: fullImageUrl, alt: '输入图像' })}
          >
            <div className="aspect-square relative rounded-lg overflow-hidden">
              <Image
                src={fullImageUrl}
                alt="输入图像"
                fill
                className="object-cover"
              />
            </div>
          </div>
          <p className="text-gray-400 text-xs mt-2 text-center">
            输入图像
          </p>
        </div>
      );
    } else {
      // 文本内容
      return (
        <div className="bg-black/30 rounded-lg p-4 border border-amber-700/20">
          <div className="text-white text-sm leading-relaxed whitespace-pre-wrap">
            {inputContent}
          </div>
          <p className="text-gray-400 text-xs mt-2">
            文本长度: {inputContent.length} 字符
          </p>
        </div>
      );
    }
  };

  // 渲染内容预览
  const renderContentPreview = (content, contentType, isModal = false) => {
    if (!content) return <span className="text-gray-400">无内容</span>;

    const getFileUrl = (filePath) => {
      if (filePath.startsWith('http')) return filePath;
      if (filePath.startsWith('/files/')) return `${API_BASE_URL}${filePath}`;
      return `${API_BASE_URL}/files/${filePath.replace(/^\/+/, '')}`;
    };
    
    if (typeof content === 'string') {
      if (contentType === 'audio' || content.includes('.mp3') || content.includes('.wav')) {
        return (
          <div className="w-full max-w-sm">
            <ReactPlayer
              url={getFileUrl(content)}
              width="100%"
              height="50px"
              controls={true}
              playing={false}
              config={{ file: { forceAudio: true } }}
            />
          </div>
        );
      } else if (contentType === 'image' || content.includes('.png') || content.includes('.jpg')) {
        const imageUrl = getFileUrl(content);
        return (
          <div
            className="relative w-24 h-24 rounded-lg overflow-hidden cursor-zoom-in"
            onClick={() => setPreviewImage({ src: imageUrl, alt: '生成的图片' })}
          >
            <Image
              src={imageUrl}
              alt="生成的图片"
              fill
              className="object-cover"
            />
          </div>
        );
      } else if (contentType === 'document' || content.includes('.txt') || content.includes('document/')) {
        // 渲染文本文件内容
        return <TextFilePreview filePath={content} isModal={isModal} />;
      }
    }
    
    // 文本内容
    if (typeof content === 'string') {
      return (
        <div className="max-w-md text-sm text-gray-300 line-clamp-3">
          {content.length > 100 ? `${content.substring(0, 100)}...` : content}
        </div>
      );
    }
    
    return <span className="text-gray-400">无效内容</span>;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
        <Navbar />
        {/* 背景装饰元素 */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[100px]"></div>
          <div className="absolute bottom-[10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-blue-500/10 blur-[100px]"></div>
        </div>
        <div className="container mx-auto pt-24 pb-20 px-6 flex justify-center items-center relative z-10">
          <div className="text-center">
            <Spinner size="lg" color="warning" />
            <p className="text-amber-400 mt-4">正在加载历史记录...</p>
          </div>
        </div>
      </main>
    );
  }

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
          className="mb-8 text-center"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-amber-600 bg-clip-text text-transparent mb-4">
            用户中心
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            查看您的AI生成历史记录，管理所有创作内容
          </p>
        </motion.div>

        <motion.div
          variants={staggerChildren}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* 用户信息卡片 */}
          <Card className="bg-black/40 backdrop-blur-md border border-amber-900/30 shadow-xl">
            <CardHeader>
              <h2 className="text-xl font-semibold text-amber-400">个人信息</h2>
            </CardHeader>
            <Divider />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">用户名</p>
                  <p className="text-white font-medium">{userInfo?.username || '未知用户'}</p>
                </div>
                {userInfo?.email && (
                  <div>
                    <p className="text-gray-400 text-sm">邮箱</p>
                    <p className="text-white font-medium">{userInfo.email}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-400 text-sm">总记录数</p>
                  <p className="text-amber-400 font-medium">{logs.length} 条</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* 筛选和搜索 */}
          <Card className="bg-black/40 backdrop-blur-md border border-amber-900/30 shadow-xl">
            <CardBody>
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="flex items-center gap-2">
                  <IconFilter size={20} className="text-amber-400" />
                  <span className="text-amber-400 font-medium">筛选条件</span>
                </div>
                
                <Select
                  placeholder="选择任务类型"
                  size="sm"
                  className="w-full sm:w-48"
                  selectedKeys={taskTypeFilter ? [taskTypeFilter] : []}
                  onSelectionChange={(keys) => {
                    const selectedKey = Array.from(keys)[0];
                    setTaskTypeFilter(selectedKey || '');
                    setCurrentPage(0);
                  }}
                  isDisabled={logsLoading}
                  classNames={{
                    base: "w-full",
                    trigger: [
                      "min-h-10 rounded-xl border border-amber-700/50",
                      "!bg-black/30 text-white",
                      "hover:!bg-black/30",
                      "data-[hover=true]:!bg-black/30",
                      "data-[open=true]:!bg-black/30",
                      "data-[focus=true]:!bg-black/30",
                      "data-[focus-visible=true]:!bg-black/30",
                      "data-[pressed=true]:!bg-black/30",
                      "hover:border-amber-500/70",
                      "data-[open=true]:border-amber-400",
                      "data-[focus=true]:border-amber-400",
                      "data-[focus-visible=true]:border-amber-400",
                      "transition-colors",
                    ].join(" "),
                    mainWrapper: "text-white",
                    innerWrapper: "text-white",
                    value: "!text-white data-[has-value=true]:!text-white",
                    selectorIcon: "text-white opacity-100",
                    listbox: "bg-black/90 text-white",
                    popoverContent: "bg-black/90 border border-amber-700/30 text-white",
                  }}
                  listboxProps={{
                    itemClasses: {
                      base: [
                        "rounded-medium",
                        "text-white",
                        "transition-opacity",
                        "data-[hover=true]:text-amber-300",
                        "data-[hover=true]:bg-amber-700/20",
                        "data-[selectable=true]:focus:bg-amber-700/30",
                        "data-[selected=true]:text-white",
                        "data-[pressed=true]:opacity-70",
                        "data-[focus-visible=true]:ring-amber-500",
                      ].join(" "),
                    }
                  }}
                  popoverProps={{
                    classNames: {
                      base: "before:bg-black/90",
                      content: "p-0 border-small border-amber-700/30 bg-black/90"
                    }
                  }}
                >
                  <SelectItem key="" value="" className="text-white">全部类型</SelectItem>
                  
                  <SelectItem key="TEXT_TO_IMAGE" value="TEXT_TO_IMAGE" className="text-white">
                    文生图
                  </SelectItem>
                  <SelectItem key="TEXT_TO_MUSIC" value="TEXT_TO_MUSIC" className="text-white">
                    文生音
                  </SelectItem>
                  <SelectItem key="IMAGE_TO_TEXT" value="IMAGE_TO_TEXT" className="text-white">
                    图生文
                  </SelectItem>
                  <SelectItem key="IMAGE_TO_MUSIC" value="IMAGE_TO_MUSIC" className="text-white">
                    图生音
                  </SelectItem>
                  <SelectItem key="IMAGE_TO_IMAGE" value="IMAGE_TO_IMAGE" className="text-white">
                    图生图
                  </SelectItem>
                  <SelectItem key="TEXT_TO_TEXT" value="TEXT_TO_TEXT" className="text-white">
                    文生文
                  </SelectItem>
                </Select>

                <Select
                  placeholder="每页条数"
                  size="sm"
                  className="w-full sm:w-32"
                  selectedKeys={[pageSize.toString()]}
                  onSelectionChange={(keys) => {
                    const selectedKey = Array.from(keys)[0];
                    setPageSize(parseInt(selectedKey));
                    setCurrentPage(0);
                  }}
                  isDisabled={logsLoading}
                  classNames={{
                    base: "w-full",
                    trigger: [
                      "min-h-10 rounded-xl border border-amber-700/50",
                      "!bg-black/30 text-white",
                      "hover:!bg-black/30",
                      "data-[hover=true]:!bg-black/30",
                      "data-[open=true]:!bg-black/30",
                      "data-[focus=true]:!bg-black/30",
                      "data-[focus-visible=true]:!bg-black/30",
                      "data-[pressed=true]:!bg-black/30",
                      "hover:border-amber-500/70",
                      "data-[open=true]:border-amber-400",
                      "data-[focus=true]:border-amber-400",
                      "data-[focus-visible=true]:border-amber-400",
                      "transition-colors",
                    ].join(" "),
                    mainWrapper: "text-white",
                    innerWrapper: "text-white",
                    value: "!text-white data-[has-value=true]:!text-white",
                    selectorIcon: "text-white opacity-100",
                    listbox: "bg-black/90 text-white",
                    popoverContent: "bg-black/90 border border-amber-700/30 text-white",
                  }}
                  listboxProps={{
                    itemClasses: {
                      base: [
                        "rounded-medium",
                        "text-white",
                        "transition-opacity",
                        "data-[hover=true]:text-amber-300",
                        "data-[hover=true]:bg-amber-700/20",
                        "data-[selectable=true]:focus:bg-amber-700/30",
                        "data-[selected=true]:text-white",
                        "data-[pressed=true]:opacity-70",
                        "data-[focus-visible=true]:ring-amber-500",
                      ].join(" "),
                    }
                  }}
                  popoverProps={{
                    classNames: {
                      base: "before:bg-black/90",
                      content: "p-0 border-small border-amber-700/30 bg-black/90"
                    }
                  }}
                >
                  <SelectItem key="5" value="5" className="text-white">5条</SelectItem>
                  <SelectItem key="10" value="10" className="text-white">10条</SelectItem>
                  <SelectItem key="20" value="20" className="text-white">20条</SelectItem>
                  <SelectItem key="50" value="50" className="text-white">50条</SelectItem>
                </Select>
              </div>
            </CardBody>
          </Card>

          {/* 历史记录列表 */}
          <Card className="bg-black/40 backdrop-blur-md border border-amber-900/30 shadow-xl">
            <CardHeader className="flex flex-row justify-between items-center">
              <h2 className="text-xl font-semibold text-amber-400 flex items-center gap-2">
                <IconHistory size={24} />
                生成历史记录
              </h2>
              {logs.length > 0 && (
                <Button
                  size="sm"
                  variant="flat"
                  color="warning"
                  onClick={() => router.push('/generate')}
                  className="bg-gradient-to-r from-amber-500/20 to-amber-600/20"
                >
                  新建任务
                </Button>
              )}
            </CardHeader>
            <Divider />
            <CardBody>
              {logsLoading ? (
                // 历史记录加载状态
                <div className="text-center py-16">
                  <Spinner size="lg" color="warning" />
                  <p className="text-amber-400 mt-4">正在加载历史记录...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-16">
                  <IconHistory size={64} className="text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">暂无历史记录</p>
                  <Button 
                    color="warning"
                    variant="shadow"
                    onClick={() => router.push('/generate')}
                    className="bg-gradient-to-r from-amber-500 to-amber-600"
                  >
                    开始创作
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {logs.map((log) => {
                    const taskInfo = getTaskTypeInfo(log.taskType);
                    const TaskIcon = taskInfo.icon;
                    const inputData = parseJSONSafely(log.inputData);
                    const outputData = parseJSONSafely(log.outputData);
                    const isMoyinXiansi = isMoyinXiansiBuiltIn(log);
                    
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-black/20 rounded-lg p-4 border border-amber-700/30 hover:border-amber-500/50 transition-colors cursor-pointer"
                        onClick={() => openDetailModal(log)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="flex items-center gap-3">
                              <TaskIcon size={24} className="text-amber-400" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <Chip
                                    size="sm"
                                    color={taskInfo.color}
                                    variant="flat"
                                    className="text-xs"
                                  >
                                    {taskInfo.name}
                                  </Chip>
                                  <Chip
                                    size="sm"
                                    color={log.success ? "success" : "danger"}
                                    variant="flat"
                                    startContent={log.success ? <IconCheck size={12} /> : <IconX size={12} />}
                                    className="text-xs"
                                  >
                                    {log.success ? "成功" : "失败"}
                                  </Chip>
                                </div>
                                <p className="text-white font-medium mt-1">
                                  {log.apiProvider || '未知提供商'} • {formatDate(log.createdAt)}
                                </p>
                                <p className="text-gray-400 text-sm">
                                  处理时间: {formatProcessingTime(log.processingTimeMs)}
                                </p>
                              </div>
                            </div>
                            
                            {/* 输出内容预览 */}
                            <div className="flex-1 max-w-md">
                              {isMoyinXiansi
                                ? renderMoyinXiansiOutput(log)
                                : (log.resultUrl && renderContentPreview(log.resultUrl, 'auto'))}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {isMoyinXiansi ? null : log.resultUrl && (
                              <Button
                                size="sm"
                                variant="flat"
                                color="secondary"
                                startContent={<IconDownload size={16} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadFile(log.resultUrl, `${taskInfo.name}_${log.id}`);
                                }}
                              >
                                下载
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="flat"
                              color="warning"
                              startContent={<IconEye size={16} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetailModal(log);
                              }}
                            >
                              详情
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardBody>
            
            {/* 分页 */}
            {totalPages > 1 && (
              <>
                <Divider />
                <CardBody className="pt-4">
                  <div className="flex justify-center">
                    <Pagination
                      total={totalPages}
                      page={currentPage + 1}
                      onChange={(page) => setCurrentPage(page - 1)}
                      color="warning"
                      variant="bordered"
                      showShadow
                      isDisabled={logsLoading}
                      classNames={{
                        wrapper: "gap-0 overflow-visible h-8",
                        item: [
                          "w-8 h-8 text-small rounded-none",
                          "bg-transparent text-white border border-white/80",
                          "data-[hover=true]:bg-amber-500/15",
                          "data-[hover=true]:text-amber-300",
                          "data-[hover=true]:border-amber-400",
                          "data-[focus=true]:bg-amber-500/15",
                          "data-[focus=true]:text-amber-300",
                          "data-[focus=true]:border-amber-400",
                          "transition-colors",
                        ].join(" "),
                        cursor: [
                          "w-8 h-8 text-small rounded-xl",
                          "text-black font-medium",
                          "bg-gradient-to-b from-amber-500 to-amber-600",
                          "border border-amber-400 shadow-lg",
                        ].join(" "),
                        prev: [
                          "text-white border border-white/80 bg-transparent",
                          "data-[hover=true]:bg-amber-500/15",
                          "data-[hover=true]:text-amber-300",
                          "data-[hover=true]:border-amber-400",
                        ].join(" "),
                        next: [
                          "text-white border border-white/80 bg-transparent",
                          "data-[hover=true]:bg-amber-500/15",
                          "data-[hover=true]:text-amber-300",
                          "data-[hover=true]:border-amber-400",
                        ].join(" "),
                      }}
                    />
                  </div>
                </CardBody>
              </>
            )}
          </Card>
        </motion.div>
      </div>

      {/* 详情弹窗 */}
      <Modal 
        isOpen={isOpen} 
        onClose={onClose}
        size="3xl"
        backdrop="blur"
        classNames={{
          base: "bg-black/90 border border-amber-700/30",
          header: "border-b border-amber-700/30",
          body: "py-6",
          footer: "border-t border-amber-700/30"
        }}
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="text-amber-400 text-lg">
            <div className="flex items-center gap-2">
              <IconFileText size={20} />
              任务详情信息
            </div>
          </ModalHeader>
          <ModalBody>
            {selectedLog && (
              <div className="space-y-6">
                {/* 基本信息 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-amber-400 font-medium mb-2">基本信息</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">任务ID:</span>
                        <span className="text-white">{selectedLog.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">任务类型:</span>
                        <Chip size="sm" color={getTaskTypeInfo(selectedLog.taskType).color} variant="flat">
                          {getTaskTypeInfo(selectedLog.taskType).name}
                        </Chip>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">API来源:</span>
                        <span className="text-white">{selectedLog.apiSource}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">API提供商:</span>
                        <span className="text-white">{selectedLog.apiProvider}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">创建时间:</span>
                        <span className="text-white">{formatDate(selectedLog.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-amber-400 font-medium mb-2">执行信息</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">执行状态:</span>
                        <Chip 
                          size="sm" 
                          color={selectedLog.success ? "success" : "danger"}
                          startContent={selectedLog.success ? <IconCheck size={12} /> : <IconX size={12} />}
                        >
                          {selectedLog.success ? "成功" : "失败"}
                        </Chip>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">处理时间:</span>
                        <span className="text-white">{formatProcessingTime(selectedLog.processingTimeMs)}</span>
                      </div>
                      {selectedLog.errorMessage && selectedLog.errorMessage.trim() && (
                        <div className="col-span-2">
                          <span className="text-red-400">错误信息:</span>
                          <p className="text-red-300 text-xs mt-1 break-words">{selectedLog.errorMessage}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Divider />

                {isMoyinXiansiBuiltIn(selectedLog) ? (
                  <>
                    {selectedLog.imageUrl && (
                      <div>
                        <p className="text-amber-400 font-medium mb-3">输入内容</p>
                        {renderMoyinXiansiInput(selectedLog)}
                      </div>
                    )}
                    <div>
                      <p className="text-amber-400 font-medium mb-3">生成结果</p>
                      {renderMoyinXiansiOutput(selectedLog, { isModal: true })}
                    </div>
                  </>
                ) : (
                  <>
                    {(() => {
                      const inputData = parseJSONSafely(selectedLog.inputData);
                      const hasInputData = inputData && 
                        (typeof inputData === 'object' && Object.keys(inputData).length > 0) &&
                        (inputData.actualInput || inputData.prompt);
                      
                      return hasInputData && (
                        <div>
                          <p className="text-amber-400 font-medium mb-3">输入内容</p>
                          {renderInputContent(inputData)}
                        </div>
                      );
                    })()}

                    {selectedLog.resultUrl && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-amber-400 font-medium">生成结果</p>
                          <Button
                            size="sm"
                            color="secondary"
                            variant="flat"
                            startContent={<IconDownload size={16} />}
                            onClick={() => downloadFile(selectedLog.resultUrl, `result_${selectedLog.id}`)}
                          >
                            下载文件
                          </Button>
                        </div>
                        <div className="bg-black/30 rounded-lg p-4 border border-amber-700/20">
                          {renderContentPreview(selectedLog.resultUrl, 'auto', true)}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {(() => {
                  const inputData = parseJSONSafely(selectedLog.inputData);
                  const hasInputData = inputData && 
                    (typeof inputData === 'string' ? inputData.trim() : true) &&
                    (typeof inputData === 'object' ? Object.keys(inputData).length > 0 : true) &&
                    !(Array.isArray(inputData) && inputData.length === 0);
                  
                  return hasInputData && (
                    <div>
                      <p className="text-amber-400 font-medium mb-3">输入参数</p>
                      <div className="bg-black/30 rounded-lg p-4 border border-amber-700/20">
                        <pre className="text-gray-300 text-sm whitespace-pre-wrap break-words">
                          {JSON.stringify(inputData, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const outputData = parseJSONSafely(selectedLog.outputData);
                  const hasOutputData = outputData && 
                    (typeof outputData === 'string' ? outputData.trim() : true) &&
                    (typeof outputData === 'object' ? Object.keys(outputData).length > 0 : true) &&
                    !(Array.isArray(outputData) && outputData.length === 0);
                  
                  return hasOutputData && (
                    <div>
                      <p className="text-amber-400 font-medium mb-3">输出数据</p>
                      <div className="bg-black/30 rounded-lg p-4 border border-amber-700/20">
                        <pre className="text-gray-300 text-sm whitespace-pre-wrap break-words">
                          {JSON.stringify(outputData, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const metadata = parseJSONSafely(selectedLog.metadata);
                  const hasMetadata = metadata && 
                    (typeof metadata === 'object' && !Array.isArray(metadata)) &&
                    Object.keys(metadata).length > 0;
                  
                  return hasMetadata && (
                    <div>
                      <p className="text-amber-400 font-medium mb-3">元数据</p>
                      <div className="bg-black/30 rounded-lg p-4 border border-amber-700/20">
                        <pre className="text-gray-300 text-sm whitespace-pre-wrap break-words">
                          {JSON.stringify(metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="flat" 
              onPress={onClose}
              className="text-gray-400"
            >
              关闭
            </Button>
            {selectedLog?.resultUrl && (
              <Button 
                color="warning" 
                onPress={() => downloadFile(selectedLog.resultUrl, `result_${selectedLog.id}`)}
                className="bg-gradient-to-r from-amber-500 to-amber-600"
                startContent={<IconDownload size={16} />}
              >
                下载结果
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ImagePreviewModal
        src={previewImage.src}
        alt={previewImage.alt}
        onClose={() => setPreviewImage({ src: '', alt: '' })}
      />
    </main>
  );
} 
