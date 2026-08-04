import React from 'react';
import { Spinner, Progress } from "@heroui/react";

/**
 * 加载状态组件
 * @param {Object} props 组件属性
 * @param {string} props.message 加载信息
 * @param {string} props.subMessage 次要信息
 * @param {string} props.size 加载图标大小 (sm, md, lg)
 * @param {boolean} props.showProgress 是否显示进度条
 * @param {number} props.progress 进度值 (0-100)
 */
const LoadingState = ({ 
  message = "加载中...", 
  subMessage, 
  size = "md", 
  showProgress = true, 
  progress = 0 
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-6">
      <Spinner 
        size={size === "sm" ? "md" : size === "md" ? "lg" : "xl"}
        color="warning"
        className="mb-4"
      />
      
      <div className="text-center">
        <p className="text-amber-300 font-medium">{message}</p>
        {subMessage && (
          <p className="text-gray-400 text-sm mt-1">{subMessage}</p>
        )}
      </div>
      
      {showProgress && (
        <div className="w-full max-w-md mt-6">
          <Progress 
            value={progress} 
            color="warning"
            size="sm"
            radius="sm"
            classNames={{
              base: "max-w-md",
              track: "bg-black/30 border border-amber-900/30",
              indicator: "bg-gradient-to-r from-amber-500 to-amber-600",
              value: "text-amber-300 font-semibold"
            }}
            showValueLabel={true}
          />
        </div>
      )}
    </div>
  );
};

export default LoadingState; 