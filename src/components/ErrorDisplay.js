import React from 'react';
import { Button } from '@heroui/react';
import { IconAlertCircle, IconInfoCircle, IconAlertTriangle, IconRefresh } from '@tabler/icons-react';

/**
 * 错误显示组件
 * @param {Object} props 组件属性
 * @param {string} props.message 错误信息
 * @param {string} props.type 错误类型 (error, warning, info)
 * @param {Function} props.onRetry 重试回调函数
 * @param {boolean} props.showRetry 是否显示重试按钮
 */
const ErrorDisplay = ({ message, type = 'error', onRetry, showRetry = false }) => {
  // 根据类型确定样式
  const getTypeStyles = () => {
    switch (type) {
      case 'warning':
        return {
          container: 'border-amber-600/50 bg-amber-900/20',
          textColor: 'text-amber-300',
          icon: <IconAlertTriangle size={24} className="text-amber-400" />,
          title: '警告'
        };
      case 'info':
        return {
          container: 'border-blue-600/50 bg-blue-900/20',
          textColor: 'text-blue-300',
          icon: <IconInfoCircle size={24} className="text-blue-400" />,
          title: '提示'
        };
      case 'error':
      default:
        return {
          container: 'border-rose-600/50 bg-rose-900/20',
          textColor: 'text-rose-300',
          icon: <IconAlertCircle size={24} className="text-rose-400" />,
          title: '错误'
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div className={`${styles.container} border rounded-lg p-4 backdrop-blur-sm`}>
      <div className="flex items-start">
        <div className="flex-shrink-0 mr-3">
          {styles.icon}
        </div>
        <div className="flex-1">
          <p className={`font-medium ${styles.textColor}`}>{styles.title}</p>
          <p className="text-gray-300 mt-1">{message}</p>
          {showRetry && onRetry && (
            <Button
              onClick={onRetry}
              startContent={<IconRefresh size={16} />}
              size="sm"
              className="mt-3 bg-black/30 border border-gray-700 text-gray-300 hover:bg-black/50"
            >
              重试
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorDisplay; 