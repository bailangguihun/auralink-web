# 功能拓展与第三方 API 接入指南

本文档介绍如何在现有前端项目中接入新的第三方模型，并通过后端提供的接口记录调用日志与保存生成结果。

## 一、新增模型调用逻辑

1. 在 `src/app/models` 目录下新建文件，例如 `MyModel.js`。
2. 在文件中实现对第三方 API 的调用，并导出异步函数。

```javascript
// src/app/models/MyModel.js
export default async function MyModel(prompt, options) {
  const response = await fetch('https://example.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...options })
  });
  const data = await response.json();
  return data; // 根据第三方 API 的返回结构调整
}
```

3. 在页面或组件中引入该函数并调用即可开始推理。

## 二、记录调用与上传结果

项目后端提供了两个接口用于记录调用与上传生成的文件。一般的调用顺序如下：

1. **先调用 `/api/record`** 记录基础信息，获取 `logId`。
2. **再调用 `/api/upload-result`** 上传文件并补充记录。

### 1. `/api/record` 示例

```javascript
const recordRes = await fetch('/api/record', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    taskType: 'TEXT_TO_IMAGE',
    apiSource: 'THIRD_PARTY',
    apiProvider: 'ExampleAPI',
    inputData: JSON.stringify({ prompt }),
    success: true
  })
});
const { data: { logId } } = await recordRes.json();
```

### 2. `/api/upload-result` 示例

```javascript
const uploadRes = await fetch('/api/upload-result', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    logId,
    contentType: 'image',
    fileExtension: '.png',
    base64Data,
    description: '第三方模型返回的图片'
  })
});
const { data: { relativePath } } = await uploadRes.json();
```

通过 `relativePath` 拼接 `/api/files/` 即可得到在本地服务器上的访问地址。

## 三、完整工作流示例

```javascript
async function callThirdParty(prompt) {
  // 1. 调用第三方模型
  const result = await MyModel(prompt, {});

  // 2. 记录调用
  const recordResp = await fetch('/api/record', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskType: 'TEXT_TO_IMAGE',
      apiSource: 'THIRD_PARTY',
      apiProvider: 'ExampleAPI',
      inputData: JSON.stringify({ prompt }),
      outputData: JSON.stringify({ imageUrl: result.url }),
      success: true
    })
  });
  const { data: { logId } } = await recordResp.json();

  // 3. 下载并上传文件
  const blob = await fetch(result.url).then(r => r.blob());
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  await new Promise(res => reader.onload = res);
  const base64Data = reader.result.split(',')[1];

  const uploadResp = await fetch('/api/upload-result', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      logId,
      contentType: 'image',
      fileExtension: '.png',
      base64Data,
      description: '第三方模型返回的图片'
    })
  });

  const { data: { relativePath } } = await uploadResp.json();
  return `/api/files/${relativePath}`;
}
```

以上示例演示了完整的记录、上传与结果使用流程，可根据实际情况进行调整。

## 四、其他建议

- 新增的模型名称及任务类型需在 `src/app/generate/page.js` 的 `MODELS` 和 `TASK_TYPES` 中配置，以便在界面中选择。
- 若模型需要额外参数，可在 `src/config/advancedSettings.js` 中添加对应的设置项。
- 所有接口均需要携带有效的 JWT Token，请确保在请求头中正确设置 `Authorization`。
