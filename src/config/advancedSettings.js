// 高级设置配置文件
// 该文件定义了各种模型的高级设置参数、验证规则和元数据

export const ADVANCED_SETTINGS_CONFIG = {
  // MusicGen 系列模型配置
  musicgen: {
    // 适用的模型ID
    applicableModels: ['musicgen-small', 'musicgen-medium', 'musicgen-large'],
    // 适用的任务类型
    applicableTasks: ['text-to-music', 'image-to-music'],
    // 设置项定义
    settings: {
      temperature: {
        type: 'number',
        label: 'Temperature',
        description: '控制生成的随机性',
        helpText: '值越高生成结果越随机，值越低越确定',
        default: 1,
        min: 0,
        max: 2,
        step: 0.1,
        category: 'sampling'
      },
      top_k: {
        type: 'number',
        label: 'Top K',
        description: 'Top-K采样参数',
        helpText: '限制每步采样时考虑的候选数量',
        default: 250,
        min: 1,
        max: 1000,
        step: 1,
        category: 'sampling'
      },
      top_p: {
        type: 'number',
        label: 'Top P',
        description: 'Top-P采样参数',
        helpText: '核采样，控制采样时的概率累积阈值',
        default: 0,
        min: 0,
        max: 1,
        step: 0.1,
        category: 'sampling'
      },
      cfg_coef: {
        type: 'number',
        label: 'CFG Coef',
        description: '分类器自由引导系数',
        helpText: '控制生成结果与输入提示的匹配程度',
        default: 3,
        min: 0,
        max: 10,
        step: 0.1,
        category: 'guidance'
      },
      use_sampling: {
        type: 'boolean',
        label: 'Use Sampling',
        description: '是否使用采样',
        helpText: '启用后使用随机采样，禁用后使用贪心搜索',
        default: true,
        category: 'sampling'
      },
      two_step_cfg: {
        type: 'boolean',
        label: 'Two Step CFG',
        description: '是否使用两步CFG',
        helpText: '启用两步分类器自由引导以提高质量',
        default: false,
        category: 'guidance'
      }
    },
    // 设置分类（用于UI分组）
    categories: {
      sampling: {
        label: '采样设置',
        description: '控制生成过程的随机性和采样策略'
      },
      guidance: {
        label: '引导设置',
        description: '控制生成结果与输入的匹配程度'
      }
    }
  },

  // 可以添加其他模型的配置
  // 例如：Stable Diffusion 模型配置（示例，未实际使用）
  'stable-diffusion': {
    applicableModels: ['stable-diffusion-xl', 'stable-diffusion-3'],
    applicableTasks: ['text-to-image'],
    settings: {
      steps: {
        type: 'number',
        label: 'Steps',
        description: '推理步数',
        helpText: '更多步数通常产生更好的结果，但耗时更长',
        default: 20,
        min: 1,
        max: 100,
        step: 1,
        category: 'generation'
      },
      cfg_scale: {
        type: 'number',
        label: 'CFG Scale',
        description: '分类器自由引导缩放',
        helpText: '控制生成结果与提示的匹配程度',
        default: 7.5,
        min: 1,
        max: 20,
        step: 0.5,
        category: 'generation'
      },
      seed: {
        type: 'number',
        label: 'Seed',
        description: '随机种子',
        helpText: '使用相同种子可以重现相同结果，-1表示随机',
        default: -1,
        min: -1,
        max: 2147483647,
        step: 1,
        category: 'generation'
      }
    },
    categories: {
      generation: {
        label: '生成设置',
        description: '控制图像生成的质量和风格'
      }
    }
  },
};

// 工具函数：根据模型ID获取配置
export const getConfigForModel = (modelId) => {
  for (const [configKey, config] of Object.entries(ADVANCED_SETTINGS_CONFIG)) {
    if (config.applicableModels.includes(modelId)) {
      return { key: configKey, ...config };
    }
  }
  return null;
};

// 工具函数：检查模型是否支持高级设置
export const hasAdvancedSettings = (modelId, taskType) => {
  const config = getConfigForModel(modelId);
  if (!config) return false;
  
  return config.applicableTasks.includes(taskType);
};

// 工具函数：获取默认设置值
export const getDefaultSettings = (modelId) => {
  const config = getConfigForModel(modelId);
  if (!config) return {};
  
  const defaults = {};
  for (const [key, setting] of Object.entries(config.settings)) {
    defaults[key] = setting.default;
  }
  return defaults;
};

// 工具函数：验证设置值
export const validateSettingValue = (modelId, settingKey, value) => {
  const config = getConfigForModel(modelId);
  if (!config || !config.settings[settingKey]) {
    return { isValid: false, error: '无效的设置项' };
  }
  
  const setting = config.settings[settingKey];
  
  if (setting.type === 'number') {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return { isValid: false, error: '请输入有效数字' };
    }
    if (numValue < setting.min || numValue > setting.max) {
      return { isValid: false, error: `值必须在${setting.min}-${setting.max}之间` };
    }
    return { isValid: true, value: numValue };
  }
  
  if (setting.type === 'boolean') {
    return { isValid: true, value: Boolean(value) };
  }
  
  return { isValid: true, value };
};

// 工具函数：批量验证所有设置
export const validateAllSettings = (modelId, settings) => {
  const config = getConfigForModel(modelId);
  if (!config) return { isValid: false, errors: ['模型配置不存在'] };
  
  const errors = [];
  const validatedSettings = {};
  
  for (const [key, value] of Object.entries(settings)) {
    const validation = validateSettingValue(modelId, key, value);
    if (validation.isValid) {
      validatedSettings[key] = validation.value;
    } else {
      errors.push(`${key}: ${validation.error}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validatedSettings
  };
}; 