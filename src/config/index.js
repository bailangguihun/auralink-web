// 应用配置文件
const config = {
  // API相关配置
  api: {
    baseUrl: 'http://localhost:5000/api',
    backendPath: '/data1/mingmeng/apps/backend-auralink/temp_uploads',
  },

  // MusicGen 相关配置
  musicgen: {
    baseUrl: 'http://localhost:8000',
    apiKey: "",
  },

  // 图生文模型配置
 Moyuqingyi: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7553617651843629102',
    uploadUrl: 'https://api.coze.cn/v1/files/upload',
    taskType: '墨语轻译'
  },

  Huaxufanyan: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7558533197300351027',
    uploadUrl: 'https://api.coze.cn/v1/files/upload',
    taskType: '画叙凡言'
  },

  Mojuanjieyu: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7559032378917126144',
    uploadUrl: 'https://api.coze.cn/v1/files/upload',
    taskType: '墨卷解语'
  },

  // 文生图模型配置
  moyundanqing1: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7559058177272381481',
    taskType: '墨韵丹青(1:1)'
  },
    moyundanqing2: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7559058331965718567',
    taskType: '墨韵丹青(4:3)'
  },
    moyundanqing3: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7559058997119860776',
    taskType: '墨韵丹青(9:16)'
  },

  // 文生文模型配置
  poetryToProseDS: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7553544502797123603',
    appId: '7553481417800712202',
    taskType: '诗映凡言（DeepSeek-V3.1）'
  },
  proseToPoetryDS: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7553544502797123603',
    appId: '7553481417800712202',
    taskType: '语化清辞（DeepSeek-V3.1）'
  },
  poetryToProseKIMI: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7553550423253254170',
    appId: '7553503663458304046',
    taskType: '诗映凡言（KIMI·K2）'
  },
  proseToPoetryKIMI: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7553550423253254170',
    appId: '7553503663458304046',
    taskType: '语化清辞（KIMI·K2）'
  },
  poetryToProseDOUBAO: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7553548736765689899',
    appId: '7553498798577401875',
    taskType: '诗映凡言（豆包·1.6）'
  },
  proseToPoetryDOUBAO: {
    baseUrl: 'https://api.coze.cn/v1/workflow/stream_run',
    token: "",
    workflowId: '7553548736765689899',
    appId: '7553498798577401875',
    taskType: '语化清辞（豆包·1.6）'
  },

  // 注册通道配置
  auth: {
    registerEnabled: true, // 控制注册通道是否开启
  },

  // 其他配置可以在这里添加
};

export default config;

