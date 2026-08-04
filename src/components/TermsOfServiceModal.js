import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, ScrollShadow } from '@heroui/react';
import { IconFileText, IconScale, IconShield, IconAlertTriangle, IconMail } from '@tabler/icons-react';

const TermsOfServiceModal = ({ isOpen, onClose }) => {
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
            <IconFileText className="w-6 h-6 text-amber-400" />
            <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
              画音智链使用条款
            </h2>
          </div>
          <p className="text-sm text-gray-400 font-normal">
            最后更新时间：2025年1月
          </p>
        </ModalHeader>
        
        <ModalBody>
          <ScrollShadow className="max-h-[60vh]">
            <div className="space-y-6 text-gray-200">
              
              {/* 接受条款 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconScale className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">接受条款</h3>
                </div>
                <p className="leading-relaxed text-sm">
                  欢迎使用画音智链！通过访问或使用我们的服务，您同意受本使用条款的约束。如果您不同意这些条款，请不要使用我们的服务。我们保留随时修改这些条款的权利，修改后的条款将在发布后立即生效。
                </p>
              </section>

              {/* 服务描述 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconFileText className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">服务描述</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">
                    画音智链是一个跨模态AI驱动的音画解码与生成平台，提供以下服务：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li>基于图像生成音乐的AI服务</li>
                    <li>基于声音绘制画作的AI服务</li>
                    <li>音画作品的存储和管理</li>
                    <li>创作工具和参数调节功能</li>
                    <li>作品分享和展示平台</li>
                  </ul>
                </div>
              </section>

              {/* 用户账户 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconShield className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">用户账户</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">账户注册</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>您必须年满13岁才能注册账户</li>
                      <li>提供真实、准确、完整的注册信息</li>
                      <li>及时更新账户信息以保持准确性</li>
                      <li>对账户安全负责，不得与他人共享账户</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">账户责任</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>您对账户下的所有活动负责</li>
                      <li>如发现账户被盗用，应立即通知我们</li>
                      <li>不得创建虚假账户或冒充他人</li>
                      <li>遵守所有适用的法律法规</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* 使用规则 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconAlertTriangle className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">使用规则</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">允许的使用</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>个人创作和艺术表达</li>
                      <li>教育和研究目的</li>
                      <li>非商业性质的分享和展示</li>
                      <li>遵循平台规则的商业使用</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">禁止的使用</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>上传违法、有害、威胁性或诽谤性内容</li>
                      <li>侵犯他人知识产权或隐私权</li>
                      <li>传播恶意软件或进行网络攻击</li>
                      <li>滥用服务或干扰平台正常运行</li>
                      <li>生成或传播不当、暴力或色情内容</li>
                      <li>商业性垃圾邮件或未经授权的广告</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* 知识产权 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconScale className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">知识产权</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">平台权利</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>画音智链的商标、logo、设计归我们所有</li>
                      <li>平台软件和技术受知识产权法保护</li>
                      <li>AI模型和算法为我们的专有技术</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-amber-200 mb-2">用户内容</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>您保留对上传内容的所有权</li>
                      <li>AI生成的作品版权归您所有</li>
                      <li>您授权我们使用您的内容来提供服务</li>
                      <li>您承诺拥有上传内容的合法权利</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* 服务可用性 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconShield className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">服务可用性</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">
                    我们努力保持服务的可用性，但不保证服务不会中断：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li>服务可能因维护、升级或技术问题暂停</li>
                    <li>我们不对服务中断造成的损失负责</li>
                    <li>保留随时修改或终止服务的权利</li>
                    <li>重要变更将提前通知用户</li>
                  </ul>
                </div>
              </section>

              {/* 免责声明 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconAlertTriangle className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">免责声明</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">
                    在法律允许的最大范围内：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li>服务按&nbsp;&quot;现状&quot;&nbsp;提供，不提供任何明示或暗示的保证</li>
                    <li>我们不保证服务的准确性、可靠性或完整性</li>
                    <li>不对AI生成内容的质量或适用性负责</li>
                    <li>不对用户使用服务产生的任何损失负责</li>
                    <li>不对第三方内容或链接负责</li>
                  </ul>
                </div>
              </section>

              {/* 责任限制 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconScale className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">责任限制</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">
                    在任何情况下，我们的责任不超过：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li>您在过去12个月内支付给我们的费用总额</li>
                    <li>不对间接、偶然或后果性损害负责</li>
                    <li>不对利润损失、数据丢失或业务中断负责</li>
                    <li>某些司法管辖区可能不允许责任限制</li>
                  </ul>
                </div>
              </section>

              {/* 争议解决 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconScale className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">争议解决</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm">
                    如发生争议，我们鼓励通过以下方式解决：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                    <li>首先通过友好协商解决</li>
                    <li>适用中华人民共和国法律</li>
                    <li>由北京市朝阳区人民法院管辖</li>
                    <li>仲裁作为替代争议解决方式</li>
                  </ul>
                </div>
              </section>

              {/* 条款修改 */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <IconFileText className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-semibold text-amber-300">条款修改</h3>
                </div>
                <p className="text-sm">
                  我们保留随时修改本使用条款的权利。重大修改将通过网站通知、邮件或其他适当方式告知您。修改后的条款在发布后立即生效。继续使用服务即表示您接受修改后的条款。
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

export default TermsOfServiceModal; 