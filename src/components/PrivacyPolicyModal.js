import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, ScrollShadow } from '@heroui/react';
import { IconShield, IconEye, IconLock, IconDatabase, IconMail } from '@tabler/icons-react';

const PrivacyPolicyModal = ({ isOpen, onClose }) => {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="5xl"
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
            <IconShield className="w-6 h-6 text-amber-400" />
            <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
              画音智链隐私政策
            </h2>
          </div>
          <p className="text-sm text-gray-400 font-normal">
            最后更新时间：2025年1月
          </p>
        </ModalHeader>
        
        <ModalBody>
          <ScrollShadow className="max-h-[60vh]">
            <div className="space-y-6 text-gray-200">
              
              {/* 引言 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconEye className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">引言</h3>
                </div>
                <p className="leading-relaxed">
                  欢迎使用画音智链（&quot;我们&quot;、&quot;平台&quot;）！我们深知您的隐私对您的重要性，因此制定了本隐私政策来说明我们如何收集、使用、存储和保护您的个人信息。使用我们的服务即表示您同意本隐私政策的条款。
                </p>
              </section>

              {/* 信息收集 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconDatabase className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">我们收集的信息</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">1. 账户信息</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>用户名、邮箱地址、密码（加密存储）</li>
                      <li>个人资料信息（如头像、昵称等）</li>
                      <li>账户设置和偏好</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">2. 创作内容</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>您上传的图像、音频文件</li>
                      <li>AI生成的音画作品</li>
                      <li>创作参数和设置</li>
                      <li>作品标题、描述和标签</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">3. 使用数据</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>访问日志、IP地址、设备信息</li>
                      <li>浏览器类型和版本</li>
                      <li>使用时间、频率和模式</li>
                      <li>功能使用统计</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* 信息使用 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconLock className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">信息使用方式</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">服务提供</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>提供AI音画生成服务</li>
                      <li>保存和管理您的创作作品</li>
                      <li>个性化推荐和内容定制</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">服务改进</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>分析使用模式以优化用户体验</li>
                      <li>改进AI模型性能和准确性</li>
                      <li>开发新功能和服务</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">安全维护</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>防止欺诈和滥用行为</li>
                      <li>确保平台安全稳定运行</li>
                      <li>遵守法律法规要求</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* 信息共享 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconShield className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">信息共享与披露</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">
                    我们承诺不会出售、出租或以其他方式商业化您的个人信息。在以下情况下，我们可能会共享您的信息：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li><strong>经您同意：</strong>在获得您明确同意的情况下</li>
                    <li><strong>服务提供商：</strong>与可信的第三方服务提供商（如云存储、数据分析）</li>
                    <li><strong>法律要求：</strong>应法律法规、法院命令或政府要求</li>
                    <li><strong>安全保护：</strong>为保护我们或他人的权利、财产或安全</li>
                    <li><strong>业务转让：</strong>在合并、收购或资产转让情况下</li>
                  </ul>
                </div>
              </section>

              {/* 数据安全 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconLock className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">数据安全</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">
                    我们采用行业标准的安全措施来保护您的个人信息：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li>数据传输采用SSL/TLS加密</li>
                    <li>敏感信息采用高级加密算法存储</li>
                    <li>定期进行安全审计和漏洞扫描</li>
                    <li>严格的访问控制和权限管理</li>
                    <li>员工安全培训和保密协议</li>
                  </ul>
                </div>
              </section>

              {/* 用户权利 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconEye className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">您的权利</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">您对自己的个人信息享有以下权利：</p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li><strong>访问权：</strong>查看我们持有的您的个人信息</li>
                    <li><strong>更正权：</strong>更新或修正不准确的信息</li>
                    <li><strong>删除权：</strong>要求删除您的个人信息</li>
                    <li><strong>限制权：</strong>限制我们处理您的信息</li>
                    <li><strong>可携权：</strong>以结构化格式获取您的数据</li>
                    <li><strong>反对权：</strong>反对我们处理您的信息</li>
                  </ul>
                </div>
              </section>

              {/* Cookie政策 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconDatabase className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">Cookie和类似技术</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">
                    我们使用Cookie和类似技术来改善您的体验：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li><strong>必要Cookie：</strong>确保网站正常运行</li>
                    <li><strong>功能Cookie：</strong>记住您的偏好设置</li>
                    <li><strong>分析Cookie：</strong>了解网站使用情况</li>
                    <li><strong>营销Cookie：</strong>提供个性化内容</li>
                  </ul>
                  <p className="text-sm mt-2">
                    您可以通过浏览器设置管理Cookie偏好。
                  </p>
                </div>
              </section>

              {/* 数据保留 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconDatabase className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">数据保留</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">
                    我们仅在必要期间保留您的个人信息：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li>账户信息：账户存续期间及注销后30天</li>
                    <li>创作内容：根据您的设置，可永久保存或定期清理</li>
                    <li>使用日志：通常保留12个月</li>
                    <li>法律要求：按照适用法律规定的期限</li>
                  </ul>
                </div>
              </section>

              {/* 儿童隐私 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconShield className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">儿童隐私保护</h3>
                </div>
                <p className="text-sm">
                  我们的服务面向13岁以上用户。我们不会故意收集13岁以下儿童的个人信息。如果我们发现收集了此类信息，将立即删除。如果您认为我们可能持有13岁以下儿童的信息，请联系我们。
                </p>
              </section>

              {/* 政策更新 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconEye className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">政策更新</h3>
                </div>
                <p className="text-sm">
                  我们可能会不时更新本隐私政策。重大变更将通过网站通知、邮件或其他适当方式告知您。继续使用我们的服务即表示您接受更新后的政策。
                </p>
              </section>

            </div>
          </ScrollShadow>
        </ModalBody>
        
        <ModalFooter>
          <Button 
            color="primary" 
            onPress={onClose}
            className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800"
          >
            我已了解
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default PrivacyPolicyModal; 