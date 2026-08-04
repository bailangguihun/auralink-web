import React, { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Card, CardBody } from '@heroui/react';
import { IconMail, IconPhone, IconMapPin, IconSend, IconBrandWechat, IconBrandQq } from '@tabler/icons-react';
import { toast } from 'sonner';

const ContactModal = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.message) {
      toast.error('请填写所有必填字段');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // 模拟提交
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast.success('消息发送成功！我们会尽快回复您。');
      setFormData({ name: '', email: '', subject: '', message: '' });
      onClose();
    } catch (error) {
      toast.error('发送失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="4xl"
      scrollBehavior="inside"
      classNames={{
        base: "bg-black/95 backdrop-blur-md border border-amber-900/30",
        header: "border-b border-amber-900/30",
        body: "py-6",
        footer: "border-t border-amber-900/30"
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <IconMail className="w-6 h-6 text-amber-400" />
            <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
              联系我们
            </h2>
          </div>
          <p className="text-sm text-gray-400 font-normal">
            我们很乐意听到您的声音
          </p>
        </ModalHeader>
        
        <ModalBody>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 联系信息 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-amber-300 mb-4">联系方式</h3>
              
              <Card className="bg-amber-900/20 border border-amber-900/30">
                <CardBody className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <IconMail className="w-5 h-5 text-amber-400" />
                    <div>
                      <p className="text-sm font-medium text-amber-200">邮箱</p>
                      <p className="text-sm text-gray-300">contact@huiyinspace.com</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 mb-3">
                    <IconPhone className="w-5 h-5 text-amber-400" />
                    <div>
                      <p className="text-sm font-medium text-amber-200">电话</p>
                      <p className="text-sm text-gray-300">+86-400-123-4567</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <IconMapPin className="w-5 h-5 text-amber-400" />
                    <div>
                      <p className="text-sm font-medium text-amber-200">地址</p>
                      <p className="text-sm text-gray-300">中国·北京市朝阳区科技园区</p>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card className="bg-amber-900/20 border border-amber-900/30">
                <CardBody className="p-4">
                  <h4 className="text-sm font-medium text-amber-200 mb-3">社交媒体</h4>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <IconBrandWechat className="w-5 h-5 text-green-400" />
                      <span className="text-sm text-gray-300">绘音空间</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <IconBrandQq className="w-5 h-5 text-blue-400" />
                      <span className="text-sm text-gray-300">123456789</span>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 border border-amber-700/50">
                <CardBody className="p-4">
                  <h4 className="text-sm font-medium text-amber-200 mb-2">工作时间</h4>
                  <div className="space-y-1 text-sm text-gray-300">
                    <p>周一至周五：9:00 - 18:00</p>
                    <p>周六至周日：10:00 - 16:00</p>
                    <p className="text-xs text-amber-400 mt-2">节假日可能有所调整</p>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* 反馈表单 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-amber-300 mb-4">发送消息</h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="姓名"
                  placeholder="请输入您的姓名"
                  value={formData.name}
                  onValueChange={(value) => handleInputChange('name', value)}
                  isRequired
                  classNames={{
                    base: "max-w-full",
                    mainWrapper: "h-full",
                    input: "text-small",
                    inputWrapper: "h-full font-normal text-default-500 bg-black/20 border-amber-900/30 data-[hover=true]:border-amber-700/50 group-data-[focus=true]:border-amber-600",
                  }}
                />
                
                <Input
                  label="邮箱"
                  placeholder="请输入您的邮箱地址"
                  type="email"
                  value={formData.email}
                  onValueChange={(value) => handleInputChange('email', value)}
                  isRequired
                  classNames={{
                    base: "max-w-full",
                    mainWrapper: "h-full",
                    input: "text-small",
                    inputWrapper: "h-full font-normal text-default-500 bg-black/20 border-amber-900/30 data-[hover=true]:border-amber-700/50 group-data-[focus=true]:border-amber-600",
                  }}
                />
                
                <Input
                  label="主题"
                  placeholder="请输入消息主题（可选）"
                  value={formData.subject}
                  onValueChange={(value) => handleInputChange('subject', value)}
                  classNames={{
                    base: "max-w-full",
                    mainWrapper: "h-full",
                    input: "text-small",
                    inputWrapper: "h-full font-normal text-default-500 bg-black/20 border-amber-900/30 data-[hover=true]:border-amber-700/50 group-data-[focus=true]:border-amber-600",
                  }}
                />
                
                <Textarea
                  label="消息内容"
                  placeholder="请详细描述您的问题或建议..."
                  value={formData.message}
                  onValueChange={(value) => handleInputChange('message', value)}
                  isRequired
                  minRows={4}
                  classNames={{
                    base: "max-w-full",
                    input: "resize-y min-h-[80px]",
                    inputWrapper: "font-normal text-default-500 bg-black/20 border-amber-900/30 data-[hover=true]:border-amber-700/50 group-data-[focus=true]:border-amber-600",
                  }}
                />
                
                <Button
                  type="submit"
                  color="primary"
                  size="lg"
                  isLoading={isSubmitting}
                  startContent={!isSubmitting && <IconSend className="w-4 h-4" />}
                  className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800"
                >
                  {isSubmitting ? '发送中...' : '发送消息'}
                </Button>
              </form>
              
              <div className="text-xs text-gray-400 text-center mt-4">
                <p>我们通常在24小时内回复您的消息</p>
                <p>紧急事务请直接拨打客服电话</p>
              </div>
            </div>
          </div>
        </ModalBody>
        
        <ModalFooter>
          <Button 
            color="secondary" 
            variant="light"
            onPress={onClose}
            className="text-gray-400 hover:text-gray-200"
          >
            关闭
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ContactModal; 